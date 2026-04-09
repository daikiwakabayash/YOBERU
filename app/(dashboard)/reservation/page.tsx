import { PageHeader } from "@/components/layout/PageHeader";

export default function ReservationPage() {
  return (
    <div>
      <PageHeader title="予約表" />
      <div className="p-6">
        <p className="text-muted-foreground">準備中</p>
      </div>
    </div>
  );
}
