"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import {
  DndContext,
  PointerSensor,
  KeyboardSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Pencil, GripVertical } from "lucide-react";
import { MenuCopyButton } from "./MenuCopyButton";
import { MenuDeleteButton } from "./MenuDeleteButton";
import { reorderMenus } from "../actions/menuActions";
import { toast } from "sonner";

export interface MenuRow {
  id: number;
  name: string;
  price: number;
  duration: number;
  status: boolean;
  sort_number: number;
  categoryName: string | null;
}

interface Props {
  menus: MenuRow[];
}

/**
 * メニュー一覧 (Drag-and-drop で sort_number を並び替え)。
 * 先頭 = 上位 = 公開予約画面等での優先表示順。
 */
export function MenuListTable({ menus: initialMenus }: Props) {
  const [menus, setMenus] = useState<MenuRow[]>(initialMenus);
  const [pending, startTransition] = useTransition();

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIdx = menus.findIndex((m) => m.id === active.id);
    const newIdx = menus.findIndex((m) => m.id === over.id);
    if (oldIdx < 0 || newIdx < 0) return;
    const next = arrayMove(menus, oldIdx, newIdx);
    setMenus(next);
    startTransition(async () => {
      const r = await reorderMenus(next.map((m) => m.id));
      if (r.error) {
        toast.error("並び替え保存に失敗しました");
        setMenus(initialMenus);
      } else {
        toast.success("表示順を保存しました");
      }
    });
  }

  return (
    <div className="space-y-2">
      <p className="text-xs text-muted-foreground">
        行の左端 <GripVertical className="inline h-3 w-3 text-gray-400" />{" "}
        を掴んでドラッグすると表示順を変えられます (先頭 = 上位)。
        {pending && " (保存中…)"}
      </p>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-10" />
            <TableHead className="w-16 text-center">順位</TableHead>
            <TableHead>メニュー名</TableHead>
            <TableHead>カテゴリ</TableHead>
            <TableHead className="text-right">料金</TableHead>
            <TableHead className="text-right">施術時間</TableHead>
            <TableHead>ステータス</TableHead>
            <TableHead className="w-[100px]">操作</TableHead>
          </TableRow>
        </TableHeader>
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={handleDragEnd}
        >
          <SortableContext
            items={menus.map((m) => m.id)}
            strategy={verticalListSortingStrategy}
          >
            <TableBody>
              {menus.map((menu, idx) => (
                <SortableMenuRow key={menu.id} menu={menu} rank={idx + 1} />
              ))}
            </TableBody>
          </SortableContext>
        </DndContext>
      </Table>
    </div>
  );
}

function SortableMenuRow({ menu, rank }: { menu: MenuRow; rank: number }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: menu.id });

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    background: isDragging ? "#f3f4f6" : undefined,
  };

  return (
    <TableRow ref={setNodeRef} style={style}>
      <TableCell className="p-0 align-middle">
        <button
          type="button"
          {...attributes}
          {...listeners}
          className="flex h-10 w-full cursor-grab items-center justify-center text-gray-400 hover:text-gray-700 active:cursor-grabbing"
          aria-label="ドラッグで並び替え"
        >
          <GripVertical className="h-4 w-4" />
        </button>
      </TableCell>
      <TableCell className="text-center">
        <Badge variant="outline" className="font-mono text-xs">
          {rank}
        </Badge>
      </TableCell>
      <TableCell className="font-medium">{menu.name}</TableCell>
      <TableCell>{menu.categoryName ?? "-"}</TableCell>
      <TableCell className="text-right">
        {menu.price.toLocaleString()}円
      </TableCell>
      <TableCell className="text-right">{menu.duration}分</TableCell>
      <TableCell>
        {menu.status ? (
          <Badge variant="default">公開</Badge>
        ) : (
          <Badge variant="secondary">非公開</Badge>
        )}
      </TableCell>
      <TableCell>
        <div className="flex items-center gap-1">
          <Link href={`/menu/${menu.id}`}>
            <Button variant="ghost" size="icon-sm">
              <Pencil className="size-4" />
            </Button>
          </Link>
          <MenuCopyButton id={menu.id} name={menu.name} />
          <MenuDeleteButton id={menu.id} name={menu.name} />
        </div>
      </TableCell>
    </TableRow>
  );
}
