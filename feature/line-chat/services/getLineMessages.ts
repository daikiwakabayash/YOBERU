import { createClient } from "@/helper/lib/supabase/server";

export interface LineMessageRow {
  id: number;
  direction: "inbound" | "outbound";
  messageType: string;
  text: string | null;
  createdAt: string;
  source: string | null;
  sentByUserId: number | null;
  deliveryStatus: string | null;
  errorMessage: string | null;
  readAt: string | null;
}

export interface LineThreadContext {
  customerId: number | null;
  lineUserId: string | null;
  customerName: string;
  customerPhone: string | null;
  shopId: number;
  shopName: string;
  hasAccessToken: boolean;
  messages: LineMessageRow[];
}

/**
 * 指定 shop + customer のスレッドを取得し、未読 inbound を既読化する。
 */
export async function getLineThread(
  shopId: number,
  customerId: number
): Promise<LineThreadContext | null> {
  const supabase = await createClient();

  // Load customer & shop
  const [customerRes, shopRes] = await Promise.all([
    supabase
      .from("customers")
      .select("id, last_name, first_name, phone_number_1, line_user_id")
      .eq("id", customerId)
      .eq("shop_id", shopId)
      .is("deleted_at", null)
      .maybeSingle(),
    supabase
      .from("shops")
      .select("id, name, line_channel_access_token")
      .eq("id", shopId)
      .maybeSingle(),
  ]);

  if (!customerRes.data || !shopRes.data) return null;

  const { data: messages } = await supabase
    .from("line_messages")
    .select(
      "id, direction, message_type, text, created_at, source, sent_by_user_id, delivery_status, error_message, read_at"
    )
    .eq("shop_id", shopId)
    .eq("customer_id", customerId)
    .is("deleted_at", null)
    .order("created_at", { ascending: true })
    .limit(500);

  // Mark inbound as read (non-blocking; swallow errors)
  try {
    await supabase
      .from("line_messages")
      .update({ read_at: new Date().toISOString() })
      .eq("shop_id", shopId)
      .eq("customer_id", customerId)
      .eq("direction", "inbound")
      .is("read_at", null);
  } catch {
    /* ignore */
  }

  return {
    customerId: customerRes.data.id as number,
    lineUserId: (customerRes.data.line_user_id as string | null) ?? null,
    customerName:
      `${customerRes.data.last_name ?? ""} ${customerRes.data.first_name ?? ""}`.trim() ||
      "未登録顧客",
    customerPhone:
      (customerRes.data.phone_number_1 as string | null) ?? null,
    shopId: shopRes.data.id as number,
    shopName: (shopRes.data.name as string) ?? "店舗",
    hasAccessToken: !!shopRes.data.line_channel_access_token,
    messages: (messages ?? []).map((m) => ({
      id: m.id as number,
      direction: m.direction as "inbound" | "outbound",
      messageType: m.message_type as string,
      text: (m.text as string | null) ?? null,
      createdAt: m.created_at as string,
      source: (m.source as string | null) ?? null,
      sentByUserId: (m.sent_by_user_id as number | null) ?? null,
      deliveryStatus: (m.delivery_status as string | null) ?? null,
      errorMessage: (m.error_message as string | null) ?? null,
      readAt: (m.read_at as string | null) ?? null,
    })),
  };
}
