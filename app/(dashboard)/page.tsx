import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

/**
 * Root of the dashboard. The standalone "ダッシュボード" placeholder
 * has been retired — staff now land directly on the day's calendar
 * (the screen where 99% of the work happens).
 *
 * Kept as a redirector instead of being deleted so anyone with `/`
 * bookmarked still gets a working page.
 */
export default function DashboardRoot() {
  redirect("/reservation");
}
