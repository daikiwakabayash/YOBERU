import { PageHeader } from "@/components/layout/PageHeader";
import { CreativeSymptomList } from "@/feature/creative-symptom/components/CreativeSymptomList";
import { createClient } from "@/helper/lib/supabase/server";
import type { CreativeSymptom } from "@/feature/creative-symptom/types";

export const dynamic = "force-dynamic";

export default async function CreativeSymptomPage() {
  const supabase = await createClient();

  let symptoms: CreativeSymptom[] = [];
  let tableMissing = false;
  const { data, error } = await supabase
    .from("creative_symptoms")
    .select("*")
    .is("deleted_at", null)
    .order("sort_number");
  if (error) {
    const msg = error.message ?? "";
    if (
      msg.includes('relation "creative_symptoms"') ||
      msg.includes("does not exist") ||
      msg.includes("schema cache")
    ) {
      tableMissing = true;
    }
  } else {
    symptoms = (data ?? []) as CreativeSymptom[];
  }

  return (
    <div>
      <PageHeader
        title="症状マスター"
        description="強制リンク × クリエイティブ分析で使う症状の選択肢を管理します"
      />
      <div className="space-y-4 p-6">
        {tableMissing && (
          <div className="rounded-md border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
            <div className="font-bold">creative_symptoms テーブルが未作成です</div>
            <div className="mt-1">
              Supabase の SQL Editor で
              <code className="mx-1 rounded bg-amber-100 px-1 font-mono">
                supabase/migrations/00050_creative_analysis.sql
              </code>
              を実行してください。実行すると 10 種類の初期症状 (自律神経 /
              肩こり / 頭痛 など) が seed され、この画面から編集できるようになります。
            </div>
          </div>
        )}
        <CreativeSymptomList symptoms={symptoms} />
      </div>
    </div>
  );
}
