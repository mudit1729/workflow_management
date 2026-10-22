// Loading placeholder that matches the issue frame's layout, so nothing jumps on load.
import { Skeleton } from "@/components/ui";
import { useMediaQuery } from "@/lib/hooks";

export function IssueSkeleton({ variant }: { variant: "drawer" | "page" }) {
  return (
    <div
      data-wf="IssueSkeleton"
      data-variant={variant}
      role="status"
      aria-busy="true"
      aria-label="Loading issue"
      className="flex h-full min-h-0 flex-col"
    >
      {variant === "drawer" ? <DrawerSkeleton /> : <PageSkeleton />}
    </div>
  );
}

function DrawerSkeleton() {
  return (
    <>
      <div className="flex flex-col px-4 pt-2 pb-3">
        <div className="flex h-7 items-center gap-2">
          <Skeleton className="h-3 w-20" />
          <Skeleton className="h-3 w-16" />
          <div className="ml-auto flex gap-1.5">
            {[0, 1, 2, 3].map((i) => (
              <Skeleton key={i} className="size-5 rounded-sm" />
            ))}
          </div>
        </div>
        <Skeleton className="mt-2 h-4.5 w-3/4" />
        <div className="mt-3 flex gap-1.5">
          <Skeleton className="h-6 w-24 rounded-md" />
          <Skeleton className="h-6 w-16 rounded-md" />
          <Skeleton className="h-6 w-14 rounded-md" />
          <Skeleton className="h-6 w-28 rounded-md" />
        </div>
      </div>
      <div className="flex h-9 shrink-0 items-center gap-6 border-border border-b px-4">
        {["w-8", "w-9", "w-8", "w-7", "w-8"].map((w, i) => (
          <Skeleton key={i} className={`h-3 ${w}`} />
        ))}
      </div>
      <BodyLines />
    </>
  );
}

function PageSkeleton() {
  // Same breakpoints as the page frame: one column below 768 px, two below 1100 px, else three.
  const narrow = useMediaQuery("(max-width: 767px)");
  const wide = useMediaQuery("(min-width: 1100px)");
  const columns = narrow ? 1 : wide ? 3 : 2;
  return (
    <>
      <div className="flex flex-col border-border border-b px-5 pt-5 pb-4">
        <Skeleton className="h-5 w-1/2" />
        <div className="mt-3.5 flex gap-1.5">
          <Skeleton className="h-6 w-24 rounded-md" />
          <Skeleton className="h-6 w-16 rounded-md" />
          <Skeleton className="h-6 w-14 rounded-md" />
          <Skeleton className="h-6 w-28 rounded-md" />
        </div>
      </div>
      <div
        className="grid min-h-0 flex-1 divide-x divide-border overflow-hidden"
        style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}
      >
        {Array.from({ length: columns }, (_, i) => (
          <BodyLines key={i} />
        ))}
      </div>
    </>
  );
}

function BodyLines() {
  return (
    <div className="flex flex-col gap-3 p-5">
      <Skeleton className="h-3 w-14" />
      <Skeleton className="h-4 w-11/12" />
      <Skeleton className="h-3 w-1/3" />
      <div className="mt-3 flex flex-col gap-2">
        <Skeleton className="h-8 w-full rounded-md" />
        <Skeleton className="h-8 w-full rounded-md" />
        <Skeleton className="h-8 w-4/5 rounded-md" />
      </div>
      <Skeleton className="mt-4 h-3 w-20" />
      <div className="flex flex-col gap-2">
        <Skeleton className="h-3 w-full" />
        <Skeleton className="h-3 w-5/6" />
        <Skeleton className="h-3 w-2/3" />
      </div>
    </div>
  );
}
