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
    <div className="flex h-[100dvh]">
      <Sidebar />
      <div className="flex flex-1 flex-col overflow-hidden">
        <DashboardHeader />
        <main
          className="flex-1 overflow-y-auto bg-gray-50"
          style={{
            // iOS momentum scrolling (legacy -webkit- property).
            WebkitOverflowScrolling: "touch",
            // Force the main scroll container to own vertical pan.
            touchAction: "pan-y",
            // Prevent rubber-band bounce at top/bottom edges which
            // causes "一度バウンドしてしまって進めない" on iOS /
            // macOS trackpad. `none` differs from `contain` in that
            // it does NOT swallow the initial scroll gesture the way
            // `contain` did (that was the earlier "1回目スクロール
            // できない" bug).
            overscrollBehavior: "none",
          }}
        >
          {children}
        </main>
      </div>
    </div>
  );
}
