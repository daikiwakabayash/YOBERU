"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Store } from "lucide-react";
import { setActiveShopId } from "@/helper/lib/shop-context";
import { toast } from "sonner";

interface ShopSelectorProps {
  shops: Array<{ id: number; name: string }>;
  activeShopId: number;
}

/**
 * Top-right shop selector. Rendered in the DashboardHeader for multi-shop
 * brands. Hidden when there is only one shop (no point showing a selector).
 */
export function ShopSelector({ shops, activeShopId }: ShopSelectorProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  // Hide entirely when there's nothing to switch between
  if (shops.length <= 1) {
    const single = shops[0];
    if (!single) return null;
    return (
      <div className="flex items-center gap-2 rounded-md border bg-white px-3 py-1.5 text-sm text-gray-700">
        <Store className="h-4 w-4 text-gray-400" />
        <span className="font-medium">{single.name}</span>
      </div>
    );
  }

  function handleChange(value: string | null) {
    const newId = Number(value);
    if (!newId || newId === activeShopId) return;
    startTransition(async () => {
      try {
        await setActiveShopId(newId);
        router.refresh();
      } catch {
        toast.error("店舗の切替に失敗しました");
      }
    });
  }

  return (
    <div className="flex items-center gap-2">
      <Store className="h-4 w-4 text-gray-400" />
      <Select
        value={String(activeShopId)}
        onValueChange={handleChange}
        disabled={pending}
      >
        <SelectTrigger className="h-9 min-w-[200px] bg-white">
          <SelectValue placeholder="店舗を選択" />
        </SelectTrigger>
        <SelectContent>
          {shops.map((s) => (
            <SelectItem key={s.id} value={String(s.id)}>
              {s.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
