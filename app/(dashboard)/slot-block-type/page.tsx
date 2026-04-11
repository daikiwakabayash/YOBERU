import { PageHeader } from "@/components/layout/PageHeader";
import { SlotBlockTypeList } from "@/feature/slot-block-type/components/SlotBlockTypeList";
import { createClient } from "@/helper/lib/supabase/server";
import type { SlotBlockType } from "@/feature/slot-block-type/types";
import { getActiveBrandId } from "@/helper/lib/shop-context";

export const dynamic = "force-dynamic";

export default async function SlotBlockTypePage() {
  const brandId = await getActiveBrandId();
  const supabase = await createClient();

  let types: SlotBlockType[] = [];
  try {
    const { data } = await supabase
      .from("slot_block_types")
      .select("*")
      .eq("brand_id", brandId)
      .is("deleted_at", null)
      .order("sort_number", { ascending: true, nullsFirst: false });
    types = (data ?? []) as SlotBlockType[];
  } catch {
    // Table may not yet be migrated
  }

  return (
    <div>
      <PageHeader
        title="予約ブロック種別"
        description="ミーティング / 休憩 / その他など、お客様以外の予約枠の種別を管理します"
      />
      <div className="p-6">
        <SlotBlockTypeList types={types} brandId={brandId} />
      </div>
    </div>
  );
}
