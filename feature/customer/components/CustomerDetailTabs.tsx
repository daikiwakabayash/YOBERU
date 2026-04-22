"use client";

import type { ReactNode } from "react";
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
  return (
    <Tabs defaultValue="info" className="w-full">
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
