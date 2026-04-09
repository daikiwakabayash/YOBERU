"use client";

import { Button } from "@/components/ui/button";
import { deleteStore } from "../actions/storeActions";
import { useRouter } from "next/navigation";
import { useTransition, useState } from "react";

interface DeleteStoreButtonProps {
  storeId: number;
  storeName: string;
}

export function DeleteStoreButton({
  storeId,
  storeName,
}: DeleteStoreButtonProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [confirming, setConfirming] = useState(false);

  function handleDelete() {
    if (!confirming) {
      setConfirming(true);
      return;
    }

    startTransition(async () => {
      const result = await deleteStore(storeId);
      if (result?.error) {
        alert(`削除に失敗しました: ${result.error}`);
        setConfirming(false);
      } else {
        router.push("/store/register");
      }
    });
  }

  return (
    <div className="flex items-center gap-2">
      {confirming && (
        <Button
          variant="outline"
          size="sm"
          onClick={() => setConfirming(false)}
          disabled={isPending}
        >
          キャンセル
        </Button>
      )}
      <Button
        variant="destructive"
        size="sm"
        onClick={handleDelete}
        disabled={isPending}
      >
        {isPending
          ? "削除中..."
          : confirming
            ? `「${storeName}」を削除`
            : "削除"}
      </Button>
    </div>
  );
}
