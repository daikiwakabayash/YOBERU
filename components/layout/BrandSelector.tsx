"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { setActiveBrandId } from "@/helper/lib/shop-context";
import { Building2 } from "lucide-react";

interface BrandOption {
  id: number;
  name: string;
}

interface Props {
  brands: BrandOption[];
  activeBrandId: number;
}

/**
 * Header の右上に置くブランド切替セレクタ。root ユーザー (= 複数ブランド
 * 横断可能なユーザー) のみに表示する想定。ブランド切替時は ShopContext
 * の active_shop_id cookie もリセットされ、新ブランドで最初の店舗が
 * 自動で選択される。
 */
export function BrandSelector({ brands, activeBrandId }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  if (brands.length === 0) return null;

  // 1 件しかなければラベル表示のみ
  if (brands.length === 1) {
    return (
      <div className="hidden items-center gap-1.5 rounded-md border bg-indigo-50 px-2 py-1 text-xs font-bold text-indigo-700 sm:inline-flex">
        <Building2 className="h-3.5 w-3.5" />
        {brands[0].name}
      </div>
    );
  }

  return (
    <label className="inline-flex items-center gap-1.5 rounded-md border bg-white px-2 text-xs font-bold text-indigo-700 shadow-sm">
      <Building2 className="h-3.5 w-3.5" />
      <select
        value={activeBrandId}
        disabled={pending}
        onChange={(e) => {
          const next = Number(e.target.value);
          startTransition(async () => {
            await setActiveBrandId(next);
            router.refresh();
          });
        }}
        className="h-7 bg-transparent pr-1 text-xs font-bold text-gray-900 focus:outline-none disabled:opacity-50"
      >
        {brands.map((b) => (
          <option key={b.id} value={b.id}>
            {b.name}
          </option>
        ))}
      </select>
    </label>
  );
}
