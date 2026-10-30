// Edit a page of the personal library with the existing editor. Save writes the file; the bridge
// commits and pushes, and the page header then says "Saved · pushed a1b2c3d".
import { useRef } from "react";
import { SourceEditor } from "@/features/files/SourceEditor";
import { savePage } from "@/lib/api";
import type { LibraryPage } from "@/lib/api/types";

export interface PageEditorProps {
  page: LibraryPage;
  /** The page as it is now: a change under the editor shows as a conflict. */
  live: LibraryPage | undefined;
  /** The editor closed. `commit` is set after a save. */
  onDone: (commit?: string) => void;
  onDirtyChange?: (dirty: boolean) => void;
}

export function PageEditor({ page, live, onDone, onDirtyChange }: PageEditorProps) {
  // The text and the rev the edit started from; the page keeps changing underneath live.
  const start = useRef({ text: page.text, rev: page.rev });
  const commit = useRef<string>(undefined);
  return (
    <SourceEditor
      path={page.path}
      mode="edit"
      initialText={start.current.text}
      baseRev={start.current.rev}
      liveRev={live?.rev}
      gone={live === undefined}
      variant="pane"
      wrap
      quiet
      save={async ({ path, text, base_rev }) => {
        const saved = await savePage({ alias: page.alias, path, text, base_rev });
        commit.current = saved?.commit;
        return saved && { rev: saved.rev };
      }}
      onSaved={() => onDone(commit.current)}
      onCancel={() => onDone()}
      onReload={() => onDone()}
      onDirtyChange={onDirtyChange}
    />
  );
}
