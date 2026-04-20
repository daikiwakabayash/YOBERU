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
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Eye, Trash2, GripVertical } from "lucide-react";
import { deleteStaff, reorderStaffs } from "../actions/staffActions";
import { toast } from "sonner";

interface Staff {
  id: number;
  name: string;
  capacity: number;
  phone_number: string | null;
  is_public: boolean;
  allocate_order: number | null;
}

interface StaffListProps {
  staffs: Staff[];
}

/**
 * Drag-and-drop で優先順位 (allocate_order) を並び替える。
 * 先頭 = 優先度最高 (allocate_order=1)、最下段 = 最低。
 */
export function StaffList({ staffs: initialStaffs }: StaffListProps) {
  const [staffs, setStaffs] = useState<Staff[]>(initialStaffs);
  const [pending, startTransition] = useTransition();

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  async function handleDelete(id: number, name: string) {
    if (!confirm(`「${name}」を削除してもよろしいですか？`)) return;
    const result = await deleteStaff(id);
    if (result.error) toast.error(result.error);
    else toast.success("スタッフを削除しました");
  }

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIdx = staffs.findIndex((s) => s.id === active.id);
    const newIdx = staffs.findIndex((s) => s.id === over.id);
    if (oldIdx < 0 || newIdx < 0) return;
    const next = arrayMove(staffs, oldIdx, newIdx);
    setStaffs(next);
    startTransition(async () => {
      const r = await reorderStaffs(next.map((s) => s.id));
      if (r.error) {
        toast.error("並び替え保存に失敗しました");
        setStaffs(initialStaffs);
      } else {
        toast.success("優先順位を保存しました");
      }
    });
  }

  return (
    <div className="space-y-3">
      <p className="text-xs text-muted-foreground">
        ※ 優先順位：指名なし（お任せ）の予約が入った時に、
        <b>上にあるスタッフから優先的に</b>割り当てられます。
        行の左端 <GripVertical className="inline h-3 w-3 text-gray-400" />{" "}
        を掴んで縦にドラッグすると順番が変わります。
        {pending && " (保存中…)"}
      </p>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-10" />
            <TableHead className="w-20 text-center">順位</TableHead>
            <TableHead>スタッフ名</TableHead>
            <TableHead className="text-center">受付可能数</TableHead>
            <TableHead>電話番号</TableHead>
            <TableHead className="text-center">公開状態</TableHead>
            <TableHead className="text-right">操作</TableHead>
          </TableRow>
        </TableHeader>
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={handleDragEnd}
        >
          <SortableContext
            items={staffs.map((s) => s.id)}
            strategy={verticalListSortingStrategy}
          >
            <TableBody>
              {staffs.length === 0 ? (
                <TableRow>
                  <TableCell
                    colSpan={7}
                    className="py-8 text-center text-muted-foreground"
                  >
                    スタッフが登録されていません
                  </TableCell>
                </TableRow>
              ) : (
                staffs.map((staff, idx) => (
                  <SortableRow
                    key={staff.id}
                    staff={staff}
                    rank={idx + 1}
                    onDelete={handleDelete}
                  />
                ))
              )}
            </TableBody>
          </SortableContext>
        </DndContext>
      </Table>
    </div>
  );
}

function SortableRow({
  staff,
  rank,
  onDelete,
}: {
  staff: Staff;
  rank: number;
  onDelete: (id: number, name: string) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: staff.id });

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
      <TableCell className="font-medium">{staff.name}</TableCell>
      <TableCell className="text-center">
        <Badge variant="secondary">{staff.capacity}</Badge>
      </TableCell>
      <TableCell>{staff.phone_number || "-"}</TableCell>
      <TableCell className="text-center">
        {staff.is_public ? (
          <Badge variant="default">公開</Badge>
        ) : (
          <Badge variant="outline">非公開</Badge>
        )}
      </TableCell>
      <TableCell className="text-right">
        <div className="flex justify-end gap-1">
          <Link href={`/staff/${staff.id}`}>
            <Button variant="ghost" size="sm" title="詳細">
              <Eye className="h-4 w-4" />
            </Button>
          </Link>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => onDelete(staff.id, staff.name)}
          >
            <Trash2 className="h-4 w-4 text-red-500" />
          </Button>
        </div>
      </TableCell>
    </TableRow>
  );
}
