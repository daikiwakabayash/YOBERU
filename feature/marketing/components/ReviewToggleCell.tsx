"use client";

import { useState, useTransition } from "react";
import { Star } from "lucide-react";
import { setCustomerReviewStatus } from "@/feature/customer/actions/customerActions";

/**
 * 新規管理タブの「G口コミ / H口コミ」セル。
 *
 * クリックで customers.google_review_received_at /
 * hotpepper_review_received_at を toggle する。
 * トグル中は disabled + opacity で連打を防ぐ。
 *
 * 取得済 = 黄色塗りの星、未取得 = 灰色枠の星。
 */
export function ReviewToggleCell({
  customerId,
  kind,
  initial,
}: {
  customerId: number;
  kind: "google" | "hotpepper";
  initial: boolean;
}) {
  const [received, setReceived] = useState(initial);
  const [pending, startTransition] = useTransition();

  function toggle() {
    const next = !received;
    setReceived(next);
    startTransition(async () => {
      const res = await setCustomerReviewStatus(customerId, {
        [kind]: next,
      });
      if ("error" in res) {
        // 失敗時は元に戻す
        setReceived(!next);
      }
    });
  }

  return (
    <button
      type="button"
      onClick={toggle}
      disabled={pending}
      aria-pressed={received}
      aria-label={
        kind === "google"
          ? received
            ? "Google 口コミ取得済 (クリックで取消)"
            : "Google 口コミ未取得 (クリックで取得済にする)"
          : received
            ? "HotPepper 口コミ取得済 (クリックで取消)"
            : "HotPepper 口コミ未取得 (クリックで取得済にする)"
      }
      className={`inline-flex h-6 w-6 items-center justify-center rounded-full transition ${
        received
          ? "bg-amber-400 text-white hover:bg-amber-500"
          : "bg-gray-100 text-gray-300 hover:bg-gray-200"
      } ${pending ? "opacity-50" : ""}`}
    >
      <Star className="h-3.5 w-3.5" fill={received ? "currentColor" : "none"} />
    </button>
  );
}
