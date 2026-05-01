import { createClient } from "@/helper/lib/supabase/server";
import { LineLinkClient } from "@/feature/customer-portal/components/LineLinkClient";

export const dynamic = "force-dynamic";

interface Props {
  params: Promise<{ token: string }>;
}

export default async function LineLinkPage({ params }: Props) {
  const { token } = await params;

  // SSR で token の妥当性 + 既存 line_user_id を引き、UI に渡す
  let preLinkedUserId: string | null = null;
  let shopAddFriendUrl: string | null = null;
  try {
    const supabase = await createClient();
    const { data: customer } = await supabase
      .from("customers")
      .select("line_user_id, shop_id")
      .eq("line_link_token", token)
      .is("deleted_at", null)
      .maybeSingle();
    if (customer) {
      preLinkedUserId = (customer.line_user_id as string | null) ?? null;
      const { data: shop } = await supabase
        .from("shops")
        .select("line_add_friend_url")
        .eq("id", customer.shop_id as number)
        .maybeSingle();
      shopAddFriendUrl =
        (shop?.line_add_friend_url as string | null) ?? null;
    }
  } catch {
    // SSR データ取得に失敗しても LIFF 側で処理可能なのでフォールバック
  }

  return (
    <main className="min-h-[100dvh] bg-gray-50">
      <LineLinkClient
        token={token}
        preLinkedUserId={preLinkedUserId}
        shopAddFriendUrl={shopAddFriendUrl}
      />
    </main>
  );
}
