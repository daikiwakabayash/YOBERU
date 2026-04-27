import type { Metadata } from "next";
import { Toaster } from "@/components/ui/sonner";
import "./globals.css";

export const metadata: Metadata = {
  title: "YOBERU - サロン予約管理システム",
  description: "整骨院・整体・エステ向け予約管理システム",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ja" className="h-full antialiased">
      <body className="min-h-full flex flex-col font-sans">
        {children}
        {/* モバイルでもエラー / 成功通知が読みやすいよう上部中央に配置 */}
        <Toaster position="top-center" richColors closeButton />
      </body>
    </html>
  );
}
