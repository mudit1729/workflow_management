// The /kit route. The gallery and everything it imports load only when the route opens,
// so the main bundle carries just this wrapper.
//
// The kit shows real issues by id (wf-3k9x2 and so on), and the shipped workspace has none. So
// while the route is open it holds the sample world: the user's working copy is saved, the sample
// is loaded, and leaving the kit puts the saved copy back exactly. The hold is counted in the
// mock store, so a second mount (StrictMode, a quick re-entry) cannot corrupt the saved copy.
import { lazy, Suspense, useEffect, useState } from "react";
import { Skeleton } from "@/components/ui";
import { isRealApi, loadMock } from "@/lib/api/mock-bridge";

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

/** True once the sample is loaded for the kit (at once on a build that talks to wf serve). */
function useSampleWhileOpen(): boolean {
  const [ready, setReady] = useState(isRealApi);
  useEffect(() => {
    if (isRealApi) return;
    let cancelled = false;
    let release: (() => void) | undefined;
    loadMock()
      .then((mock) => {
        // The page may be gone by the time the mock server module has loaded.
        if (cancelled) return;
        release = mock.mockControls.holdSample();
        setReady(true);
      })
      .catch(() => {
        if (!cancelled) setReady(true);
      });
    return () => {
      cancelled = true;
      release?.();
    };
  }, []);
  return ready;
}

export function KitPage() {
  const ready = useSampleWhileOpen();
  return <Suspense fallback={<KitFallback />}>{ready ? <KitGallery /> : <KitFallback />}</Suspense>;
}
