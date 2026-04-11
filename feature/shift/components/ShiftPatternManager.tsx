"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent } from "@/components/ui/card";
import { WorkPatternList } from "./WorkPatternList";
import { WorkPatternForm } from "./WorkPatternForm";
import type { WorkPatternFormValues } from "../schema/shift.schema";

export interface WorkPatternRow {
  id: number;
  brand_id: number;
  shop_id: number;
  name: string;
  abbreviation_name: string | null;
  abbreviation_color: string | null;
  start_time: string;
  end_time: string;
}

interface ShiftPatternManagerProps {
  patterns: WorkPatternRow[];
  brandId: number;
  shopId: number;
}

/**
 * Client wrapper that lets the staff list & form share an "editing" state.
 * The page itself stays a server component (force-dynamic) and re-fetches
 * the patterns on router.refresh() after a successful save.
 */
export function ShiftPatternManager({
  patterns,
  brandId,
  shopId,
}: ShiftPatternManagerProps) {
  const router = useRouter();
  const [editing, setEditing] = useState<WorkPatternRow | null>(null);

  // Convert the row → WorkPatternFormValues + id shape the form expects
  const initialData: (WorkPatternFormValues & { id: number }) | undefined =
    editing
      ? {
          id: editing.id,
          brand_id: editing.brand_id,
          shop_id: editing.shop_id,
          name: editing.name,
          abbreviation_name: editing.abbreviation_name ?? "",
          abbreviation_color: editing.abbreviation_color ?? "#3B82F6",
          // The DB stores TIME values which Supabase returns as "HH:MM:SS";
          // <input type="time"> expects "HH:MM".
          start_time: (editing.start_time ?? "").slice(0, 5),
          end_time: (editing.end_time ?? "").slice(0, 5),
        }
      : undefined;

  // WorkPatternList's local WorkPattern type is a narrow projection (no
  // brand_id/shop_id) so we re-look-up the full row from our props.
  function handleEdit(pattern: { id: number }) {
    const full = patterns.find((p) => p.id === pattern.id);
    if (!full) return;
    setEditing(full);
    if (typeof window !== "undefined") {
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  }

  function handleSaved() {
    setEditing(null);
    router.refresh();
  }

  return (
    <div className="grid gap-6 lg:grid-cols-3">
      <div className="lg:col-span-2">
        <Card>
          <CardContent className="pt-6">
            <WorkPatternList
              patterns={patterns}
              onEdit={handleEdit}
              editingId={editing?.id ?? null}
            />
          </CardContent>
        </Card>
      </div>
      <div>
        <WorkPatternForm
          brandId={brandId}
          shopId={shopId}
          initialData={initialData}
          onSaved={handleSaved}
          onCancelEdit={() => setEditing(null)}
        />
      </div>
    </div>
  );
}
