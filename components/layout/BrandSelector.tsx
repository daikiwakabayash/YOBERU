"use client";

import { useMemo, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Building2 } from "lucide-react";
import { setActiveBrandId } from "@/helper/lib/shop-context";
import { toast } from "sonner";

interface BrandSelectorProps {
  brands: Array<{ id: number; name: string }>;
  activeBrandId: number;
}

/**
 * Top-right brand selector. Rendered in the DashboardHeader for users who
 * can access multiple brands (= root). Limited users see at most 1 brand,
 * in which case this component renders a static label instead of a Select.
 */
export function BrandSelector({ brands, activeBrandId }: BrandSelectorProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const itemsMap = useMemo(
    () => Object.fromEntries(brands.map((b) => [String(b.id), b.name])),
    [brands]
  );

  if (brands.length === 0) return null;

  if (brands.length === 1) {
    const single = brands[0];
    return (
      <div className="flex items-center gap-2 rounded-md border bg-white px-3 py-1.5 text-sm text-gray-700">
        <Building2 className="h-4 w-4 text-gray-400" />
        <span className="font-medium">{single.name}</span>
      </div>
    );
  }

  function handleChange(value: string | null) {
    const newId = Number(value);
    if (!newId || newId === activeBrandId) return;
    startTransition(async () => {
      try {
        await setActiveBrandId(newId);
        router.refresh();
      } catch (e) {
        toast.error(
          e instanceof Error ? e.message : "ブランドの切替に失敗しました"
        );
      }
    });
  }

  return (
    <div className="flex items-center gap-2">
      <Building2 className="h-4 w-4 text-gray-400" />
      <Select
        value={String(activeBrandId)}
        items={itemsMap}
        onValueChange={handleChange}
        disabled={pending}
      >
        <SelectTrigger className="h-9 min-w-[180px] bg-white">
          <SelectValue placeholder="ブランドを選択" />
        </SelectTrigger>
        <SelectContent>
          {brands.map((b) => (
            <SelectItem key={b.id} value={String(b.id)}>
              {b.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
