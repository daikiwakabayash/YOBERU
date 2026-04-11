import { PageHeader } from "@/components/layout/PageHeader";
import { StoreForm } from "@/feature/store/components/StoreForm";
import { getStore } from "@/feature/store/services/getStores";
import { DeleteStoreButton } from "@/feature/store/components/DeleteStoreButton";
import { notFound } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { createClient } from "@/helper/lib/supabase/server";

export const dynamic = "force-dynamic";

interface StoreDetailPageProps {
  params: Promise<{ storeId: string }>;
}

export default async function StoreDetailPage({ params }: StoreDetailPageProps) {
  const { storeId } = await params;
  const id = Number(storeId);

  if (isNaN(id)) notFound();

  let store;
  try {
    store = await getStore(id);
  } catch {
    notFound();
  }

  // Load areas for the edit form selector
  const supabase = await createClient();
  let areas: Array<{ id: number; name: string }> = [];
  try {
    const { data } = await supabase
      .from("areas")
      .select("id, name")
      .eq("brand_id", store.brand_id)
      .order("sort_number");
    areas = data ?? [];
  } catch {
    areas = [];
  }

  const initialData = {
    id: store.id,
    uuid: store.uuid,
    brand_id: store.brand_id,
    area_id: store.area_id,
    user_id: store.user_id,
    name: store.name,
    frame_min: store.frame_min,
    scale: store.scale,
    email1: store.email1,
    email2: store.email2 ?? "",
    line_url: store.line_url ?? "",
    zip_code: store.zip_code,
    address: store.address,
    nearest_station_access: store.nearest_station_access ?? "",
    phone_number: store.phone_number,
    shop_url: store.shop_url ?? "",
    is_public: store.is_public,
    sort_number: store.sort_number ?? 0,
  };

  return (
    <div>
      <PageHeader
        title="店舗詳細"
        description={store.name}
        actions={<DeleteStoreButton storeId={store.id} storeName={store.name} />}
      />
      <div className="space-y-6 p-6">
        {/* Detail view */}
        <Card>
          <CardHeader>
            <CardTitle>店舗情報</CardTitle>
          </CardHeader>
          <CardContent>
            <dl className="grid grid-cols-1 gap-4 text-sm md:grid-cols-2">
              <DetailItem label="店舗名" value={store.name} />
              <DetailItem label="エリア" value={store.areas?.name ?? "-"} />
              <DetailItem label="郵便番号" value={formatZipCode(store.zip_code)} />
              <DetailItem label="住所" value={store.address} />
              <DetailItem label="電話番号" value={store.phone_number} />
              <DetailItem label="メールアドレス1" value={store.email1} />
              <DetailItem label="メールアドレス2" value={store.email2 || "-"} />
              <DetailItem
                label="予約枠"
                value={`${store.frame_min}分`}
              />
              <DetailItem
                label="規模"
                value={
                  store.scale === 1
                    ? "小規模"
                    : store.scale === 2
                      ? "中規模"
                      : "大規模"
                }
              />
              <DetailItem label="LINE URL" value={store.line_url || "-"} />
              <DetailItem
                label="最寄り駅アクセス"
                value={store.nearest_station_access || "-"}
              />
              <DetailItem label="店舗URL" value={store.shop_url || "-"} />
              <DetailItem
                label="公開状態"
                value={store.is_public ? "公開" : "非公開"}
              />
              <DetailItem
                label="表示順"
                value={String(store.sort_number ?? 0)}
              />
            </dl>
          </CardContent>
        </Card>

        {/* Edit form */}
        <div>
          <h2 className="mb-4 text-lg font-bold text-gray-900">店舗情報を編集</h2>
          <StoreForm
            initialData={initialData}
            brandId={store.brand_id}
            userId={store.user_id}
            areas={areas}
          />
        </div>
      </div>
    </div>
  );
}

function DetailItem({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="font-medium text-muted-foreground">{label}</dt>
      <dd className="mt-1 text-gray-900">{value}</dd>
    </div>
  );
}

function formatZipCode(zip: string) {
  if (zip.length === 7) {
    return `${zip.slice(0, 3)}-${zip.slice(3)}`;
  }
  return zip;
}
