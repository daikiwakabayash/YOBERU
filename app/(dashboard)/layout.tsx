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
          // overscroll-contain: stop scroll chaining to the (h-dvh)
          // parent which otherwise can swallow the first wheel/touch
          // event when the inner scroll is at its top edge.
          style={{ overscrollBehavior: "contain" }}
        >
          {children}
        </main>
      </div>
    </div>
  );
}
