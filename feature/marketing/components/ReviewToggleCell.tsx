import { Star } from "lucide-react";

/**
 * 新規管理タブの「G口コミ / H口コミ」セル (表示専用)。
 *
 * 取得済 = 黄色塗りの星、未取得 = 灰色枠の星。
 *
 * 値の変更は誤タップ防止のため当タブからは行わない。
 * 取得 / 取消 は予約パネル (AppointmentDetailSheet) の
 * 「口コミ受領チェック」セクションから操作する。
 */
export function ReviewDisplayCell({
  kind,
  received,
}: {
  kind: "google" | "hotpepper";
  received: boolean;
}) {
  return (
    <span
      role="img"
      aria-label={
        kind === "google"
          ? received
            ? "Google 口コミ取得済"
            : "Google 口コミ未取得"
          : received
            ? "HotPepper 口コミ取得済"
            : "HotPepper 口コミ未取得"
      }
      className={`inline-flex h-6 w-6 items-center justify-center rounded-full ${
        received ? "bg-amber-400 text-white" : "bg-gray-100 text-gray-300"
      }`}
    >
      <Star className="h-3.5 w-3.5" fill={received ? "currentColor" : "none"} />
    </span>
  );
}
