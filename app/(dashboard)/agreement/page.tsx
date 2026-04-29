import Link from "next/link";
import { PageHeader } from "@/components/layout/PageHeader";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ExternalLink, CheckCircle2 } from "lucide-react";
import { getShopAgreements } from "@/feature/agreement/services/getAgreement";
import {
  AGREEMENT_KIND_LABEL,
  AGREEMENT_STATUS_LABEL,
  type AgreementKind,
} from "@/feature/agreement/types";
import { getActiveShopId } from "@/helper/lib/shop-context";

export const dynamic = "force-dynamic";

interface Props {
  searchParams: Promise<{ kind?: string }>;
}

const TABS: { key: AgreementKind | "all"; label: string }[] = [
  { key: "all", label: "すべて" },
  { key: "membership", label: "会員申込書" },
  { key: "receipt", label: "領収書 (Phase 2)" },
];

export default async function AgreementListPage({ searchParams }: Props) {
  const { kind } = await searchParams;
  const activeKind: AgreementKind | undefined =
    kind === "membership" || kind === "receipt" || kind === "consent"
      ? kind
      : undefined;

  const shopId = await getActiveShopId();
  const rows = await getShopAgreements({ shopId, kind: activeKind });

  return (
    <div>
      <PageHeader
        title="同意書 (電子契約)"
        description="会員申込書 / 領収書 等の電子契約一覧"
      />
      <div className="space-y-4 p-3 sm:p-6">
        {/* タブ */}
        <div className="flex flex-wrap gap-2 border-b pb-2">
          {TABS.map((t) => {
            const isActive =
              t.key === "all" ? !activeKind : activeKind === t.key;
            const href =
              t.key === "all" ? "/agreement" : `/agreement?kind=${t.key}`;
            return (
              <Link
                key={t.key}
                href={href}
                className={`rounded-md px-3 py-1.5 text-sm transition-colors ${
                  isActive
                    ? "bg-gray-900 text-white"
                    : "bg-white text-gray-600 hover:bg-gray-50 border"
                }`}
              >
                {t.label}
              </Link>
            );
          })}
        </div>

        {rows.length === 0 ? (
          <Card>
            <CardContent className="p-6 text-center text-sm text-gray-500">
              対象の同意書はまだありません
            </CardContent>
          </Card>
        ) : (
          <ul className="space-y-2">
            {rows.map((a) => {
              const statusColor =
                a.status === "signed"
                  ? "bg-emerald-100 text-emerald-800"
                  : a.status === "cancelled"
                    ? "bg-gray-200 text-gray-600"
                    : "bg-amber-100 text-amber-800";
              return (
                <li key={a.id}>
                  <Card>
                    <CardContent className="space-y-1 p-3">
                      <div className="flex flex-wrap items-baseline gap-2">
                        <Link
                          href={`/customer/${a.customerId}?tab=agreements`}
                          className="font-bold text-gray-900 hover:underline"
                        >
                          {a.customerName ?? `顧客 ${a.customerId}`}
                        </Link>
                        <Badge variant="outline" className="bg-blue-50 text-blue-700">
                          {AGREEMENT_KIND_LABEL[a.kind]}
                        </Badge>
                        <Badge className={statusColor}>
                          {a.status === "signed" && (
                            <CheckCircle2 className="mr-1 h-3 w-3" />
                          )}
                          {AGREEMENT_STATUS_LABEL[a.status]}
                        </Badge>
                      </div>
                      <div className="flex flex-wrap gap-3 text-[11px] text-gray-500">
                        <span>
                          発行:{" "}
                          {new Date(a.createdAt).toLocaleString("ja-JP", {
                            timeZone: "Asia/Tokyo",
                          })}
                        </span>
                        {a.signedAt && (
                          <span className="text-emerald-700">
                            署名:{" "}
                            {new Date(a.signedAt).toLocaleString("ja-JP", {
                              timeZone: "Asia/Tokyo",
                            })}
                          </span>
                        )}
                        {a.notifiedAt && <span>送信済 ({a.notifiedVia})</span>}
                      </div>
                      <Link
                        href={`/agree/${a.uuid}`}
                        target="_blank"
                        className="inline-flex items-center gap-1 text-xs text-blue-700 hover:underline"
                      >
                        <ExternalLink className="h-3 w-3" />
                        署名ページを開く
                      </Link>
                    </CardContent>
                  </Card>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
