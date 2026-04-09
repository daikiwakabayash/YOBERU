"use client";

import { useState } from "react";
import { deleteMenu } from "../actions/menuActions";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogTrigger,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogClose,
} from "@/components/ui/dialog";
import { Trash2 } from "lucide-react";

interface MenuDeleteButtonProps {
  id: number;
  name: string;
}

export function MenuDeleteButton({ id, name }: MenuDeleteButtonProps) {
  const [open, setOpen] = useState(false);

  const handleDelete = async () => {
    await deleteMenu(id);
    setOpen(false);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={<Button variant="ghost" size="icon-sm" />}
      >
        <Trash2 className="size-4 text-destructive" />
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>メニュー削除</DialogTitle>
          <DialogDescription>
            「{name}」を削除してもよろしいですか？この操作は取り消せません。
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <DialogClose render={<Button variant="outline" />}>
            キャンセル
          </DialogClose>
          <Button variant="destructive" onClick={handleDelete}>
            削除する
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
