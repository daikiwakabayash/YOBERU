import { PageHeader } from "@/components/layout/PageHeader";

export default function ReceptionPage() {
  return (
    <div>
      <PageHeader title="受付" />
      <div className="p-6">
        <p className="text-muted-foreground">準備中</p>
      </div>
    </div>
  );
}
