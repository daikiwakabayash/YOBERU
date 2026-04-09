import { Skeleton } from "@/components/ui/skeleton";

export default function ReservationLoading() {
  return (
    <div>
      {/* Header skeleton */}
      <div className="flex items-center justify-between border-b bg-white px-6 py-4">
        <Skeleton className="h-7 w-24" />
        <div className="flex items-center gap-2">
          <Skeleton className="h-8 w-16" />
          <Skeleton className="h-8 w-12" />
          <Skeleton className="h-5 w-48" />
          <Skeleton className="h-8 w-16" />
          <Skeleton className="h-8 w-16" />
        </div>
      </div>
      {/* Calendar skeleton */}
      <div className="p-4">
        <div className="rounded-2xl border bg-white shadow-sm">
          {/* Staff headers */}
          <div className="flex border-b p-3 gap-4">
            <Skeleton className="h-5 w-12" />
            <Skeleton className="h-12 w-40" />
            <Skeleton className="h-12 w-40" />
            <Skeleton className="h-12 w-40" />
            <Skeleton className="h-12 w-40" />
          </div>
          {/* Time grid */}
          <div className="space-y-0">
            {Array.from({ length: 12 }).map((_, i) => (
              <div key={i} className="flex border-b">
                <Skeleton className="h-11 w-16 shrink-0" />
                <div className="flex flex-1 gap-px">
                  <Skeleton className="h-11 flex-1" />
                  <Skeleton className="h-11 flex-1" />
                  <Skeleton className="h-11 flex-1" />
                  <Skeleton className="h-11 flex-1" />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
