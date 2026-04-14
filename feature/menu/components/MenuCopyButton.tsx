"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Copy } from "lucide-react";
import { toast } from "sonner";
import { copyMenu } from "../actions/menuActions";

interface MenuCopyButtonProps {
  id: number;
  name: string;
}

/**
 * メニュー一覧のアクション列に置くコピーボタン。
 * クリックするとサーバー側で複製を作り、コピー後の編集画面に遷移する。
 */
export function MenuCopyButton({ id, name }: MenuCopyButtonProps) {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(false);

  async function handleCopy() {
    if (isLoading) return;
    setIsLoading(true);
    const result = await copyMenu(id);
    setIsLoading(false);

    if ("error" in result && result.error) {
      toast.error(result.error);
      return;
    }
    toast.success(`「${name}」をコピーしました`);
    if ("id" in result && result.id) {
      router.push(`/menu/${result.id}`);
    }
  }

  return (
    <Button
      variant="ghost"
      size="icon-sm"
      title="コピー"
      disabled={isLoading}
      onClick={handleCopy}
    >
      <Copy className="size-4 text-blue-500" />
    </Button>
  );
}
