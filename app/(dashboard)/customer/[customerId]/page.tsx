import { PageHeader } from "@/components/layout/PageHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Button } from "@/components/ui/button";
import { CustomerBackButton } from "@/feature/customer/components/CustomerBackButton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { getCustomer } from "@/feature/customer/services/getCustomers";
import { createClient } from "@/helper/lib/supabase/server";
import { CustomerDetailTabs } from "@/feature/customer/components/CustomerDetailTabs";
import { CustomerAttachmentsSection } from "@/feature/customer-attachment/components/CustomerAttachmentsSection";
import { AgreementSection } from "@/feature/agreement/components/AgreementSection";
import {
  getCustomerAgreements,
  getActiveTemplateWithDiagnostic,
} from "@/feature/agreement/services/getAgreement";
import { KarteEditor } from "@/feature/reservation/components/KarteEditor";
import {
  getActiveBrandId,
  getActiveShopId,
} from "@/helper/lib/shop-context";
import { headers } from "next/headers";
import Link from "next/link";
import {
  ArrowLeft,
  Phone,
  Mail,
  MapPin,
  Calendar,
  UserCog,
  FileText,
  BarChart3,
  UserPlus,
} from "lucide-react";

const TYPE_LABELS: Record<number, { label: string; color: string }> = {
  0: { label: "一般", color: "bg-gray-100 text-gray-700" },
  1: { label: "会員", color: "bg-blue-100 text-blue-700" },
  2: { label: "退会", color: "bg-red-100 text-red-700" },
};

const GENDER_LABELS: Record<number, string> = {
  0: "未設定",
  1: "男性",
  2: "女性",
};

interface CustomerDetailPageProps {
  params: Promise<{ customerId: string }>;
}

export default async function CustomerDetailPage({
  params,
}: CustomerDetailPageProps) {
  const { customerId } = await params;
  const id = Number(customerId);

  // 旧実装は customer が見つからないと notFound() で標準 404 を出していたが、
  // それだと「予約パネルから飛んできた人」が予約表へ戻れず詰んでしまう。
  // ハードな 404 をやめて、本ページ内に「顧客が見つかりません」UI と
  // 「前のページに戻る / 顧客一覧へ」ボタンを描画する形に置き換える。
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let customer: any = null;
  if (!isNaN(id)) {
    try {
      customer = await getCustomer(id);
    } catch {
      customer = null;
    }
  }
  if (!customer) {
    return (
      <div>
        <PageHeader
          title="顧客が見つかりません"
          description={`ID: ${customerId}`}
          actions={
            <div className="flex items-center gap-2">
              <CustomerBackButton />
              <Link href="/customer">
                <Button variant="outline" size="sm">
                  顧客一覧へ
                </Button>
              </Link>
            </div>
          }
        />
        <div className="p-6">
          <Card>
            <CardContent className="space-y-2 py-8 text-center text-sm text-gray-500">
              <p>この顧客は削除されたか、まだ登録されていません。</p>
              <p className="text-xs text-gray-400">
                予約に紐付いている顧客レコードが消えている場合は、予約パネル側で顧客を再選択してください。
              </p>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  // Fetch appointment history
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let appointments: any[] = [];
  try {
    const supabase = await createClient();
    // migration 00029 (customer_record_updated_at/_by) が未適用でも
    // 落ちないように、失敗したら監査カラム無しで再取得するフォールバック付き。
    let data: unknown[] | null = null;
    const first = await supabase
      .from("appointments")
      .select(
        "id, start_at, end_at, status, sales, memo, customer_record, customer_record_updated_at, customer_record_updated_by, menu_manage_id, staffs(name)"
      )
      .eq("customer_id", id)
      .is("deleted_at", null)
      .order("start_at", { ascending: false })
      .limit(50);
    if (
      first.error &&
      (first.error.message?.includes("customer_record_updated") ?? false)
    ) {
      const retry = await supabase
        .from("appointments")
        .select(
          "id, start_at, end_at, status, sales, memo, customer_record, menu_manage_id, staffs(name)"
        )
        .eq("customer_id", id)
        .is("deleted_at", null)
        .order("start_at", { ascending: false })
        .limit(50);
      data = retry.data ?? null;
    } else {
      data = first.data ?? null;
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    appointments = (data as any[]) ?? [];

    // Fetch menu names
    const menuIds = [...new Set(appointments.map((a) => a.menu_manage_id as string))];
    if (menuIds.length > 0) {
      const { data: menus } = await supabase
        .from("menus")
        .select("menu_manage_id, name")
        .in("menu_manage_id", menuIds);
      const menuMap = new Map((menus ?? []).map((m) => [m.menu_manage_id, m.name]));
      appointments = appointments.map((a) => ({
        ...a,
        menu_name: menuMap.get(a.menu_manage_id as string) ?? "不明",
      }));
    }
  } catch {
    // Supabase not connected
  }

  const fullName =
    [customer.last_name, customer.first_name].filter(Boolean).join(" ") || "顧客";
  const kanaName =
    [customer.last_name_kana, customer.first_name_kana].filter(Boolean).join(" ") || "";

  const typeInfo = TYPE_LABELS[(customer.type as number) ?? 0] ?? TYPE_LABELS[0];
  const totalSales = appointments
    .filter((a) => a.status === 2)
    .reduce((sum, a) => sum + ((a.sales as number) || 0), 0);
  const visitCount = appointments.filter((a) => a.status === 2).length;

  const brandId = await getActiveBrandId();
  const shopId = await getActiveShopId();

  // 同意書タブ用データ (顧客の既存同意書 + 会員申込テンプレート + ベース URL)
  const [customerAgreements, templateRes] = await Promise.all([
    getCustomerAgreements(id),
    getActiveTemplateWithDiagnostic({
      brandId,
      kind: "membership",
      ensureCreate: true,
    }),
  ]);
  const membershipTemplate = templateRes.template;
  const templateDiagnostic = templateRes.diagnostic;
  const reqHeaders = await headers();
  const proto = reqHeaders.get("x-forwarded-proto") ?? "https";
  const host = reqHeaders.get("host") ?? "";
  const baseUrl =
    process.env.NEXT_PUBLIC_APP_URL ??
    process.env.NEXT_PUBLIC_SITE_URL ??
    (host ? `${proto}://${host}` : "");

  return (
    <div>
      <PageHeader
        title={fullName}
        description={`顧客コード: ${customer.code ?? "-"}`}
        actions={
          <div className="flex items-center gap-2">
            <CustomerBackButton />
            <Link href="/customer/register">
              <Button size="sm">
                <UserPlus className="mr-1 h-4 w-4" />
                新規顧客を登録
              </Button>
            </Link>
            <Link href="/customer">
              <Button variant="outline" size="sm">
                <ArrowLeft className="mr-2 h-4 w-4" />
                顧客一覧に戻る
              </Button>
            </Link>
          </div>
        }
      />

      <div className="space-y-4 p-3 sm:space-y-6 sm:p-6">
        {/* Summary Cards — モバイルは 2x2、sm 以上で 4 列 */}
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 sm:gap-4">
          <Card>
            <CardContent className="p-3 sm:pt-4">
              <div className="text-xs text-muted-foreground sm:text-sm">来院回数</div>
              <div className="text-lg font-bold sm:text-2xl">{visitCount}回</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-3 sm:pt-4">
              <div className="text-xs text-muted-foreground sm:text-sm">累計売上</div>
              <div className="text-lg font-bold tabular-nums sm:text-2xl">
                ¥{totalSales.toLocaleString()}
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-3 sm:pt-4">
              <div className="text-xs text-muted-foreground sm:text-sm">ステータス</div>
              <Badge className={`mt-1 ${typeInfo.color}`}>{typeInfo.label}</Badge>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-3 sm:pt-4">
              <div className="text-xs text-muted-foreground sm:text-sm">最終来院</div>
              <div className="text-sm font-bold tabular-nums sm:text-lg">
                {appointments.length > 0
                  ? (appointments[0].start_at as string).slice(0, 10)
                  : "-"}
              </div>
            </CardContent>
          </Card>
        </div>

        <CustomerDetailTabs
          infoTab={
          <Card>
            <CardHeader>
              <CardTitle className="text-base">基本情報</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <div>
                <div className="font-medium text-lg">{fullName}</div>
                {kanaName && (
                  <div className="text-muted-foreground">{kanaName}</div>
                )}
              </div>
              <Separator />
              {customer.phone_number_1 && (
                <div className="flex items-center gap-2">
                  <Phone className="h-4 w-4 text-gray-400" />
                  <span>{customer.phone_number_1 as string}</span>
                </div>
              )}
              {customer.email && (
                <div className="flex items-center gap-2">
                  <Mail className="h-4 w-4 text-gray-400" />
                  <span>{customer.email as string}</span>
                </div>
              )}
              {customer.address && (
                <div className="flex items-center gap-2">
                  <MapPin className="h-4 w-4 text-gray-400" />
                  <span>
                    {customer.zip_code && `〒${customer.zip_code} `}
                    {customer.address as string}
                  </span>
                </div>
              )}
              <Separator />
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div>
                  <span className="text-gray-400">性別:</span>{" "}
                  {GENDER_LABELS[(customer.gender as number) ?? 0]}
                </div>
                <div>
                  <span className="text-gray-400">生年月日:</span>{" "}
                  {(customer.birth_date as string) || "-"}
                </div>
                <div>
                  <span className="text-gray-400">職業:</span>{" "}
                  {(customer.occupation as string) || "-"}
                </div>
                <div>
                  <span className="text-gray-400">LINE:</span>{" "}
                  {(customer.line_id as string) || "-"}
                </div>
              </div>
              {customer.description && (
                <>
                  <Separator />
                  <div>
                    <span className="text-gray-400 text-xs">メモ・問診票</span>
                    <div className="mt-2 space-y-2">
                      {(customer.description as string)
                        .split(/\n\n+/)
                        .map((block, bi) => {
                          const isQuestionnaire = block.startsWith("[");
                          return (
                            <div
                              key={bi}
                              className={
                                isQuestionnaire
                                  ? "rounded-lg border border-gray-200 bg-gray-50 p-3"
                                  : "rounded-lg border border-blue-100 bg-blue-50/50 p-3"
                              }
                            >
                              {block.split("\n").map((line, li) => {
                                if (line.startsWith("[") && line.endsWith("]")) {
                                  return (
                                    <div
                                      key={li}
                                      className="mb-1 text-[11px] font-bold text-gray-500"
                                    >
                                      {line.slice(1, -1)}
                                    </div>
                                  );
                                }
                                if (line.startsWith("- ")) {
                                  const colonIdx = line.indexOf(": ", 2);
                                  if (colonIdx > 0) {
                                    return (
                                      <div
                                        key={li}
                                        className="flex gap-2 py-0.5 text-[12px]"
                                      >
                                        <span
                                          className="w-28 shrink-0 truncate font-medium text-gray-500"
                                          title={line.slice(2, colonIdx)}
                                        >
                                          {line.slice(2, colonIdx)}
                                        </span>
                                        <span className="min-w-0 flex-1 break-words text-gray-800">
                                          {line.slice(colonIdx + 2)}
                                        </span>
                                      </div>
                                    );
                                  }
                                }
                                return (
                                  <div
                                    key={li}
                                    className="text-[12px] text-gray-700"
                                  >
                                    {line}
                                  </div>
                                );
                              })}
                            </div>
                          );
                        })}
                    </div>
                  </div>
                </>
              )}
              <Separator />
              <Link href={`/customer/${id}/edit`}>
                <Button variant="outline" size="sm" className="w-full">
                  <FileText className="mr-2 h-4 w-4" />
                  編集する
                </Button>
              </Link>
            </CardContent>
          </Card>
          }
          photosTab={
          <Card>
            <CardHeader>
              <CardTitle className="text-base">写真・ビフォアフ</CardTitle>
            </CardHeader>
            <CardContent>
              {/* スマホ / PC 両方から施術前後の写真をアップロード可能。
                  毎回開く必要はないのでタブ内に隔離してある。 */}
              <CustomerAttachmentsSection
                brandId={brandId}
                shopId={shopId}
                customerId={id}
              />
            </CardContent>
          </Card>
          }
          historyTab={
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Calendar className="h-4 w-4" />
                来院履歴・カルテ
              </CardTitle>
            </CardHeader>
            <CardContent>
              {appointments.length === 0 ? (
                <p className="py-8 text-center text-muted-foreground">
                  来院履歴がありません
                </p>
              ) : (
                <div className="space-y-4">
                  {appointments.map((appt) => {
                    const date = (appt.start_at as string).slice(0, 10);
                    const time = (appt.start_at as string).slice(11, 16);
                    const endTime = (appt.end_at as string).slice(11, 16);
                    const staff = appt.staffs as { name: string } | null;
                    const sales = (appt.sales as number) || 0;
                    const status = appt.status as number;
                    const carte = appt.customer_record as string | null;
                    const karteUpdatedAt =
                      (appt.customer_record_updated_at as string | null) ??
                      null;
                    const karteUpdatedBy =
                      (appt.customer_record_updated_by as string | null) ??
                      null;
                    const menuName = (appt as Record<string, unknown>).menu_name as string ?? "不明";
                    const isCancelled = status === 3 || status === 99;

                    return (
                      <div
                        key={appt.id as number}
                        className={`rounded-lg border p-4 ${isCancelled ? "opacity-50" : ""}`}
                      >
                        <div className="flex items-start justify-between">
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="font-bold">{date}</span>
                              <span className="text-sm text-gray-500">
                                {time}-{endTime}
                              </span>
                              <Badge variant="outline" className="text-xs">
                                {menuName}
                              </Badge>
                              {isCancelled && (
                                <Badge className="bg-red-100 text-red-600 text-xs">
                                  キャンセル
                                </Badge>
                              )}
                            </div>
                            <div className="mt-1 flex items-center gap-3 text-sm text-gray-500">
                              <span className="flex items-center gap-1">
                                <UserCog className="h-3 w-3" />
                                {staff?.name ?? "-"}
                              </span>
                              {sales > 0 && (
                                <span className="flex items-center gap-1">
                                  <BarChart3 className="h-3 w-3" />
                                  ¥{sales.toLocaleString()}
                                </span>
                              )}
                            </div>
                          </div>
                        </div>

                        {/* Carte content — 会計後もインラインで編集可能。
                            最終更新者のメール + 日時をカード右下に表示。 */}
                        {!isCancelled && (
                          <KarteEditor
                            appointmentId={appt.id as number}
                            initialText={carte}
                            updatedAt={karteUpdatedAt}
                            updatedBy={karteUpdatedBy}
                          />
                        )}
                        {isCancelled && carte && (
                          <div className="mt-3 rounded bg-gray-50 p-3 text-sm">
                            <div className="mb-1 text-xs font-medium text-gray-400">
                              カルテ
                            </div>
                            <p className="whitespace-pre-wrap text-gray-700">
                              {carte}
                            </p>
                          </div>
                        )}

                        {/* Memo */}
                        {appt.memo && (
                          <div className="mt-2 text-xs text-gray-400">
                            メモ: {appt.memo as string}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>
          }
          agreementsTab={
            <AgreementSection
              customerId={id}
              brandId={brandId}
              agreements={customerAgreements}
              membershipTemplate={membershipTemplate}
              templateDiagnostic={templateDiagnostic}
              baseUrl={baseUrl}
            />
          }
        />
      </div>
    </div>
  );
}
