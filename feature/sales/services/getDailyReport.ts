"use server";

import { createClient } from "@/helper/lib/supabase/server";
import { toLocalDateString } from "@/helper/utils/time";

/**
 * appointments.payment_splits (JSONB) を型付き配列に変換。
 * 期待形式は [{method: string, amount: number}, …]。形式が崩れていれば
 * null を返して呼び出し側で payment_method への単一フォールバックさせる。
 */
function parsePaymentSplits(
  raw: unknown
): Array<{ method: string; amount: number }> | null {
  if (!Array.isArray(raw) || raw.length === 0) return null;
  const out: Array<{ method: string; amount: number }> = [];
  for (const r of raw) {
    if (!r || typeof r !== "object") continue;
    const rec = r as { method?: unknown; amount?: unknown };
    const method = typeof rec.method === "string" ? rec.method : "";
    const amount = Number(rec.amount);
    if (!method || !Number.isFinite(amount) || amount < 0) continue;
    out.push({ method, amount: Math.round(amount) });
  }
  return out.length > 0 ? out : null;
}

/**
 * Daily sales report aggregation.
 *
 * One row per day. Each row contains:
 *   - visit / cancel counts
 *   - new vs continuing sales (店舗の売上)
 *   - per-payment-method totals
 *   - per-source new-customer counts
 *
 * 新規 vs 継続 rule (per spec):
 *   新規 = (a) the customer's first visit (visit_count === 1) OR
 *         (b) the customer's first ever appointment with
 *             is_member_join = true (i.e. first time joining a plan)
 *   継続 = everything else
 *
 * Implementation: pulls completed appointments in the date range, plus
 * the customers' member-join history (any time) so we can flag the
 * earliest join per customer. Aggregation is in-memory.
 */

export interface PaymentTotal {
  code: string;        // raw payment_method string ("cash", "square", ...)
  label: string;       // resolved name (e.g. "現金", "Square")
  amount: number;
}

export interface SourceCount {
  visitSourceId: number;
  sourceName: string;
  newCount: number;
}

export interface DailyRow {
  date: string;            // YYYY-MM-DD (Asia/Tokyo)
  reservationCount: number;
  visitCount: number;      // status 1 or 2
  cancelCount: number;     // status 3, 4, 99
  newCount: number;        // appointments classified as 新規 (sales counted)
  continuingCount: number; // appointments classified as 継続
  newSales: number;
  continuingSales: number;
  totalSales: number;
  /** 消化売上: 当日完了の予約の consumed_amount 合計
   *  (前金で売ったプランが実来店で消化された金額。totalSales とは別軸) */
  consumedSales: number;
  payments: PaymentTotal[];
  newBySource: SourceCount[];
}

export interface DailyReportData {
  rows: DailyRow[];
  totals: {
    reservationCount: number;
    visitCount: number;
    cancelCount: number;
    newCount: number;
    continuingCount: number;
    newSales: number;
    continuingSales: number;
    totalSales: number;
    consumedSales: number;
  };
  meta: {
    startDate: string;
    endDate: string;
    shopId: number;
  };
}

const PAYMENT_LABELS: Record<string, string> = {
  cash: "現金",
  credit: "クレジット",
  card: "カード",
  square: "Square",
  paypay: "PayPay",
  line: "LINE Pay",
  bank: "銀行振込",
  other: "その他",
};

function dayInTokyo(iso: string): string {
  // appointments.start_at は UI から "YYYY-MM-DDTHH:MM:00" (TZ なし) で
  // 投入されているため、Supabase 側で UTC として保存されるが、クロック
  // 値としては JST (= ユーザーが画面で指定した時刻) がそのまま入って
  // いる。したがって UTC→JST の +9h シフトをすると JST 15:00 以降が
  // 翌日扱いになってしまう (15+9=24 で日付が繰り上がる) のが原因。
  //
  // 文字列の先頭 10 文字 (YYYY-MM-DD) がそのまま JST 日付として正しい
  // ので、パース無しで slice するだけで OK。
  return iso.slice(0, 10);
}

export async function getDailyReport(
  shopId: number,
  startDate: string,
  endDate: string
): Promise<DailyReportData> {
  const supabase = await createClient();

  // Daily report = past + today only. Clamp the upper bound to today
  // (Asia/Tokyo) so future-dated bookings don't pollute the report —
  // those belong on the calendar, not the daily numbers.
  const today = toLocalDateString(new Date());
  const effectiveEnd = endDate > today ? today : endDate;

  // Day-exclusive upper bound (start_at < end + 1)
  const nextDate = new Date(effectiveEnd + "T00:00:00");
  nextDate.setDate(nextDate.getDate() + 1);
  const nextDateStr = toLocalDateString(nextDate);

  // 1. All appointments in range for this shop
  const { data: apptRes, error: apptErr } = await supabase
    .from("appointments")
    .select(
      "id, customer_id, status, start_at, sales, consumed_amount, additional_charge, additional_charge_consume_timing, visit_count, is_member_join, payment_method, payment_splits, visit_source_id, cancelled_at"
    )
    .eq("shop_id", shopId)
    .gte("start_at", `${startDate}T00:00:00`)
    .lt("start_at", `${nextDateStr}T00:00:00`)
    .is("deleted_at", null)
    .order("start_at");
  if (apptErr) {
    return emptyReport(shopId, startDate, endDate);
  }
  const appointments = (apptRes ?? []) as Array<{
    id: number;
    customer_id: number;
    status: number;
    start_at: string;
    sales: number | null;
    consumed_amount: number | null;
    additional_charge: number | null;
    additional_charge_consume_timing: string | null;
    visit_count: number | null;
    is_member_join: boolean | null;
    payment_method: string | null;
    payment_splits?: unknown;
    visit_source_id: number | null;
  }>;

  // 1a. 追加料金の「次回で消化」キャリーオーバーを計算。
  //
  // 仕組み:
  //   - timing='next' の appointment X (= 追加料金 N 円を次回に持ち越し)
  //   - その顧客の "X より後" の最古の完了 (status=2) appointment Y を探す
  //   - Y の日に N 円を消化売上として加算する (= Y の deferredApplied[Y.id] += N)
  //   - X 自身の当日消化からは N 円を除外する (timing='next' なので)
  //
  // 期間外の X が期間内の Y に持ち越されるケースも拾いたいので、shop の
  // 全 timing='next' な完了予約を別クエリで取得して照合する。
  const deferredAppliedByApptId = new Map<number, number>();
  {
    // 期間内に登場する appointments の customer_id をユニーク化
    const periodCustomerIds = Array.from(
      new Set(
        appointments
          .map((a) => a.customer_id as number | null)
          .filter((id): id is number => id != null)
      )
    );
    if (periodCustomerIds.length > 0) {
      // 顧客ごとの全完了予約 (期間外含む) を時系列で取得
      const { data: histRows } = await supabase
        .from("appointments")
        .select(
          "id, customer_id, start_at, status, additional_charge, additional_charge_consume_timing"
        )
        .eq("shop_id", shopId)
        .in("customer_id", periodCustomerIds)
        .eq("status", 2)
        .is("deleted_at", null)
        .order("start_at", { ascending: true });
      type Hist = {
        id: number;
        customer_id: number;
        additional_charge: number | null;
        additional_charge_consume_timing: string | null;
      };
      const byCustomer = new Map<number, Hist[]>();
      for (const r of (histRows ?? []) as Hist[]) {
        const arr = byCustomer.get(r.customer_id) ?? [];
        arr.push(r);
        byCustomer.set(r.customer_id, arr);
      }
      for (const [, list] of byCustomer) {
        // list は start_at ASC
        for (let i = 0; i < list.length; i++) {
          const r = list[i];
          if (
            r.additional_charge_consume_timing === "next" &&
            (r.additional_charge ?? 0) > 0
          ) {
            // 次の完了予約 Y を探す
            const next = list[i + 1];
            if (next) {
              deferredAppliedByApptId.set(
                next.id,
                (deferredAppliedByApptId.get(next.id) ?? 0) +
                  (r.additional_charge ?? 0)
              );
            }
            // 注: 自身は当日消化から差し引く (集計ループ側で
            //     additional_charge_consume_timing='next' を見て減算する)。
            // 注: 次の完了予約が無い場合は「持ち越し未消化」のままになる。
            //     現状はその金額は消化売上に計上しない (顧客が次回来ない
            //     限り計上できない、という解釈)。
          }
        }
      }
    }
  }

  // 1b. プラン購入価格を appointment 単位で集計。
  //
  //   消化売上 = (sales + consumed_amount) - plan_purchase_price_on_this_appt
  //
  //   - sales には「プラン購入額 (前受金)」が含まれていることがある。
  //     前受金は実サービス提供時に按分で計上したいので、購入分は
  //     消化売上から差し引く。
  //   - consumed_amount はそのプランの 当日 1 回分の消化額 (前受金の按分)。
  //
  //   結果として「その日に提供したサービスの価値」(= 消化売上) が出る。
  //   通常の有料メニュー (¥2,000 等) は sales に乗り、購入分の差し引きが
  //   無いので そのまま 消化売上に計上される。
  const apptIds = appointments.map((a) => a.id);
  const planPurchasePriceByApptId = new Map<number, number>();
  if (apptIds.length > 0) {
    const { data: plansBoughtHere } = await supabase
      .from("customer_plans")
      .select("purchased_appointment_id, price_snapshot")
      .in("purchased_appointment_id", apptIds)
      .is("deleted_at", null);
    for (const p of (plansBoughtHere ?? []) as Array<{
      purchased_appointment_id: number;
      price_snapshot: number | null;
    }>) {
      if (!p.purchased_appointment_id) continue;
      planPurchasePriceByApptId.set(
        p.purchased_appointment_id,
        (planPurchasePriceByApptId.get(p.purchased_appointment_id) ?? 0) +
          (p.price_snapshot ?? 0)
      );
    }
  }

  // 2. For customers who have a member-join in this range, look up their
  //    earliest member-join globally so we can decide if THIS appointment
  //    is the customer's first plan purchase (= 新規 by rule b).
  const customerIdsWithJoinInRange = Array.from(
    new Set(
      appointments
        .filter((a) => a.is_member_join && a.status === 2)
        .map((a) => a.customer_id)
    )
  );
  const earliestJoinByCustomer = new Map<number, string>();
  if (customerIdsWithJoinInRange.length > 0) {
    const { data: joinHistory } = await supabase
      .from("appointments")
      .select("customer_id, start_at")
      .in("customer_id", customerIdsWithJoinInRange)
      .eq("is_member_join", true)
      .eq("status", 2)
      .is("deleted_at", null)
      .order("start_at", { ascending: true });
    for (const r of (joinHistory ?? []) as Array<{
      customer_id: number;
      start_at: string;
    }>) {
      if (!earliestJoinByCustomer.has(r.customer_id)) {
        earliestJoinByCustomer.set(r.customer_id, r.start_at);
      }
    }
  }

  // 3. Resolve visit_source names (single lookup)
  const sourceIds = Array.from(
    new Set(
      appointments
        .map((a) => a.visit_source_id)
        .filter((id): id is number => typeof id === "number")
    )
  );
  const sourceNameMap = new Map<number, string>();
  if (sourceIds.length > 0) {
    const { data: sources } = await supabase
      .from("visit_sources")
      .select("id, name")
      .in("id", sourceIds);
    for (const s of sources ?? []) {
      sourceNameMap.set(s.id as number, s.name as string);
    }
  }

  // 4. Bucket by Tokyo day
  const byDay = new Map<string, DailyRow>();
  // Internal accumulators that aren't part of the final shape
  const paymentBuckets = new Map<string, Map<string, number>>(); // day → code → amount
  const sourceBuckets = new Map<string, Map<number, number>>();  // day → sourceId → newCount

  function getDay(dateStr: string): DailyRow {
    let row = byDay.get(dateStr);
    if (!row) {
      row = {
        date: dateStr,
        reservationCount: 0,
        visitCount: 0,
        cancelCount: 0,
        newCount: 0,
        continuingCount: 0,
        newSales: 0,
        continuingSales: 0,
        totalSales: 0,
        consumedSales: 0,
        payments: [],
        newBySource: [],
      };
      byDay.set(dateStr, row);
      paymentBuckets.set(dateStr, new Map());
      sourceBuckets.set(dateStr, new Map());
    }
    return row;
  }

  for (const a of appointments) {
    const day = dayInTokyo(a.start_at);
    const row = getDay(day);
    row.reservationCount += 1;

    const isCancel = a.status === 3 || a.status === 4 || a.status === 99;
    const isVisit = a.status === 1 || a.status === 2;
    const isComplete = a.status === 2;

    if (isCancel) row.cancelCount += 1;
    // 来店 = 完了 (status=2) のみ。施術中 (status=1) は売上が確定して
    // いないので新規/継続にも乗らない。来店数を新規+継続と一致させる
    // ため、ここも status=2 限定にする。
    if (isComplete) row.visitCount += 1;
    // isVisit は予約数や経路集計には不要なので参照しないが、将来用に
    // 計算自体は残しておく (lint で「使われてない」と言われないよう
    // void 評価)。
    void isVisit;

    if (isComplete) {
      // 新規 vs 継続 classification
      // sales=0 の完了予約 (会員プラン消化のみで現金 0 円の来店など)
      // も「来店」に含まれるので、ここで分類しないと
      //   来店数 ≠ 新規 + 継続
      // という差異が出る。a.sales の有無に関わらず分類する。
      let isNew = false;
      if ((a.visit_count ?? 0) === 1) {
        isNew = true;
      } else if (a.is_member_join) {
        const earliest = earliestJoinByCustomer.get(a.customer_id);
        if (earliest && earliest === a.start_at) {
          isNew = true;
        }
      }

      const salesAmt = a.sales ?? 0;
      if (isNew) {
        row.newSales += salesAmt;
        row.newCount += 1;
      } else {
        row.continuingSales += salesAmt;
        row.continuingCount += 1;
      }
      row.totalSales += salesAmt;
      // 消化売上: 当日に「実サービス提供価値」として認識すべき金額。
      //   = sales (当日入金)
      //   + consumed_amount (プラン按分)
      //   - plan_purchase_price (プラン購入額 = 前受金で消化扱いしない)
      //   - additional_charge if timing='next' (次回繰越しなので当日除外)
      //   + 過去の timing='next' 分の繰越 (deferredApplied)
      const planPurchasePrice = planPurchasePriceByApptId.get(a.id) ?? 0;
      const deferredOutOfToday =
        a.additional_charge_consume_timing === "next"
          ? a.additional_charge ?? 0
          : 0;
      const deferredAppliedToday = deferredAppliedByApptId.get(a.id) ?? 0;
      const todayConsumed =
        salesAmt +
        (a.consumed_amount ?? 0) -
        planPurchasePrice -
        deferredOutOfToday +
        deferredAppliedToday;
      // 防御: 何らかの理由で負値になったら 0 にクランプ。
      row.consumedSales += Math.max(0, todayConsumed);

      // Payment method bucket
      // 分割払い (payment_splits JSONB) があれば各行ごとに該当方法へ
      // 振り分ける。なければ payment_method 1 つに sales 全額を入れる。
      // これがないと「Square 12,100 + 現金 2,000」が日報で先頭の Square
      // に 14,100 全額計上されてしまうバグになる。
      // sales=0 の完了は決済内訳に載せても 0 円なのでスキップする。
      if (salesAmt > 0) {
        const paymap = paymentBuckets.get(day)!;
        const splits = parsePaymentSplits(a.payment_splits);
        if (splits && splits.length > 0) {
          for (const s of splits) {
            paymap.set(s.method, (paymap.get(s.method) ?? 0) + s.amount);
          }
        } else {
          const code = a.payment_method ?? "unknown";
          paymap.set(code, (paymap.get(code) ?? 0) + salesAmt);
        }
      }

      // Source bucket only counts new customers
      if (isNew && a.visit_source_id) {
        const smap = sourceBuckets.get(day)!;
        smap.set(
          a.visit_source_id,
          (smap.get(a.visit_source_id) ?? 0) + 1
        );
      }
    }
  }

  // 5. Materialize the chip arrays from internal maps
  for (const [day, row] of byDay.entries()) {
    const pays = paymentBuckets.get(day)!;
    row.payments = Array.from(pays.entries())
      .map(([code, amount]) => ({
        code,
        label: PAYMENT_LABELS[code] ?? (code === "unknown" ? "未設定" : code),
        amount,
      }))
      .sort((a, b) => b.amount - a.amount);

    const sources = sourceBuckets.get(day)!;
    row.newBySource = Array.from(sources.entries())
      .map(([visitSourceId, newCount]) => ({
        visitSourceId,
        sourceName: sourceNameMap.get(visitSourceId) ?? `#${visitSourceId}`,
        newCount,
      }))
      .sort((a, b) => b.newCount - a.newCount);
  }

  // 6. Sort rows newest first (matching how reports are usually read)
  // 日付は昇順 (1 日 → 31 日)。UI 側でヘッダに 合計行 → 日付行 と並べる。
  const rows = Array.from(byDay.values()).sort((a, b) =>
    a.date.localeCompare(b.date)
  );

  const totals = rows.reduce(
    (g, r) => {
      g.reservationCount += r.reservationCount;
      g.visitCount += r.visitCount;
      g.cancelCount += r.cancelCount;
      g.newCount += r.newCount;
      g.continuingCount += r.continuingCount;
      g.newSales += r.newSales;
      g.continuingSales += r.continuingSales;
      g.totalSales += r.totalSales;
      g.consumedSales += r.consumedSales;
      return g;
    },
    {
      reservationCount: 0,
      visitCount: 0,
      cancelCount: 0,
      newCount: 0,
      continuingCount: 0,
      newSales: 0,
      continuingSales: 0,
      totalSales: 0,
      consumedSales: 0,
    }
  );

  return {
    rows,
    totals,
    meta: { startDate, endDate, shopId },
  };
}

function emptyReport(
  shopId: number,
  startDate: string,
  endDate: string
): DailyReportData {
  return {
    rows: [],
    totals: {
      reservationCount: 0,
      visitCount: 0,
      cancelCount: 0,
      newCount: 0,
      continuingCount: 0,
      newSales: 0,
      continuingSales: 0,
      totalSales: 0,
      consumedSales: 0,
    },
    meta: { startDate, endDate, shopId },
  };
}
