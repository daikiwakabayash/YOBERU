/**
 * Next.js loading boundary for /reservation.
 *
 * This renders INSTANTLY when navigating (clicking 翌日 / 前日 / 週 /
 * スタッフ切替) while the server component re-fetches data. Without
 * this, the user sees the PREVIOUS day's data for 1-2 seconds until
 * the new data arrives — that's the "ラグがある" symptom.
 *
 * With the skeleton, the old page swaps to this immediately, then the
 * real data replaces it once ready. Much faster perceived speed.
 */
export default function ReservationLoading() {
  return (
    <div className="animate-pulse">
      {/* Header skeleton */}
      <div className="border-b px-6 py-4">
        <div className="flex items-center justify-between">
          <div className="h-7 w-20 rounded bg-gray-200" />
          <div className="flex gap-2">
            <div className="h-8 w-16 rounded bg-gray-200" />
            <div className="h-8 w-40 rounded bg-gray-200" />
            <div className="h-8 w-16 rounded bg-gray-200" />
            <div className="h-8 w-12 rounded bg-gray-200" />
          </div>
        </div>
      </div>
      {/* Calendar skeleton */}
      <div className="p-4">
        <div className="rounded-2xl border bg-white p-4">
          {/* Staff header */}
          <div className="mb-4 flex gap-4">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="flex flex-col items-center gap-1">
                <div className="h-7 w-7 rounded-full bg-gray-200" />
                <div className="h-3 w-14 rounded bg-gray-200" />
              </div>
            ))}
          </div>
          {/* Time slots */}
          {Array.from({ length: 10 }, (_, i) => (
            <div
              key={i}
              className="flex h-8 items-center border-b border-gray-100"
            >
              <div className="h-3 w-10 rounded bg-gray-100" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
