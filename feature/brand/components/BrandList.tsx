"use client";

import { useState } from "react";
import Link from "next/link";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Plus, Pencil, Building2 } from "lucide-react";
import { CreateBrandModal } from "./CreateBrandModal";
import type { BrandRow } from "../services/getBrands";

interface Props {
  brands: BrandRow[];
  canCreate: boolean;
}

export function BrandList({ brands, canCreate }: Props) {
  const [open, setOpen] = useState(false);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-end">
        {canCreate ? (
          <Button onClick={() => setOpen(true)}>
            <Plus className="mr-1.5 h-4 w-4" />
            ブランドを作成
          </Button>
        ) : null}
      </div>

      {brands.length === 0 ? (
        <Card className="p-8 text-center text-sm text-gray-400">
          ブランドが登録されていません
        </Card>
      ) : (
        <div className="space-y-3">
          {brands.map((b) => (
            <Card key={b.id} className="overflow-hidden">
              <div className="flex items-center gap-4 p-4">
                <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-blue-50 to-indigo-50">
                  {b.logoUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={b.logoUrl}
                      alt={b.name}
                      className="h-12 w-12 rounded object-cover"
                    />
                  ) : (
                    <Building2 className="h-7 w-7 text-indigo-400" />
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-baseline gap-2">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-gray-400">
                      BRAND
                    </span>
                    <span className="text-xl font-black text-gray-900">
                      {b.name}
                    </span>
                    {b.code && (
                      <>
                        <span className="text-[10px] text-gray-300">|</span>
                        <span className="text-[10px] font-bold uppercase tracking-wider text-gray-400">
                          企業ID
                        </span>
                        <span className="font-mono text-sm font-bold text-gray-700">
                          {b.code}
                        </span>
                      </>
                    )}
                  </div>
                  <div className="mt-2 grid grid-cols-2 gap-x-6 gap-y-1 text-xs sm:grid-cols-4">
                    <Field label="予約間隔 (分)" value={`${b.frameMin ?? "-"}分`} />
                    <Field
                      label="初期予約時間 (分)"
                      value={b.ghostTime ?? "-"}
                    />
                    <Field
                      label="幽霊会員判定指定 (月)"
                      value={b.ghostTime ?? "-"}
                    />
                    <Field
                      label="コピーライト"
                      value={b.copyright ? `© ${b.copyright}` : "-"}
                    />
                  </div>
                </div>
                <Link href={`/brand/${b.id}`}>
                  <Button variant="outline" size="sm">
                    <Pencil className="mr-1.5 h-3.5 w-3.5" />
                    編集
                  </Button>
                </Link>
              </div>
            </Card>
          ))}
        </div>
      )}

      <CreateBrandModal open={open} onClose={() => setOpen(false)} />
    </div>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-[10px] text-gray-400">{label}</div>
      <div className="font-bold text-gray-800">{value}</div>
    </div>
  );
}
