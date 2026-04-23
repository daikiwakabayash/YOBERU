import { getActiveShopId } from "@/helper/lib/shop-context";
import { getLineChats } from "@/feature/line-chat/services/getLineChats";
import Link from "next/link";
import { MessageCircle } from "lucide-react";

export const dynamic = "force-dynamic";

function formatRelative(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return "たった今";
  if (mins < 60) return `${mins}分前`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}時間前`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}日前`;
  return `${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, "0")}/${String(d.getDate()).padStart(2, "0")}`;
}

export default async function LineChatIndexPage() {
  const shopId = await getActiveShopId();
  const chats = await getLineChats(shopId);

  return (
    <div className="flex flex-col">
      <header className="border-b bg-white px-6 py-4">
        <h1 className="flex items-center gap-2 text-xl font-semibold">
          <MessageCircle size={20} /> LINE チャット
        </h1>
        <p className="mt-1 text-sm text-gray-500">
          公式 LINE アカウントの顧客とのトーク履歴。未読メッセージは赤バッジで表示されます。
        </p>
      </header>

      <div className="p-6">
        {chats.length === 0 ? (
          <div className="rounded-lg border bg-white p-8 text-center text-gray-500">
            <p>まだメッセージのやり取りがありません。</p>
            <p className="mt-2 text-sm">
              公式 LINE を友だち追加した顧客からメッセージが届くとここに表示されます。
            </p>
          </div>
        ) : (
          <ul className="divide-y rounded-lg border bg-white">
            {chats.map((c) => {
              const key = c.customerId
                ? `c-${c.customerId}`
                : `u-${c.lineUserId}`;
              const href = c.customerId
                ? `/line-chat/${c.customerId}`
                : `#`;
              const unread = c.unreadCount > 0;
              return (
                <li key={key}>
                  <Link
                    href={href}
                    className="flex items-center gap-4 px-4 py-3 hover:bg-gray-50"
                  >
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-green-100 text-sm font-semibold text-green-700">
                      {c.customerName.slice(0, 1)}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-2">
                        <p className="truncate text-sm font-semibold text-gray-900">
                          {c.customerName}
                          {!c.customerId && (
                            <span className="ml-2 text-xs text-gray-400">
                              (未紐付け)
                            </span>
                          )}
                        </p>
                        <p className="shrink-0 text-xs text-gray-400">
                          {formatRelative(c.lastMessageAt)}
                        </p>
                      </div>
                      <div className="mt-1 flex items-center gap-2">
                        <p
                          className={`truncate text-sm ${unread ? "font-medium text-gray-900" : "text-gray-500"}`}
                        >
                          {c.lastDirection === "outbound" && (
                            <span className="mr-1 text-gray-400">→</span>
                          )}
                          {c.lastMessage ?? "(本文なし)"}
                        </p>
                        {unread && (
                          <span className="ml-auto inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-red-500 px-1.5 text-xs font-bold text-white">
                            {c.unreadCount}
                          </span>
                        )}
                      </div>
                    </div>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
