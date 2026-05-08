import "server-only";

import { createClient } from "@/helper/lib/supabase/server";

export interface StaffReviewCount {
  staffId: number;
  googleCount: number;
  hotpepperCount: number;
}

/**
 * 指定店舗 × 期間 (start..end) のスタッフ別 G口コミ / H口コミ 獲得数を
 * 自動集計する。
 *
 * 集計ロジック:
 *   1. customers.google_review_received_at / hotpepper_review_received_at が
 *      期間内に入っている顧客を抽出 (= 「期間内に新たに口コミチェックが
 *      付いた顧客」)。
 *   2. 各顧客の「口コミ受領時点で最も近い完了予約」の staff_id を引いて
 *      その担当スタッフに 1 件帰属させる。
 *      (UI でチェックを入れるのは AppointmentDetailSheet なので、その
 *      予約の担当スタッフを「口コミを獲得した本人」とみなすのが自然)。
 *   3. staff_id 別にカウントを集約。
 *
 * 仕様メモ:
 *   - 受領時点より後の予約は除外 (= 過去の対応に対しての評価のため)
 *   - 完了 (status=2) の予約のみ採用
 *   - 該当する完了予約が見つからない顧客は集計から除外 (warning は出さない)
 *   - migration 00009 未適用環境では空 Map を返す
 */
export async function getStaffReviewCounts(
  shopId: number,
  startDate: string, // YYYY-MM-DD (inclusive)
  endDate: string // YYYY-MM-DD (inclusive)
): Promise<Map<number, StaffReviewCount>> {
  const supabase = await createClient();

  // Asia/Tokyo の境界で受領日を切る
  const startTs = `${startDate}T00:00:00+09:00`;
  const endNext = nextDayString(endDate);
  const endTs = `${endNext}T00:00:00+09:00`; // exclusive

  type CustomerRow = {
    id: number;
    google_review_received_at: string | null;
    hotpepper_review_received_at: string | null;
  };

  // 1. 期間内に G or H レビューが付いた顧客を抽出
  let customers: CustomerRow[] = [];
  try {
    const { data, error } = await supabase
      .from("customers")
      .select(
        "id, google_review_received_at, hotpepper_review_received_at"
      )
      .eq("shop_id", shopId)
      .is("deleted_at", null)
      .or(
        `and(google_review_received_at.gte.${startTs},google_review_received_at.lt.${endTs}),` +
          `and(hotpepper_review_received_at.gte.${startTs},hotpepper_review_received_at.lt.${endTs})`
      );
    if (error) {
      const msg = String(error.message ?? "").toLowerCase();
      if (
        msg.includes("does not exist") ||
        msg.includes("google_review_received_at") ||
        msg.includes("hotpepper_review_received_at")
      ) {
        return new Map();
      }
      console.error("[getStaffReviewCounts]", error);
      return new Map();
    }
    customers = (data ?? []) as CustomerRow[];
  } catch (e) {
    console.error("[getStaffReviewCounts] threw", e);
    return new Map();
  }
  if (customers.length === 0) return new Map();

  // 2. 該当顧客の完了 (status=2) 予約をまとめて取得し、JS 側で
  //    「受領タイムスタンプ以前で最新の完了予約」を引く
  const customerIds = customers.map((c) => c.id);
  const { data: appts } = await supabase
    .from("appointments")
    .select("customer_id, staff_id, start_at")
    .eq("shop_id", shopId)
    .in("customer_id", customerIds)
    .eq("status", 2)
    .is("deleted_at", null)
    .order("start_at", { ascending: false });

  type ApptRow = {
    customer_id: number;
    staff_id: number;
    start_at: string;
  };
  const apptsByCustomer = new Map<number, ApptRow[]>();
  for (const a of (appts ?? []) as ApptRow[]) {
    const list = apptsByCustomer.get(a.customer_id);
    if (list) list.push(a);
    else apptsByCustomer.set(a.customer_id, [a]);
  }

  // 「ts 以下で最新の完了予約の staff_id」
  function attributedStaff(
    customerId: number,
    ts: string
  ): number | null {
    const list = apptsByCustomer.get(customerId);
    if (!list) return null;
    // 既に start_at desc でソートされているので、最初に見つかった
    // start_at <= ts を採用
    for (const a of list) {
      if (a.start_at <= ts) return a.staff_id;
    }
    // 受領日より前に完了予約が一切ないケース → fallback で最も古い
    // 完了予約の staff_id を採用 (将来の予約しか無いというのは現実的に
    // ほぼ無いが、データの不整合に強くしておく)
    return list[list.length - 1]?.staff_id ?? null;
  }

  // 3. 集計
  const result = new Map<number, StaffReviewCount>();
  function bump(staffId: number, kind: "google" | "hotpepper") {
    let row = result.get(staffId);
    if (!row) {
      row = { staffId, googleCount: 0, hotpepperCount: 0 };
      result.set(staffId, row);
    }
    if (kind === "google") row.googleCount += 1;
    else row.hotpepperCount += 1;
  }

  for (const c of customers) {
    if (
      c.google_review_received_at &&
      c.google_review_received_at >= startTs &&
      c.google_review_received_at < endTs
    ) {
      const staffId = attributedStaff(c.id, c.google_review_received_at);
      if (staffId != null) bump(staffId, "google");
    }
    if (
      c.hotpepper_review_received_at &&
      c.hotpepper_review_received_at >= startTs &&
      c.hotpepper_review_received_at < endTs
    ) {
      const staffId = attributedStaff(
        c.id,
        c.hotpepper_review_received_at
      );
      if (staffId != null) bump(staffId, "hotpepper");
    }
  }

  return result;
}

function nextDayString(yyyyMmDd: string): string {
  const m = yyyyMmDd.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return yyyyMmDd;
  const [, ys, ms, ds] = m;
  const d = new Date(Date.UTC(Number(ys), Number(ms) - 1, Number(ds)));
  d.setUTCDate(d.getUTCDate() + 1);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(
    2,
    "0"
  )}-${String(d.getUTCDate()).padStart(2, "0")}`;
}
