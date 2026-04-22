"use server";

import { createClient } from "@/helper/lib/supabase/server";
import {
  ALL_SEGMENTS,
  SEGMENT_LABELS,
  type ReengagementSegment,
  type ReengagementTemplate,
} from "../types";

const DEFAULT_MESSAGES: Record<ReengagementSegment, string> = {
  first_visit_30d:
    "{customer_name} 様\n\n先日は {shop_name} にご来院いただきありがとうございました。\n\n初回施術後、お体の変化はいかがでしょうか?\n当院では 2 回目の施術での変化を特に大切にしております。\n\n{coupon_name}\n\nご予約お待ちしております。",
  dormant_60d:
    "{customer_name} 様\n\n{shop_name} です。ご無沙汰しております。\n最後のご来院から時間が空いておりますが、お体の調子はいかがでしょうか?\n\n気になる不調やケアのご相談、いつでもお気軽にどうぞ。\n\n{coupon_name}",
  plan_expired:
    "{customer_name} 様\n\n{shop_name} です。\nご契約中の会員プランがちょうど終了のタイミングを迎えております。\n\n続けて通っていただいた分だけお体の変化も出やすくなります。\nプラン更新のご相談も承っておりますので、お気軽にご連絡ください。\n\n{coupon_name}",
};

/**
 * ブランド / 店舗スコープで各セグメントのテンプレートを返す。
 *
 * 取得優先順:
 *   1. shop_id 指定のテンプレがあればそれ
 *   2. 無ければ shop_id IS NULL (ブランド共通)
 *   3. どちらも無ければ null
 *
 * セグメントは ALL_SEGMENTS の全てを返す (存在しないものは id=null で
 * デフォルト文言を入れる)。管理画面は常に 3 行表示される想定。
 */
export async function getTemplatesForShop(
  brandId: number,
  shopId: number
): Promise<Record<ReengagementSegment, ReengagementTemplate>> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("reengagement_templates")
    .select("*")
    .eq("brand_id", brandId)
    .or(`shop_id.is.null,shop_id.eq.${shopId}`)
    .is("deleted_at", null);

  const result: Partial<Record<ReengagementSegment, ReengagementTemplate>> =
    {};

  for (const row of (data ?? []) as Array<Record<string, unknown>>) {
    const seg = row.segment as ReengagementSegment;
    const prev = result[seg];
    const rowShopId = row.shop_id as number | null;
    // shop_id マッチがあれば優先、それ以外はブランド共通で上書き。
    if (!prev || (prev.shopId === null && rowShopId === shopId)) {
      result[seg] = {
        id: row.id as number,
        brandId: row.brand_id as number,
        shopId: rowShopId,
        segment: seg,
        title: row.title as string,
        message: row.message as string,
        couponMenuManageId:
          (row.coupon_menu_manage_id as string | null) ?? null,
        cooldownDays: (row.cooldown_days as number) ?? 30,
        isActive: !!row.is_active,
      };
    }
  }

  // 不足分はデフォルトで穴埋め
  for (const seg of ALL_SEGMENTS) {
    if (!result[seg]) {
      result[seg] = {
        id: null,
        brandId,
        shopId: null,
        segment: seg,
        title: SEGMENT_LABELS[seg],
        message: DEFAULT_MESSAGES[seg],
        couponMenuManageId: null,
        cooldownDays: 30,
        isActive: true,
      };
    }
  }

  return result as Record<ReengagementSegment, ReengagementTemplate>;
}
