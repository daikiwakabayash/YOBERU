import { PageHeader } from "@/components/layout/PageHeader";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  BENEFITS,
  CATEGORY_LABEL,
  CATEGORY_ORDER,
} from "@/feature/benefits/benefitsMaster";

export const dynamic = "force-dynamic";

export default async function BenefitsPage() {
  // 正社員視点で全項目を整理表示する。
  // 業務委託にも適用される項目は contractor: true でバッジを付ける。

  return (
    <div>
      <PageHeader
        title="福利厚生"
        description="正社員は全員同じ条件で適用されます。業務委託にも提供される項目は『業務委託OK』バッジ付き。"
      />
      <div className="space-y-6 p-6">
        {CATEGORY_ORDER.map((cat) => {
          const items = BENEFITS.filter((b) => b.category === cat);
          if (items.length === 0) return null;
          return (
            <Card key={cat}>
              <CardContent className="space-y-3 p-4">
                <h2 className="text-base font-bold">
                  {CATEGORY_LABEL[cat]}
                  <span className="ml-2 text-xs font-normal text-gray-500">
                    {items.length} 項目
                  </span>
                </h2>
                <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  {items.map((b) => (
                    <li
                      key={b.title}
                      className="rounded-lg border bg-white p-3 text-sm"
                    >
                      <div className="flex items-baseline gap-2">
                        <span className="font-bold">{b.title}</span>
                        <Badge
                          variant="outline"
                          className="border-purple-200 bg-purple-50 text-[10px] text-purple-700"
                        >
                          正社員
                        </Badge>
                        {b.contractor && (
                          <Badge
                            variant="outline"
                            className="border-blue-200 bg-blue-50 text-[10px] text-blue-700"
                          >
                            業務委託OK
                          </Badge>
                        )}
                      </div>
                      <p className="mt-1 text-xs text-gray-600">
                        {b.description}
                      </p>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          );
        })}

        <Card className="border-amber-200 bg-amber-50/30">
          <CardContent className="p-4 text-xs text-amber-900">
            ⚠ 雇用保険料率 / 健康保険料率は毎年改定されます。給与計算
            (/payroll) の控除セクションで毎月の控除額を入力する際は
            最新の料率に合わせて金額を調整してください。「毎月のデフォルトとして保存する」
            にチェックを入れて記録すると、翌月以降は自動で同じ金額が prefill されます。
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
