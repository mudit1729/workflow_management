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

  return (
    <div data-wf="GlossaryPage" className="flex h-full min-h-0 min-w-0 flex-col bg-bg">
      <header className="flex h-(--wf-topbar-h) shrink-0 items-center gap-3 border-border border-b bg-bg px-4 sm:gap-4">
        <ViewTabs view="workdatabase" />
        <div className="ml-auto min-w-0 flex-1 sm:w-64 sm:flex-none">
          <SearchInput
            value={input}
            onChange={setInput}
            placeholder={narrow ? "Search" : "Search the glossary"}
            shortcut={narrow ? undefined : "/"}
          />
        </div>
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto">
        <GlossaryView query={input} onClearQuery={clear} />
      </div>
    </div>
  );
}
