// The /kit route. The gallery and everything it imports load only when the route opens,
// so the main bundle carries just this wrapper.
import { lazy, Suspense } from "react";
import { Skeleton } from "@/components/ui";

const KitGallery = lazy(() => import("./KitGallery"));

function KitFallback() {
  return (
    <div
      data-wf="KitPage"
      data-state="loading"
      role="status"
      aria-label="Loading the component kit"
      className="flex h-full min-h-0 min-w-0 flex-1"
    >
      <div className="hidden w-[220px] shrink-0 flex-col gap-2 border-border border-r bg-subtle p-3 md:flex">
        <Skeleton className="h-7 w-full" />
        <Skeleton className="h-4 w-20" />
        <Skeleton className="h-5 w-full" />
        <Skeleton className="h-5 w-4/5" />
        <Skeleton className="h-5 w-3/5" />
      </div>
      <div className="flex min-w-0 flex-1 flex-col gap-3 p-6">
        <Skeleton className="h-5 w-40" />
        <Skeleton className="h-4 w-2/3" />
        <Skeleton className="h-40 w-full" />
      </div>
    </div>
  );
}

export function KitPage() {
  return (
    <Suspense fallback={<KitFallback />}>
      <KitGallery />
    </Suspense>
  );
}
