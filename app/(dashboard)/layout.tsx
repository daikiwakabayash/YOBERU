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
            // iOS momentum scrolling. Without this, once the first
            // touch gesture decision is (belatedly) resolved the
            // scroll feels "stuck" until the second swipe — exactly
            // the "一回目がかなり遅い" symptom.
            WebkitOverflowScrolling: "touch",
            // Force the main scroll container to claim vertical pan
            // itself, independent of whatever touchAction the inner
            // cards declare. Some Chromium versions decide gesture
            // intent on the FIRST ancestor whose touch-action is
            // anything other than auto, so we make that ancestor the
            // scroller instead of the app card.
            touchAction: "pan-y",
          }}
        >
          {children}
        </main>
      </div>
    </div>
  );
}
