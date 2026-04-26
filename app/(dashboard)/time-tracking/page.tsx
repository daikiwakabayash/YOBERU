import { PageHeader } from "@/components/layout/PageHeader";
import { Card, CardContent } from "@/components/ui/card";
import { getActiveShopId } from "@/helper/lib/shop-context";
import { getShopMonthlyTimeRecords } from "@/feature/time-tracking/services/getShopMonthlyTimeRecords";
import { toLocalDateString } from "@/helper/utils/time";

export const dynamic = "force-dynamic";

interface Props {
  searchParams: Promise<{ ym?: string }>;
}

function defaultYearMonth(): string {
  return toLocalDateString(new Date()).slice(0, 7);
}

const minutesToHm = (m: number) => {
  const h = Math.floor(m / 60);
  const mm = m % 60;
  return `${h}h ${String(mm).padStart(2, "0")}m`;
};

const formatTime = (iso: string | null) => {
  if (!iso) return "—";
  const d = new Date(iso);
  return new Intl.DateTimeFormat("ja-JP", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Asia/Tokyo",
  }).format(d);
};

export default async function TimeTrackingPage({ searchParams }: Props) {
  const { ym } = await searchParams;
  const yearMonth =
    ym && /^\d{4}-\d{2}$/.test(ym) ? ym : defaultYearMonth();

  const shopId = await getActiveShopId();
  const rows = await getShopMonthlyTimeRecords({ shopId, yearMonth });

  // staff 別にまとめて月合計を出す
  const byStaff = new Map<
    number,
    {
      staffName: string;
      days: number;
      totalMinutes: number;
      breakMinutes: number;
      rows: typeof rows;
    }
  >();
  for (const r of rows) {
    if (!byStaff.has(r.staffId)) {
      byStaff.set(r.staffId, {
        staffName: r.staffName,
        days: 0,
        totalMinutes: 0,
        breakMinutes: 0,
        rows: [],
      });
    }
    const b = byStaff.get(r.staffId)!;
    if (r.workMinutes > 0) b.days += 1;
    b.totalMinutes += r.workMinutes;
    b.breakMinutes += r.breakMinutes;
    b.rows.push(r);
  }

  return (
    <div>
      <PageHeader
        title="勤怠記録"
        description={`Web 打刻 (出勤 / 退勤 / 休憩) の集計 — ${yearMonth}`}
      />
      <div className="space-y-4 p-6">
        {byStaff.size === 0 ? (
          <Card>
            <CardContent className="p-6 text-center text-sm text-gray-500">
              {yearMonth} の打刻記録はまだありません。
            </CardContent>
          </Card>
        ) : (
          [...byStaff.entries()].map(([staffId, b]) => (
            <Card key={staffId}>
              <CardContent className="space-y-3 p-4">
                <div className="flex items-baseline justify-between">
                  <h2 className="text-base font-bold">{b.staffName}</h2>
                  <div className="text-xs text-gray-600">
                    出勤日数:{" "}
                    <span className="font-bold">{b.days} 日</span>
                    <span className="mx-2 text-gray-300">|</span>
                    実労働:{" "}
                    <span className="font-bold tabular-nums">
                      {minutesToHm(b.totalMinutes)}
                    </span>
                    <span className="mx-2 text-gray-300">|</span>
                    休憩計:{" "}
                    <span className="font-bold tabular-nums">
                      {minutesToHm(b.breakMinutes)}
                    </span>
                  </div>
                </div>
                <div className="overflow-x-auto rounded border text-xs">
                  <table className="w-full text-left">
                    <thead className="bg-gray-50 text-gray-600">
                      <tr>
                        <th className="px-3 py-2">日付</th>
                        <th className="px-3 py-2">出勤</th>
                        <th className="px-3 py-2">退勤</th>
                        <th className="px-3 py-2">実労働</th>
                        <th className="px-3 py-2">休憩</th>
                      </tr>
                    </thead>
                    <tbody>
                      {b.rows.map((r) => (
                        <tr
                          key={`${r.staffId}|${r.workDate}`}
                          className="border-t"
                        >
                          <td className="px-3 py-2 tabular-nums">
                            {r.workDate}
                          </td>
                          <td className="px-3 py-2 tabular-nums">
                            {formatTime(r.clockInAt)}
                          </td>
                          <td className="px-3 py-2 tabular-nums">
                            {formatTime(r.clockOutAt)}
                          </td>
                          <td className="px-3 py-2 tabular-nums">
                            {minutesToHm(r.workMinutes)}
                          </td>
                          <td className="px-3 py-2 tabular-nums">
                            {minutesToHm(r.breakMinutes)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          ))
        )}
      </div>
    </div>
  );
}
