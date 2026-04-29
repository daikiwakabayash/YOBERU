"use client";

import { useState, type ReactNode } from "react";
import { useSearchParams, useRouter, usePathname } from "next/navigation";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import { User, Image as ImageIcon, Calendar, FileSignature } from "lucide-react";

interface CustomerDetailTabsProps {
  infoTab: ReactNode;
  photosTab: ReactNode;
  historyTab: ReactNode;
  agreementsTab: ReactNode;
}

const VALID_TABS = ["info", "photos", "history", "agreements"] as const;
type TabValue = (typeof VALID_TABS)[number];

/**
 * 患者 DB (/customer/<id>) の詳細ページをタブ化するためのクライアント
 * 薄ラッパ。サーバー側で組み立てたセクション (基本情報 / 写真 /
 * 来院履歴 / 同意書) を受け取って Base UI Tabs に流す。
 */
export function CustomerDetailTabs({
  infoTab,
  photosTab,
  historyTab,
  agreementsTab,
}: CustomerDetailTabsProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const initialTab: TabValue = (() => {
    const t = searchParams.get("tab");
    if (t && (VALID_TABS as readonly string[]).includes(t)) {
      return t as TabValue;
    }
    return "info";
  })();

  const [value, setValue] = useState<TabValue>(initialTab);

  function handleChange(next: TabValue) {
    setValue(next);
    const params = new URLSearchParams(searchParams.toString());
    if (next === "info") {
      params.delete("tab");
    } else {
      params.set("tab", next);
    }
    const qs = params.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, {
      scroll: false,
    });
  }

  return (
    <Tabs
      value={value}
      onValueChange={(v) => {
        if (v && (VALID_TABS as readonly string[]).includes(v)) {
          handleChange(v as TabValue);
        }
      }}
      className="w-full"
    >
      <TabsList className="flex flex-wrap">
        <TabsTrigger value="info">
          <User className="mr-1 h-4 w-4" />
          基本情報
        </TabsTrigger>
        <TabsTrigger value="photos">
          <ImageIcon className="mr-1 h-4 w-4" />
          写真・ビフォアフ
        </TabsTrigger>
        <TabsTrigger value="history">
          <Calendar className="mr-1 h-4 w-4" />
          来院履歴
        </TabsTrigger>
        <TabsTrigger value="agreements">
          <FileSignature className="mr-1 h-4 w-4" />
          同意書
        </TabsTrigger>
      </TabsList>
      <TabsContent value="info" className="mt-4">
        {infoTab}
      </TabsContent>
      <TabsContent value="photos" className="mt-4">
        {photosTab}
      </TabsContent>
      <TabsContent value="history" className="mt-4">
        {historyTab}
      </TabsContent>
      <TabsContent value="agreements" className="mt-4">
        {agreementsTab}
      </TabsContent>
    </Tabs>
  );
}
