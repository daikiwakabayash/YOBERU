import { Sidebar } from "@/components/layout/Sidebar";
import { DashboardHeader } from "@/components/layout/DashboardHeader";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    // h-[100dvh] (dynamic viewport height) instead of h-screen so the
    // mobile address-bar collapse on first scroll doesn't eat a touch
    // gesture. h-screen on iOS Safari is the *largest* possible viewport
    // and reflows when the address bar shrinks — that reflow can swallow
    // the very first scroll attempt.
    // 印刷時 (window.print) は Sidebar / DashboardHeader / overflow を
    // すべて取り払い、main の中身だけが用紙に乗るようにする。給与計算の
    // 請求書ページが「ブラウザの 印刷 → PDF として保存」で正しく出力
    // できるようにするため。
    <div className="flex h-[100dvh] print:block print:h-auto">
      <div className="print:hidden">
        <Sidebar />
      </div>
      <div className="flex flex-1 flex-col overflow-hidden print:overflow-visible">
        <div className="print:hidden">
          <DashboardHeader />
        </div>
        <main
          className="flex-1 overflow-y-auto bg-gray-50 print:overflow-visible print:bg-white"
          style={{
            // iOS momentum scrolling (legacy -webkit- property).
            WebkitOverflowScrolling: "touch",
            // Force the main scroll container to own vertical pan
            // (touch devices only — does not affect desktop mouse).
            touchAction: "pan-y",
          }}
        >
          {children}
        </main>
      </div>
    </div>
  );
}
