import { createClient } from "@/helper/lib/supabase/server";

export interface LineChatSummary {
  customerId: number | null;
  lineUserId: string;
  customerName: string;
  lastMessage: string | null;
  lastMessageAt: string | null;
  lastDirection: "inbound" | "outbound" | null;
  unreadCount: number;
}

/**
 * shop_id に紐づく LINE スレッド一覧を返す。
 *
 * - customer_id でグルーピング (null の場合は line_user_id で別スレッド)
 * - 最終メッセージ時刻で降順
 * - 未読カウント = direction='inbound' かつ read_at IS NULL
 *
 * N+1 を避けるため 1 クエリで直近 500 件を取って in-memory で畳み込む。
 */
export async function getLineChats(shopId: number): Promise<LineChatSummary[]> {
  const supabase = await createClient();

  const { data: messages, error } = await supabase
    .from("line_messages")
    .select(
      "id, customer_id, line_user_id, direction, text, created_at, read_at"
    )
    .eq("shop_id", shopId)
    .is("deleted_at", null)
    .order("created_at", { ascending: false })
    .limit(500);
  if (error) throw error;

  type Row = NonNullable<typeof messages>[number];
  const rows = (messages ?? []) as Row[];

  // Group by customer_id (fallback key = line_user_id)
  const byKey = new Map<
    string,
    {
      customerId: number | null;
      lineUserId: string;
      lastMessage: string | null;
      lastMessageAt: string | null;
      lastDirection: "inbound" | "outbound" | null;
      unreadCount: number;
    }
  >();
  for (const r of rows) {
    const key = r.customer_id
      ? `c:${r.customer_id}`
      : `u:${r.line_user_id}`;
    const existing = byKey.get(key);
    if (!existing) {
      byKey.set(key, {
        customerId: (r.customer_id as number | null) ?? null,
        lineUserId: r.line_user_id as string,
        lastMessage: r.text as string | null,
        lastMessageAt: r.created_at as string,
        lastDirection: r.direction as "inbound" | "outbound",
        unreadCount: r.direction === "inbound" && !r.read_at ? 1 : 0,
      });
    } else if (r.direction === "inbound" && !r.read_at) {
      existing.unreadCount += 1;
    }
  }

  // Resolve customer names in bulk
  const customerIds = Array.from(byKey.values())
    .map((v) => v.customerId)
    .filter((v): v is number => v != null);
  const nameMap = new Map<number, string>();
  if (customerIds.length) {
    const { data: customers } = await supabase
      .from("customers")
      .select("id, last_name, first_name")
      .in("id", customerIds)
      .is("deleted_at", null);
    for (const c of customers ?? []) {
      nameMap.set(
        c.id as number,
        `${c.last_name ?? ""} ${c.first_name ?? ""}`.trim() || "未登録顧客"
      );
    }
  }

  return Array.from(byKey.values())
    .map((v) => ({
      customerId: v.customerId,
      lineUserId: v.lineUserId,
      customerName: v.customerId
        ? (nameMap.get(v.customerId) ?? "未登録顧客")
        : "未登録ユーザー",
      lastMessage: v.lastMessage,
      lastMessageAt: v.lastMessageAt,
      lastDirection: v.lastDirection,
      unreadCount: v.unreadCount,
    }))
    .sort((a, b) =>
      (b.lastMessageAt ?? "").localeCompare(a.lastMessageAt ?? "")
    );
}
