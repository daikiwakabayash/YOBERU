import { PageHeader } from "@/components/layout/PageHeader";
import { createClient } from "@/helper/lib/supabase/server";
import { CustomerDashboard } from "@/feature/customer/components/CustomerDashboard";

// TODO: shopId should come from session/context. Using 1 as placeholder.
const SHOP_ID = 1;

interface CustomerListPageProps {
  searchParams: Promise<{
    status?: string;
    period?: string;
    source?: string;
    page?: string;
  }>;
}

export default async function CustomerListPage({ searchParams }: CustomerListPageProps) {
  const params = await searchParams;
  const supabase = await createClient();

  // ---------- Fetch visit sources for filter dropdown ----------
  const { data: visitSources } = await supabase
    .from("visit_sources")
    .select("id, name")
    .eq("shop_id", SHOP_ID)
    .is("deleted_at", null)
    .order("sort_number");

  // ---------- Build customer query ----------
  let query = supabase
    .from("customers")
    .select("*, visit_sources:first_visit_source_id(id, name)", { count: "exact" })
    .eq("shop_id", SHOP_ID)
    .is("deleted_at", null)
    .order("created_at", { ascending: false });

  // Status filter (通院中 / 未来店 / 新規 / 離反)
  // We derive status from visit_count and last_visit_date:
  //   新規: visit_count == 0 or null
  //   通院中: last_visit_date within 90 days
  //   未来店: last_visit_date between 91-180 days ago
  //   離反: last_visit_date > 180 days ago
  const now = new Date();
  if (params.status === "active") {
    const d90 = new Date(now);
    d90.setDate(d90.getDate() - 90);
    query = query.gte("last_visit_date", d90.toISOString().slice(0, 10)).gt("visit_count", 0);
  } else if (params.status === "inactive") {
    const d90 = new Date(now);
    d90.setDate(d90.getDate() - 90);
    const d180 = new Date(now);
    d180.setDate(d180.getDate() - 180);
    query = query
      .lt("last_visit_date", d90.toISOString().slice(0, 10))
      .gte("last_visit_date", d180.toISOString().slice(0, 10));
  } else if (params.status === "new") {
    query = query.or("visit_count.is.null,visit_count.eq.0");
  } else if (params.status === "churned") {
    const d180 = new Date(now);
    d180.setDate(d180.getDate() - 180);
    query = query.lt("last_visit_date", d180.toISOString().slice(0, 10)).gt("visit_count", 0);
  }

  // Visit source filter
  if (params.source) {
    query = query.eq("first_visit_source_id", Number(params.source));
  }

  // Pagination
  const page = params.page ? Number(params.page) : 1;
  const perPage = 20;
  const from = (page - 1) * perPage;
  const to = from + perPage - 1;
  query = query.range(from, to);

  const { data: customers, count } = await query;
  const totalCount = count ?? 0;

  // ---------- Summary counts ----------
  const { count: totalAll } = await supabase
    .from("customers")
    .select("*", { count: "exact", head: true })
    .eq("shop_id", SHOP_ID)
    .is("deleted_at", null);

  const d90 = new Date(now);
  d90.setDate(d90.getDate() - 90);
  const d180 = new Date(now);
  d180.setDate(d180.getDate() - 180);

  const { count: activeCount } = await supabase
    .from("customers")
    .select("*", { count: "exact", head: true })
    .eq("shop_id", SHOP_ID)
    .is("deleted_at", null)
    .gte("last_visit_date", d90.toISOString().slice(0, 10))
    .gt("visit_count", 0);

  const { count: inactiveCount } = await supabase
    .from("customers")
    .select("*", { count: "exact", head: true })
    .eq("shop_id", SHOP_ID)
    .is("deleted_at", null)
    .lt("last_visit_date", d90.toISOString().slice(0, 10))
    .gte("last_visit_date", d180.toISOString().slice(0, 10));

  const { count: churnedCount } = await supabase
    .from("customers")
    .select("*", { count: "exact", head: true })
    .eq("shop_id", SHOP_ID)
    .is("deleted_at", null)
    .lt("last_visit_date", d180.toISOString().slice(0, 10))
    .gt("visit_count", 0);

  const summary = {
    total: totalAll ?? 0,
    active: activeCount ?? 0,
    inactive: inactiveCount ?? 0,
    churned: churnedCount ?? 0,
  };

  return (
    <div>
      <PageHeader title="顧客一覧" description="患者データベースの管理" />
      <div className="p-6">
        <CustomerDashboard
          customers={customers ?? []}
          totalCount={totalCount}
          summary={summary}
          visitSources={visitSources ?? []}
          shopId={SHOP_ID}
        />
      </div>
    </div>
  );
}
