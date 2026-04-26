import { PageHeader } from "@/components/layout/PageHeader";
import { Card, CardContent } from "@/components/ui/card";
import { getCurrentStaffWithShop } from "@/feature/time-tracking/services/getCurrentStaff";
import { getTodayPunches } from "@/feature/time-tracking/services/getTodayPunches";
import { PunchClient } from "@/feature/time-tracking/components/PunchClient";

export const dynamic = "force-dynamic";

export default async function PunchPage() {
  const staff = await getCurrentStaffWithShop();

  if (!staff) {
    return (
      <div>
        <PageHeader
          title="Web 打刻"
          description="ログインユーザーに紐付くスタッフが見つかりませんでした"
        />
        <div className="p-6">
          <Card>
            <CardContent className="space-y-2 p-6 text-sm text-gray-600">
              <p>
                打刻するにはログインユーザー (Supabase Auth)
                に紐付くスタッフレコードが必要です。
              </p>
              <p>
                本部で
                <code className="mx-1 rounded bg-gray-100 px-1 py-0.5 text-xs">
                  staffs.user_id
                </code>
                とログインユーザーの紐付けを行ってください。
              </p>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  const todayPunches = await getTodayPunches(staff.staffId);

  return (
    <div>
      <PageHeader
        title="Web 打刻"
        description="出勤 / 退勤 / 休憩を記録します。店舗から半径 1 km 以内でのみ打刻できます"
      />
      <PunchClient
        staffId={staff.staffId}
        staffName={staff.staffName}
        shopName={staff.shopName}
        shopAddress={staff.shopAddress}
        shopLatitude={staff.shopLatitude}
        shopLongitude={staff.shopLongitude}
        punchRadiusM={staff.punchRadiusM}
        todayPunches={todayPunches}
      />
    </div>
  );
}
