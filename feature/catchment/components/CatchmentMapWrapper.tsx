"use client";

import dynamic from "next/dynamic";
import type { CatchmentData } from "../services/getCatchmentCustomers";

/**
 * Leaflet は `window` 依存なので SSR 無効化が必須。Next.js では
 * dynamic import + { ssr: false } で client 専用に分離する。
 * サーバコンポーネント (marketing/page.tsx) から直接 Leaflet 系を
 * import すると build が通らないので、この wrapper 経由で挟む。
 */
const CatchmentMap = dynamic(
  () => import("./CatchmentMap").then((m) => m.CatchmentMap),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-[620px] items-center justify-center rounded-lg border bg-white text-sm text-gray-400">
        マップを読み込み中...
      </div>
    ),
  }
);

interface Props {
  data: CatchmentData;
  visitSources: Array<{ id: number; name: string }>;
  shopId: number;
}

export function CatchmentMapWrapper({ data, visitSources, shopId }: Props) {
  return <CatchmentMap data={data} visitSources={visitSources} shopId={shopId} />;
}
