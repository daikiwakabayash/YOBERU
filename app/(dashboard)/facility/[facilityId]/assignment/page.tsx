import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";

export default async function FacilityAssignmentPage({
  params,
}: {
  params: Promise<{ facilityId: string }>;
}) {
  const { facilityId } = await params;

  return (
    <div>
      <PageHeader
        title="設備対応メニュー"
        description={`設備ID: ${facilityId} に対応するメニューを管理`}
        actions={
          <Link href="/facility">
            <Button variant="outline" size="sm">
              <ArrowLeft className="mr-2 h-4 w-4" />
              設備一覧に戻る
            </Button>
          </Link>
        }
      />
      <div className="p-6">
        <Card>
          <CardHeader>
            <CardTitle>対応メニュー</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>メニュー管理ID</TableHead>
                  <TableHead>メニュー名</TableHead>
                  <TableHead className="text-right">操作</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                <TableRow>
                  <TableCell
                    colSpan={3}
                    className="text-center text-muted-foreground py-8"
                  >
                    Supabase 接続後にメニュー割当が表示されます
                  </TableCell>
                </TableRow>
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
