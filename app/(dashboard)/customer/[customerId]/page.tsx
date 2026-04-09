import { notFound } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { getCustomer } from "@/feature/customer/services/getCustomers";
import { createClient } from "@/helper/lib/supabase/server";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";

const STATUS_MAP: Record<number, { label: string; color: string }> = {
  0: { label: "新規", color: "bg-blue-100 text-blue-700" },
  1: { label: "通院中", color: "bg-green-100 text-green-700" },
  2: { label: "離反", color: "bg-red-100 text-red-700" },
};

export default async function CustomerDetailPage({
  params,
}: {
  params: Promise<{ customerId: string }>;
}) {
  const { customerId } = await params;
  const id = Number(customerId);
  if (isNaN(id)) notFound();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let customer: any;
  try {
    customer = await getCustomer(id);
  } catch {
    notFound();
  }

  // Fetch visit history
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let appointments: any[] = [];
  let visitSourceName = "";
  try {
    const supabase = await createClient();

    const { data } = await supabase
      .from("appointments")
      .select(
        "id, start_at, end_at, status, sales, customer_record, menu_manage_id, staffs(name)"
      )
      .eq("customer_id", id)
      .is("deleted_at", null)
      .order("start_at", { ascending: false })
      .limit(50);
    appointments = data ?? [];

    // Menu names
    const menuIds = [
      ...new Set(appointments.map((a: { menu_manage_id: string }) => a.menu_manage_id)),
    ];
    if (menuIds.length > 0) {
      const { data: menus } = await supabase
        .from("menus")
        .select("menu_manage_id, name, duration")
        .in("menu_manage_id", menuIds);
      const menuMap = new Map(
        (menus ?? []).map((m: { menu_manage_id: string; name: string; duration: number }) => [m.menu_manage_id, m])
      );
      appointments = appointments.map((a: { menu_manage_id: string }) => ({
        ...a,
        menu: menuMap.get(a.menu_manage_id) ?? null,
      }));
    }

    // Visit source
    if (customer.first_visit_source_id) {
      const { data: vs } = await supabase
        .from("visit_sources")
        .select("name")
        .eq("id", customer.first_visit_source_id)
        .single();
      visitSourceName = vs?.name ?? "";
    }
  } catch {
    // Supabase not connected
  }

  const fullName =
    [customer.last_name, customer.first_name].filter(Boolean).join(" ") ||
    "不明";
  const completedAppts = appointments.filter(
    (a: { status: number }) => a.status === 2
  );
  const visitCount = customer.visit_count ?? completedAppts.length;
  const totalSales =
    customer.total_sales ??
    completedAppts.reduce(
      (sum: number, a: { sales: number }) => sum + (a.sales || 0),
      0
    );
  const lastVisit =
    customer.last_visit_date ??
    (appointments.length > 0 ? appointments[0].start_at?.slice(0, 10) : null);

  const statusInfo = STATUS_MAP[customer.type ?? 0] ?? STATUS_MAP[0];

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Back link */}
      <div className="border-b bg-white px-6 py-3">
        <Link
          href="/customer"
          className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-900"
        >
          <ArrowLeft className="h-4 w-4" />
          患者一覧に戻る
        </Link>
      </div>

      {/* Patient header - matches reference */}
      <div className="border-b bg-white px-6 py-5">
        <div className="flex items-start justify-between">
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-black">{fullName}</h1>
              <Badge className={statusInfo.color}>{statusInfo.label}</Badge>
            </div>
            <div className="mt-1 text-sm text-gray-500">
              {customer.phone_number_1 ?? ""}{" "}
              {customer.phone_number_1 && "| "}
              恵比寿院
              {visitSourceName && ` | ${visitSourceName}`}
            </div>
            <div className="mt-0.5 text-sm text-gray-400">
              {lastVisit ? `最終：${lastVisit}` : ""}
            </div>
          </div>
          <div className="text-right">
            <div className="text-sm text-gray-400">合計来院</div>
            <div className="text-3xl font-black text-green-700">
              {visitCount}回
            </div>
            <div className="mt-1 text-sm text-gray-400">累計利用金額</div>
            <div className="text-2xl font-black text-green-700">
              ¥{totalSales.toLocaleString()}
            </div>
          </div>
        </div>
      </div>

      {/* Carte History - matches reference */}
      <div className="mx-auto max-w-4xl px-6 py-6">
        <div className="rounded-xl border bg-white">
          <div className="border-b px-6 py-4">
            <h2 className="text-lg font-bold">カルテ履歴</h2>
          </div>
          <div className="divide-y">
            {appointments.length === 0 ? (
              <div className="px-6 py-12 text-center text-muted-foreground">
                来院履歴がありません
              </div>
            ) : (
              appointments.map(
                (appt: {
                  id: number;
                  start_at: string;
                  status: number;
                  sales: number;
                  customer_record: string | null;
                  menu: { name: string; duration: number } | null;
                }) => {
                  const date = appt.start_at?.slice(0, 10);
                  const menuName = appt.menu?.name ?? "不明";
                  const duration = appt.menu?.duration ?? 0;
                  const carte = appt.customer_record;
                  const isPlanInner = appt.sales === 0;

                  return (
                    <div key={appt.id} className="px-6 py-4">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <span className="text-base font-bold">{date}</span>
                          <Badge
                            variant="outline"
                            className="border-green-300 bg-green-50 text-green-700"
                          >
                            {menuName}（{duration}分）
                          </Badge>
                        </div>
                        <span className="text-sm text-gray-400">
                          {isPlanInner
                            ? "プラン内"
                            : appt.sales > 0
                              ? `¥${appt.sales.toLocaleString()}`
                              : ""}
                        </span>
                      </div>
                      {carte && (
                        <p className="mt-2 text-sm text-gray-600">{carte}</p>
                      )}
                    </div>
                  );
                }
              )
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
