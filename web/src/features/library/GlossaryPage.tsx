// The Glossary page, the second view of the Workdatabase: a 44 px top bar with the Workdatabase
// tabs and a search box, then the terms. The terms are read from glossary.md; each one names its
// line and opens it in Workspace files.
import { useNavigate, useSearch } from "@tanstack/react-router";
import { useCallback } from "react";
import { ViewTabs } from "@/components/common";
import { SearchInput } from "@/components/ui";
import { useMediaQuery } from "@/lib/hooks";
import { GlossaryView } from "./GlossaryView";
import { useSearchBox } from "./useSearchBox";

type Navigate = (o: { to: string; search?: unknown; replace?: boolean }) => Promise<void>;

/** The filter text of /glossary lives in the URL (?q=), like the Library's. */
function useGlossaryQuery(): [string, (q: string | undefined) => void] {
  const navigate = useNavigate() as unknown as Navigate;
  const raw = useSearch({ strict: false }) as { q?: string };
  const set = useCallback(
    (q: string | undefined) => {
      void navigate({ to: "/glossary", search: q ? { q } : {}, replace: true });
    },
    [navigate],
  );
  return [raw.q ?? "", set];
}

export function GlossaryPage() {
  const [q, setQ] = useGlossaryQuery();
  const { input, setInput, clear } = useSearchBox(q, setQ);
  const narrow = useMediaQuery("(max-width: 767px)");
  const searchBox = (
    <SearchInput
      value={input}
      onChange={setInput}
      placeholder="Search the glossary"
      shortcut={narrow ? undefined : "/"}
    />
  );

  return (
    <div data-wf="GlossaryPage" className="flex h-full min-h-0 min-w-0 flex-col bg-bg">
      <header className="flex h-(--wf-topbar-h) shrink-0 items-center gap-3 border-border border-b bg-bg px-4 sm:gap-4">
        <h1 className="sr-only">Workdatabase · Glossary</h1>
        <ViewTabs view="workdatabase" />
        {/* The box shrinks before it overflows; on a phone it moves to a row of its own. */}
        {!narrow && <div className="ml-auto min-w-0 max-w-64 flex-1">{searchBox}</div>}
      </header>
      {narrow && (
        <div className="shrink-0 border-border border-b bg-bg px-4 pt-2 pb-2.5">{searchBox}</div>
      )}
      <div className="min-h-0 flex-1 overflow-y-auto">
        <GlossaryView query={input} onClearQuery={clear} />
      </div>
    </div>
  );
}
