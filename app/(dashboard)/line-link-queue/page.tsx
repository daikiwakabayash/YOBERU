import { Link2, AlertTriangle } from "lucide-react";
import { getActiveShopId } from "@/helper/lib/shop-context";
import {
  getPendingLineLinks,
  getPendingLineLinkDetail,
} from "@/feature/line-link/services/getPendingLineLinks";
import { PendingLineLinkRow } from "@/feature/line-link/components/PendingLineLinkRow";

export const dynamic = "force-dynamic";

export default async function LineLinkQueuePage() {
  const shopId = await getActiveShopId();
  const pending = await getPendingLineLinks(shopId);

  // 各 pending 行の候補顧客を並列で解決
  const detailed = await Promise.all(
    pending.map((p) => getPendingLineLinkDetail(p.id, shopId))
  );
  const rows = detailed.filter((d): d is NonNullable<typeof d> => d !== null);

  return (
    <div className="flex flex-col">
      <header className="border-b bg-white px-6 py-4">
        <h1 className="flex items-center gap-2 text-xl font-semibold">
          <Link2 size={20} /> LINE 紐付けキュー
        </h1>
        <p className="mt-1 text-sm text-gray-500">
          公式 LINE を友だち追加してきたユーザを、顧客カルテに紐付けます。
          リマインドの誤送信を防ぐため、自動紐付けは行わず、
          ここでスタッフが目視で確認してマッチさせる方式に変更しました。
        </p>
      </header>

      <div className="space-y-4 p-6">
        {rows.length === 0 ? (
          <div className="rounded-lg border bg-white p-8 text-center text-gray-500">
            <p className="font-medium">保留中の紐付けはありません</p>
            <p className="mt-2 text-sm">
              公式 LINE を新しく友だち追加した顧客が現れると、ここに表示されます。
            </p>
          </div>
        ) : (
          <>
            <div className="flex items-start gap-2 rounded-md border border-amber-300 bg-amber-50 p-3 text-xs text-amber-900">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              <div>
                <p className="font-semibold">紐付け前に必ず確認してください</p>
                <p className="mt-0.5">
                  紐付けた顧客の LINE 宛にリマインドが送信されます。
                  人物が一致しているか、LINE 表示名や直近の予約と照らし合わせて
                  ご確認ください。該当が無い場合は「破棄」してください。
                </p>
              </div>
            </div>

            <ul className="space-y-3">
              {rows.map((p) => (
                <PendingLineLinkRow key={p.id} pending={p} />
              ))}
            </ul>
          </>
        )}
      </div>
    </div>
  );
}
