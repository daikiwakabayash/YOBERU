"use client";

import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Plus, Pencil, ShieldCheck, Shield } from "lucide-react";
import { CreateAccountModal } from "./CreateAccountModal";
import { EditAccountModal } from "./EditAccountModal";
import type { AccountRow, BrandOption } from "../services/getAccounts";

interface Props {
  accounts: AccountRow[];
  brands: BrandOption[];
  canManage: boolean;
}

export function AccountList({ accounts, brands, canManage }: Props) {
  const [openCreate, setOpenCreate] = useState(false);
  const [editing, setEditing] = useState<AccountRow | null>(null);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-gray-500">
          {canManage
            ? `全 ${accounts.length} 件 / ルート権限: ${
                accounts.filter((a) => a.permissionType === "root").length
              } 件`
            : "root 権限が必要です"}
        </p>
        {canManage ? (
          <Button onClick={() => setOpenCreate(true)}>
            <Plus className="mr-1.5 h-4 w-4" />
            アカウントを発行
          </Button>
        ) : null}
      </div>

      {accounts.length === 0 ? (
        <Card className="p-8 text-center text-sm text-gray-400">
          アカウントが登録されていません
        </Card>
      ) : (
        <div className="space-y-2">
          {accounts.map((a) => {
            const isRoot = a.permissionType === "root";
            return (
              <Card key={a.id} className="overflow-hidden">
                <div className="flex items-center gap-4 p-4">
                  <div
                    className={
                      "flex h-12 w-12 shrink-0 items-center justify-center rounded-lg " +
                      (isRoot
                        ? "bg-gradient-to-br from-amber-50 to-orange-50"
                        : "bg-gradient-to-br from-blue-50 to-indigo-50")
                    }
                  >
                    {isRoot ? (
                      <ShieldCheck className="h-6 w-6 text-amber-500" />
                    ) : (
                      <Shield className="h-6 w-6 text-indigo-400" />
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-baseline gap-2">
                      <span className="text-base font-bold text-gray-900">
                        {a.name || "(氏名未設定)"}
                      </span>
                      {isRoot ? (
                        <Badge className="bg-amber-100 text-amber-700 hover:bg-amber-100">
                          ルート権限
                        </Badge>
                      ) : (
                        <Badge variant="secondary">
                          限定権限 / {a.brandName ?? `brand_id=${a.brandId}`}
                        </Badge>
                      )}
                    </div>
                    <div className="mt-1 font-mono text-xs text-gray-500">
                      {a.email}
                    </div>
                  </div>
                  {canManage ? (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setEditing(a)}
                    >
                      <Pencil className="mr-1.5 h-3.5 w-3.5" />
                      編集
                    </Button>
                  ) : null}
                </div>
              </Card>
            );
          })}
        </div>
      )}

      <CreateAccountModal
        open={openCreate}
        onClose={() => setOpenCreate(false)}
        brands={brands}
      />

      {editing && (
        <EditAccountModal
          open={true}
          onClose={() => setEditing(null)}
          account={editing}
          brands={brands}
        />
      )}
    </div>
  );
}
