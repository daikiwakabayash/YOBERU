import { getActiveShopId } from "@/helper/lib/shop-context";
import { getLineThread } from "@/feature/line-chat/services/getLineMessages";
import { notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { ChatThreadView } from "@/feature/line-chat/components/ChatThreadView";

export const dynamic = "force-dynamic";

export default async function LineChatThreadPage({
  params,
}: {
  params: Promise<{ customerId: string }>;
}) {
  const { customerId: customerIdStr } = await params;
  const customerId = Number(customerIdStr);
  if (!Number.isFinite(customerId)) notFound();

  const shopId = await getActiveShopId();
  const thread = await getLineThread(shopId, customerId);
  if (!thread) notFound();

  return (
    <div className="flex h-full flex-col">
      <header className="flex items-center gap-3 border-b bg-white px-6 py-3">
        <Link
          href="/line-chat"
          className="rounded p-1 text-gray-500 hover:bg-gray-100"
        >
          <ArrowLeft size={18} />
        </Link>
        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-green-100 text-sm font-semibold text-green-700">
          {thread.customerName.slice(0, 1)}
        </div>
        <div className="flex-1">
          <p className="text-sm font-semibold text-gray-900">
            {thread.customerName}
          </p>
          <p className="text-xs text-gray-400">
            {thread.customerPhone ?? "電話番号未登録"}
            {thread.lineUserId ? null : " ・ LINE 未連携"}
          </p>
        </div>
        <Link
          href={`/customer/${thread.customerId}`}
          className="text-sm text-blue-600 hover:underline"
        >
          顧客詳細
        </Link>
      </header>

      <ChatThreadView
        shopId={thread.shopId}
        customerId={thread.customerId!}
        lineUserId={thread.lineUserId}
        hasAccessToken={thread.hasAccessToken}
        messages={thread.messages}
      />
    </div>
  );
}
