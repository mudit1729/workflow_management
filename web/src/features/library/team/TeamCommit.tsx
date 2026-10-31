// The commit a team library page was read at, in the page footer: "a1b2c3d · 2 days ago", and a
// quiet Update when the repo has moved on (spec 4.3).
import { RelativeTime } from "@/components/common";
import { Button } from "@/components/ui";
import { useLibrary } from "@/lib/api/library";
import type { LibraryPage } from "@/lib/api/types";
import { commitFacts } from "./commits";
import { useTeamUpdate } from "./useTeamUpdate";

export function TeamCommit({ page }: { page: LibraryPage }) {
  const library = useLibrary(page.alias);
  const update = useTeamUpdate(library);
  const facts = commitFacts(page.alias);
  return (
    <span data-wf="TeamCommit" className="inline-flex min-w-0 flex-wrap items-center gap-x-2">
      {page.commit && (
        <code className="font-mono" title={facts?.message}>
          {page.commit}
        </code>
      )}
      {facts?.committedAt && <RelativeTime ts={facts.committedAt} long />}
      {update.behind && (
        <>
          <span aria-hidden>·</span>
          <span>A newer version is on GitHub.</span>
          <Button
            variant="ghost"
            size="sm"
            disabled={update.busy}
            onClick={() => void update.run()}
            className="-my-1 px-1.5 text-fg-muted text-xs"
          >
            {update.busy ? "Updating…" : "Update"}
          </Button>
        </>
      )}
    </span>
  );
}
