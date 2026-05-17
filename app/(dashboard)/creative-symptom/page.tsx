import { PageHeader } from "@/components/layout/PageHeader";
import { CreativeSymptomList } from "@/feature/creative-symptom/components/CreativeSymptomList";
import { createClient } from "@/helper/lib/supabase/server";
import type { CreativeSymptom } from "@/feature/creative-symptom/types";

export const dynamic = "force-dynamic";

export default async function CreativeSymptomPage() {
  const supabase = await createClient();

  let symptoms: CreativeSymptom[] = [];
  try {
    const { data } = await supabase
      .from("creative_symptoms")
      .select("*")
      .is("deleted_at", null)
      .order("sort_number");
    symptoms = (data ?? []) as CreativeSymptom[];
  } catch {
    // migration 00050 未適用時はテーブルが存在しないので空配列で続行
  }

  return (
    <div>
      <PageHeader
        title="症状マスター"
        description="強制リンク × クリエイティブ分析で使う症状の選択肢を管理します"
      />
      <div className="p-6">
        <CreativeSymptomList symptoms={symptoms} />
      </div>
    </div>
  );
}
