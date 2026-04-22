import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/helper/lib/supabase/server";
import { getSegmentCustomers } from "@/feature/reengagement/services/getSegmentCustomers";
import { sendReengagementCampaign } from "@/feature/reengagement/actions/reengagementActions";
import type { ReengagementSegment } from "@/feature/reengagement/types";

/**
 * Cron endpoint — 再来店促進の自動配信。
 *
 * 想定デプロイ:
 *   - Vercel Cron (vercel.json に path + schedule を追加)
 *       {"crons": [{"path": "/api/cron/reengagement", "schedule": "0 0 * * *"}]}
 *       (毎日 UTC 0:00 = JST 9:00)
 *   - 外部 cron から GET https://.../api/cron/reengagement
 *       Authorization: Bearer <CRON_SECRET>  (CRON_SECRET が設定されて
 *       いれば必須)
 *
 * 動作:
 *   1. reengagement_templates で auto_send_enabled=TRUE かつ is_active=TRUE
 *      なテンプレートを全ブランド分ロード
 *   2. 各テンプレについて:
 *      (a) scope = テンプレの shop_id、NULL ならブランド配下の全店舗
 *      (b) 店舗 × セグメントで getSegmentCustomers を呼ぶ
 *      (c) 返ってきた顧客のうち lastSentAt が null (cooldown 未該当) だけ
 *          抽出して sendReengagementCampaign に流す
 *   3. ブランド × 店舗 × セグメント単位で集計結果を返す
 *
 * 冪等性:
 *   - cooldown_days は sendReengagementCampaign 側でも最終チェックするので、
 *     cron の多重実行でも同一顧客に重複送信されない (reengagement_logs で
 *     履歴を確認)。
 */

function requireCronAuth(request: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return true;
  const auth = request.headers.get("authorization") ?? "";
  return auth === `Bearer ${secret}`;
}

interface TemplateRow {
  id: number;
  brand_id: number;
  shop_id: number | null;
  segment: ReengagementSegment;
  cooldown_days: number;
}

interface CampaignResultRow {
  brand_id: number;
  shop_id: number;
  segment: ReengagementSegment;
  targeted: number;
  sent: number;
  failed: number;
  skipped_cooldown: number;
  skipped_no_contact: number;
  coupons_issued: number;
  error?: string;
}

export async function GET(request: NextRequest) {
  if (!requireCronAuth(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = await createClient();

  // 1. auto_send_enabled なテンプレをロード
  let templates: TemplateRow[] = [];
  try {
    const { data, error } = await supabase
      .from("reengagement_templates")
      .select("id, brand_id, shop_id, segment, cooldown_days")
      .eq("is_active", true)
      .eq("auto_send_enabled", true)
      .is("deleted_at", null);
    if (error) {
      // auto_send_enabled カラム未適用環境へのフォールバック:
      // カラム不足時は 0 件として扱い、cron は無害に終了する。
      if (error.message?.includes("auto_send_enabled")) {
        return NextResponse.json({
          processed_at: new Date().toISOString(),
          skipped: "migration_pending",
          message:
            "migration 00027 (auto_send_enabled) 未適用のため cron はスキップされました。",
        });
      }
      throw error;
    }
    templates = (data ?? []) as TemplateRow[];
  } catch (e) {
    return NextResponse.json(
      {
        error:
          e instanceof Error ? e.message : "template load failed",
      },
      { status: 500 }
    );
  }

  if (templates.length === 0) {
    return NextResponse.json({
      processed_at: new Date().toISOString(),
      total_templates: 0,
      total_sent: 0,
      details: [] as CampaignResultRow[],
    });
  }

  // 2. ブランド別ショップ一覧をまとめて引いておく (テンプレ shop_id=NULL 展開用)
  const brandIds = Array.from(new Set(templates.map((t) => t.brand_id)));
  const { data: shopsData } = await supabase
    .from("shops")
    .select("id, brand_id")
    .in("brand_id", brandIds)
    .is("deleted_at", null);
  const shopsByBrand = new Map<number, number[]>();
  for (const row of (shopsData ?? []) as Array<{
    id: number;
    brand_id: number;
  }>) {
    const list = shopsByBrand.get(row.brand_id) ?? [];
    list.push(row.id);
    shopsByBrand.set(row.brand_id, list);
  }

  // 3. 各テンプレを展開して配信
  const details: CampaignResultRow[] = [];

  for (const tmpl of templates) {
    const shopIds =
      tmpl.shop_id != null
        ? [tmpl.shop_id]
        : shopsByBrand.get(tmpl.brand_id) ?? [];

    for (const shopId of shopIds) {
      // 当該 shop 限定のテンプレが存在する場合は、ブランド共通テンプレは
      // スキップ (shop 側が優先される運用)。二重送信防止。
      if (tmpl.shop_id == null) {
        const { data: shopSpecific } = await supabase
          .from("reengagement_templates")
          .select("id")
          .eq("brand_id", tmpl.brand_id)
          .eq("shop_id", shopId)
          .eq("segment", tmpl.segment)
          .eq("auto_send_enabled", true)
          .is("deleted_at", null)
          .limit(1);
        if ((shopSpecific ?? []).length > 0) continue;
      }

      // 候補顧客取得
      let customers;
      try {
        customers = await getSegmentCustomers(
          shopId,
          tmpl.segment,
          tmpl.cooldown_days
        );
      } catch (e) {
        details.push({
          brand_id: tmpl.brand_id,
          shop_id: shopId,
          segment: tmpl.segment,
          targeted: 0,
          sent: 0,
          failed: 0,
          skipped_cooldown: 0,
          skipped_no_contact: 0,
          coupons_issued: 0,
          error: e instanceof Error ? e.message : "segment load failed",
        });
        continue;
      }

      // cooldown 未該当 (lastSentAt === null) だけ対象に
      const targetIds = customers
        .filter((c) => c.lastSentAt === null)
        .map((c) => c.id);

      if (targetIds.length === 0) {
        details.push({
          brand_id: tmpl.brand_id,
          shop_id: shopId,
          segment: tmpl.segment,
          targeted: 0,
          sent: 0,
          failed: 0,
          skipped_cooldown: 0,
          skipped_no_contact: 0,
          coupons_issued: 0,
        });
        continue;
      }

      const res = await sendReengagementCampaign({
        brandId: tmpl.brand_id,
        shopId,
        segment: tmpl.segment,
        customerIds: targetIds,
      });

      details.push({
        brand_id: tmpl.brand_id,
        shop_id: shopId,
        segment: tmpl.segment,
        targeted: targetIds.length,
        sent: res.sent,
        failed: res.failed,
        skipped_cooldown: res.skippedCooldown,
        skipped_no_contact: res.skippedNoContact,
        coupons_issued: res.couponsIssued,
        error: res.error,
      });
    }
  }

  const totalSent = details.reduce((s, r) => s + r.sent, 0);

  return NextResponse.json({
    processed_at: new Date().toISOString(),
    total_templates: templates.length,
    total_sent: totalSent,
    details,
  });
}
