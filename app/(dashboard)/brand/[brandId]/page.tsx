import Link from "next/link";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/layout/PageHeader";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Building2 } from "lucide-react";
import { createClient } from "@/helper/lib/supabase/server";

export const dynamic = "force-dynamic";

interface BrandDetailPageProps {
  params: Promise<{ brandId: string }>;
}

export default async function BrandDetailPage({
  params,
}: BrandDetailPageProps) {
  const { brandId } = await params;
  const id = Number(brandId);
  if (!Number.isFinite(id)) notFound();

  const supabase = await createClient();
  const { data: brand } = await supabase
    .from("brands")
    .select(
      "id, name, code, frame_min, ghost_time, copyright, logo_url, created_at"
    )
    .eq("id", id)
    .is("deleted_at", null)
    .maybeSingle();
  if (!brand) notFound();

  // Brand-wide shop count
  const { count: shopCount } = await supabase
    .from("shops")
    .select("id", { count: "exact", head: true })
    .eq("brand_id", id)
    .is("deleted_at", null);

  return (
    <div>
      <PageHeader title={`${brand.name as string} の詳細`} />
      <div className="space-y-4 p-6">
        <div>
          <Link href="/brand">
            <Button variant="outline" size="sm">
              <ArrowLeft className="mr-1.5 h-3.5 w-3.5" />
              ブランド一覧に戻る
            </Button>
          </Link>
        </div>

        <Card className="overflow-hidden">
          <div className="flex items-center gap-4 border-b bg-gradient-to-r from-blue-50 to-indigo-50 p-5">
            <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-lg bg-white/80 shadow-sm">
              {brand.logo_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={brand.logo_url as string}
                  alt={brand.name as string}
                  className="h-14 w-14 rounded object-cover"
                />
              ) : (
                <Building2 className="h-8 w-8 text-indigo-400" />
              )}
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-[10px] font-bold uppercase tracking-wider text-gray-500">
                BRAND
              </div>
              <div className="text-2xl font-black text-gray-900">
                {brand.name as string}
              </div>
              {brand.code ? (
                <div className="mt-1 flex items-baseline gap-2">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-gray-400">
                    企業ID
                  </span>
                  <span className="font-mono text-sm font-bold text-gray-700">
                    {brand.code as string}
                  </span>
                </div>
              ) : null}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4 p-5 sm:grid-cols-4">
            <Field
              label="予約間隔 (分)"
              value={`${(brand.frame_min as number | null) ?? "-"} 分`}
            />
            <Field
              label="幽霊会員判定 (月)"
              value={(brand.ghost_time as string | null) ?? "-"}
            />
            <Field
              label="コピーライト"
              value={
                brand.copyright ? `© ${brand.copyright as string}` : "-"
              }
            />
            <Field label="店舗数" value={`${shopCount ?? 0} 店舗`} />
          </div>
        </Card>

        <Card className="p-5">
          <div className="text-sm font-bold text-gray-700">
            詳細編集
          </div>
          <p className="mt-1 text-xs text-gray-500">
            ロゴ画像 / 予約間隔 / 表示設定などの編集 UI は次フェーズで
            実装予定です。現状は新規ブランド作成と一覧表示のみ動作します。
          </p>
        </Card>
      </div>
    </div>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-[10px] font-bold uppercase tracking-wider text-gray-400">
        {label}
      </div>
      <div className="mt-0.5 text-sm font-bold text-gray-800">{value}</div>
    </div>
  );
}
