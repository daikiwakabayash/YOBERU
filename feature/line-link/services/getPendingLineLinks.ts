import { createClient } from "@/helper/lib/supabase/server";

export interface PendingLineLinkRow {
  id: number;
  shopId: number;
  lineUserId: string;
  displayName: string | null;
  pictureUrl: string | null;
  statusMessage: string | null;
  followedAt: string;
}

export interface CandidateCustomer {
  id: number;
  code: string;
  lastName: string | null;
  firstName: string | null;
  lastNameKana: string | null;
  firstNameKana: string | null;
  phoneTail4: string | null;
  email: string | null;
  hasLineLink: boolean;
  /** 最近の予約日時 (該当があれば) */
  recentAppointmentAt: string | null;
  /** マッチング根拠 (UI 表示用) */
  matchReason: string[];
}

export interface PendingLineLinkWithCandidates extends PendingLineLinkRow {
  candidates: CandidateCustomer[];
}

/**
 * 指定店舗の保留中 LINE 紐付けキューを取得する。
 *
 * 表示順は新しい follow 順。マッチ済み / 破棄済みは含まない。
 */
export async function getPendingLineLinks(
  shopId: number
): Promise<PendingLineLinkRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("pending_line_links")
    .select(
      "id, shop_id, line_user_id, display_name, picture_url, status_message, followed_at"
    )
    .eq("shop_id", shopId)
    .is("matched_customer_id", null)
    .is("dismissed_at", null)
    .is("deleted_at", null)
    .order("followed_at", { ascending: false })
    .limit(100);
  if (error || !data) return [];
  return data.map((r) => ({
    id: r.id as number,
    shopId: r.shop_id as number,
    lineUserId: r.line_user_id as string,
    displayName: (r.display_name as string | null) ?? null,
    pictureUrl: (r.picture_url as string | null) ?? null,
    statusMessage: (r.status_message as string | null) ?? null,
    followedAt: r.followed_at as string,
  }));
}

/**
 * 単一の pending を、候補顧客の一覧と共に取得する。
 *
 * 候補は以下の順で重複排除しつつ集める:
 *   1. display_name (LINE 表示名) と kana / name が部分一致する顧客
 *   2. 最近 (30 日) 予約した未紐付け顧客
 *
 * いずれも shop_id で絞り、誤って別店舗の顧客が候補に混ざらないようにする。
 */
export async function getPendingLineLinkDetail(
  pendingId: number,
  shopId: number
): Promise<PendingLineLinkWithCandidates | null> {
  const supabase = await createClient();
  const { data: pending } = await supabase
    .from("pending_line_links")
    .select(
      "id, shop_id, line_user_id, display_name, picture_url, status_message, followed_at, matched_customer_id, dismissed_at"
    )
    .eq("id", pendingId)
    .eq("shop_id", shopId)
    .is("deleted_at", null)
    .maybeSingle();
  if (!pending) return null;
  if (pending.matched_customer_id || pending.dismissed_at) {
    // 既に処理済みなら候補無しで返す
    return {
      id: pending.id as number,
      shopId: pending.shop_id as number,
      lineUserId: pending.line_user_id as string,
      displayName: (pending.display_name as string | null) ?? null,
      pictureUrl: (pending.picture_url as string | null) ?? null,
      statusMessage: (pending.status_message as string | null) ?? null,
      followedAt: pending.followed_at as string,
      candidates: [],
    };
  }

  const displayName = (pending.display_name as string | null) ?? "";
  const candidateMap = new Map<number, CandidateCustomer>();

  function pushCandidate(
    raw: Record<string, unknown>,
    reason: string
  ): void {
    const id = raw.id as number;
    const existing = candidateMap.get(id);
    if (existing) {
      if (!existing.matchReason.includes(reason)) {
        existing.matchReason.push(reason);
      }
      return;
    }
    const phone = (raw.phone_number_1 as string | null) ?? null;
    candidateMap.set(id, {
      id,
      code: (raw.code as string) ?? "",
      lastName: (raw.last_name as string | null) ?? null,
      firstName: (raw.first_name as string | null) ?? null,
      lastNameKana: (raw.last_name_kana as string | null) ?? null,
      firstNameKana: (raw.first_name_kana as string | null) ?? null,
      phoneTail4:
        phone && phone.length >= 4 ? phone.slice(-4) : null,
      email: (raw.email as string | null) ?? null,
      hasLineLink: !!(raw.line_user_id as string | null),
      recentAppointmentAt:
        (raw.recent_appointment_at as string | null) ?? null,
      matchReason: [reason],
    });
  }

  // 1) display_name の部分一致 (last_name / first_name / kana 群)
  if (displayName.trim().length > 0) {
    const term = displayName.trim();
    const { data: byName } = await supabase
      .from("customers")
      .select(
        "id, code, last_name, first_name, last_name_kana, first_name_kana, phone_number_1, email, line_user_id"
      )
      .eq("shop_id", shopId)
      .is("deleted_at", null)
      .or(
        `last_name.ilike.%${term}%,first_name.ilike.%${term}%,last_name_kana.ilike.%${term}%,first_name_kana.ilike.%${term}%`
      )
      .limit(20);
    for (const r of byName ?? []) {
      pushCandidate(r as Record<string, unknown>, `LINE 表示名 "${term}" と一致`);
    }
  }

  // 2) 最近の予約者 (過去 30 日に予約があり、まだ line_user_id 未設定)
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
  const { data: recentAppts } = await supabase
    .from("appointments")
    .select("customer_id, start_at")
    .eq("shop_id", shopId)
    .is("deleted_at", null)
    .gte("created_at", thirtyDaysAgo.toISOString())
    .order("created_at", { ascending: false })
    .limit(40);

  const recentCustomerIds = Array.from(
    new Set(
      (recentAppts ?? [])
        .map((a) => a.customer_id as number)
        .filter((v) => typeof v === "number")
    )
  );

  if (recentCustomerIds.length > 0) {
    const { data: recentCusts } = await supabase
      .from("customers")
      .select(
        "id, code, last_name, first_name, last_name_kana, first_name_kana, phone_number_1, email, line_user_id"
      )
      .in("id", recentCustomerIds)
      .eq("shop_id", shopId)
      .is("deleted_at", null)
      .is("line_user_id", null)
      .limit(20);
    // 直近予約日時を引いてセット
    const apptByCustomer = new Map<number, string>();
    for (const a of recentAppts ?? []) {
      const cid = a.customer_id as number;
      const sa = a.start_at as string;
      if (!apptByCustomer.has(cid)) apptByCustomer.set(cid, sa);
    }
    for (const r of recentCusts ?? []) {
      const enriched = {
        ...r,
        recent_appointment_at: apptByCustomer.get(r.id as number) ?? null,
      };
      pushCandidate(enriched as Record<string, unknown>, "最近 30 日に予約あり");
    }
  }

  const candidates = Array.from(candidateMap.values()).sort((a, b) => {
    // マッチ理由数の多い順 → 表示名一致を優先
    if (b.matchReason.length !== a.matchReason.length) {
      return b.matchReason.length - a.matchReason.length;
    }
    // 直近予約のある人を上に
    const aTs = a.recentAppointmentAt
      ? new Date(a.recentAppointmentAt).getTime()
      : 0;
    const bTs = b.recentAppointmentAt
      ? new Date(b.recentAppointmentAt).getTime()
      : 0;
    return bTs - aTs;
  });

  return {
    id: pending.id as number,
    shopId: pending.shop_id as number,
    lineUserId: pending.line_user_id as string,
    displayName: (pending.display_name as string | null) ?? null,
    pictureUrl: (pending.picture_url as string | null) ?? null,
    statusMessage: (pending.status_message as string | null) ?? null,
    followedAt: pending.followed_at as string,
    candidates,
  };
}

/**
 * 件数のみ取得 (ヘッダのバッジ表示用)。
 */
export async function countPendingLineLinks(shopId: number): Promise<number> {
  const supabase = await createClient();
  const { count } = await supabase
    .from("pending_line_links")
    .select("id", { count: "exact", head: true })
    .eq("shop_id", shopId)
    .is("matched_customer_id", null)
    .is("dismissed_at", null)
    .is("deleted_at", null);
  return count ?? 0;
}
