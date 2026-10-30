// The 44 px top bar of every Library page: the view's tabs, then the search box with its scope.
// On a phone the search moves to a row of its own under the bar, with the pages button (the
// page tree is a sheet there) before it.
import type { ReactNode } from "react";
import { ViewTabs } from "@/components/common";
import { useMediaQuery } from "@/lib/hooks";
import { LibrarySearchBox } from "./LibrarySearchBox";

export function LibraryTopBar({ pages }: { pages?: ReactNode }) {
  const narrow = useMediaQuery("(max-width: 767px)");
  return (
    <>
      <header
        data-wf="LibraryTopBar"
        className="flex h-(--wf-topbar-h) shrink-0 items-center gap-3 border-border border-b bg-bg px-4 sm:gap-4"
      >
        {!narrow && pages}
        <ViewTabs view="workdatabase" />
        {!narrow && <LibrarySearchBox className="ml-auto max-w-[460px] flex-1" />}
      </header>
      {narrow && (
        <div className="flex shrink-0 items-center gap-2 border-border border-b bg-bg px-4 py-2">
          {pages}
          <LibrarySearchBox compact className="flex-1" />
        </div>
      )}
    </>
  );
}
