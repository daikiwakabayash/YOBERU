"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Coffee } from "lucide-react";
import { BulkBreakDialog } from "./BulkBreakDialog";

interface BulkBreakActionButtonProps {
  brandId: number;
  shopId: number;
  staffs: Array<{ id: number; name: string }>;
  defaultStartDate: string;
}

export function BulkBreakActionButton({
  brandId,
  shopId,
  staffs,
  defaultStartDate,
}: BulkBreakActionButtonProps) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <Button variant="outline" onClick={() => setOpen(true)}>
        <Coffee className="mr-1 h-4 w-4" />
        休憩一括設定
      </Button>
      <BulkBreakDialog
        open={open}
        onClose={() => setOpen(false)}
        brandId={brandId}
        shopId={shopId}
        staffs={staffs}
        defaultStartDate={defaultStartDate}
      />
    </>
  );
}
