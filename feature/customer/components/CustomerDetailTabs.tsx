"use client";

import { useState, type ReactNode } from "react";
import { useSearchParams, useRouter, usePathname } from "next/navigation";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import { User, Image as ImageIcon, Calendar } from "lucide-react";

interface CustomerDetailTabsProps {
  infoTab: ReactNode;
  photosTab: ReactNode;
  historyTab: ReactNode;
}

const VALID_TABS = ["info", "photos", "history"] as const;
type TabValue = (typeof VALID_TABS)[number];

/**
 * 患者 DB (/customer/<id>) の詳細ページをタブ化するためのクライアント
 * 薄ラッパ。サーバー側で組み立てた 3 セクション (基本情報 / 写真 /
 * 来院履歴) を受け取って Base UI Tabs に流す。
 *
 * 「写真」は毎回開くものではないので、タブを切り替えた時だけ描画する
 * (TabsContent の中身はアンマウントされず DOM 上にはあるが、視覚的に
 * は隠れるので既定ビューがスッキリする)。
 */
export function CustomerDetailTabs({
  infoTab,
  photosTab,
  historyTab,
}: CustomerDetailTabsProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  // URL ?tab=photos をタブの初期値として採用。予約シートの「写真・動画」
  // リンクから直接このタブへ飛べるようにする。
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
    // URL を書き換えて履歴に残す。同一ページ内遷移なのでスクロールは
    // 維持したい → router.replace で history push は避ける。
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
      <TabsList>
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
    </Tabs>
  );
}
