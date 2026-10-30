// The Library home (`/lib`): the personal library and each team library as cards, then the pages
// opened last. Adding a team library is the last card.
import { FolderOpen, Lock, Plus, Users } from "lucide-react";
import { useMemo } from "react";
import { openAddLibrary } from "@/app/shell-store";
import { RelativeTime } from "@/components/common";
import { Chip, Skeleton } from "@/components/ui";
import { useLibraries } from "@/lib/api";
import type { LibraryInfo } from "@/lib/api/types";
import { cn } from "@/lib/cn";
import { libraryHref, useOpenPage } from "@/lib/nav";
import { LibraryTopBar } from "./LibraryTopBar";
import { useRecentPages } from "./recent";

const KIND: Record<LibraryInfo["kind"], { label: string; icon: typeof Lock }> = {
  personal: { label: "Personal", icon: Lock },
  workspace: { label: "This workspace", icon: FolderOpen },
  team: { label: "Team", icon: Users },
};

/** `https://github.com/acme/handbook` → `acme/handbook`. */
export const repoOf = (url: string) =>
  url.replace(/^https?:\/\/(www\.)?github\.com\//, "").replace(/\/$/, "");

function LibraryCard({ library }: { library: LibraryInfo }) {
  const open = useOpenPage();
  const kind = KIND[library.kind];
  const Icon = kind.icon;
  return (
    <a
      data-wf="LibraryCard"
      data-kind={library.kind}
      href={libraryHref(library.alias)}
      onClick={(e) => {
        if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
        e.preventDefault();
        open({ alias: library.alias });
      }}
      className="flex min-h-32 min-w-0 flex-col gap-2 rounded-lg border border-border bg-bg p-4 transition-colors duration-100 ease-wf hover:border-border-strong hover:bg-subtle"
    >
      <span className="flex items-center gap-1.5 text-fg-muted text-sm">
        <Icon aria-hidden size={14} strokeWidth={1.75} />
        {kind.label}
        {library.access === "bridge" && library.kind === "team" && (
          <Chip tone="outline">private</Chip>
        )}
      </span>
      <span className="min-w-0 truncate font-semibold text-fg text-lg">{library.name}</span>
      {library.description && (
        <span className="line-clamp-2 text-base text-fg-muted leading-snug">
          {library.description}
        </span>
      )}
      <span className="mt-auto flex min-w-0 flex-wrap items-center gap-x-2 text-fg-faint text-sm">
        {library.loaded ? (
          <>
            <span className="tabular">
              {library.pages} {library.pages === 1 ? "page" : "pages"}
            </span>
            {library.media > 0 && <span className="tabular">{library.media} media</span>}
          </>
        ) : (
          <span>Not loaded</span>
        )}
        {library.url && (
          <span className="min-w-0 truncate font-mono text-xs">{repoOf(library.url)}</span>
        )}
      </span>
    </a>
  );
}

function AddCard() {
  return (
    <button
      type="button"
      data-wf="AddLibraryCard"
      onClick={() => openAddLibrary()}
      className="flex min-h-32 min-w-0 flex-col items-start justify-center gap-1.5 rounded-lg border border-border border-dashed p-4 text-left text-fg-muted transition-colors duration-100 ease-wf hover:border-border-strong hover:bg-subtle hover:text-fg"
    >
      <span className="flex items-center gap-1.5 font-medium text-md">
        <Plus aria-hidden size={14} strokeWidth={1.75} />
        Add team library
      </span>
      <span className="text-fg-faint text-base leading-snug">
        Paste a GitHub link and read it here.
      </span>
    </button>
  );
}

function Recent({ aliases }: { aliases: Set<string> }) {
  const pages = useRecentPages((s) => s.pages);
  const open = useOpenPage();
  const shown = pages.filter((p) => aliases.has(p.alias));
  if (shown.length === 0) return null;
  return (
    <section data-wf="RecentPages" aria-label="Recently opened" className="flex flex-col gap-2">
      <h2 className="m-0 font-medium text-fg-faint text-xs">Recently opened</h2>
      <ul className="m-0 flex list-none flex-col p-0">
        {shown.map((p) => (
          <li key={p.address}>
            <a
              href={libraryHref(p.alias, p.path)}
              onClick={(e) => {
                if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
                e.preventDefault();
                open({ alias: p.alias, path: p.path });
              }}
              className="flex min-w-0 items-baseline gap-2 rounded-md px-2 py-1.5 text-md hover:bg-subtle"
            >
              <span className="min-w-0 truncate text-fg">{p.title}</span>
              <span className="min-w-0 shrink-[3] truncate text-fg-faint text-sm">{p.library}</span>
              <RelativeTime
                ts={new Date(p.at).toISOString()}
                className="ml-auto shrink-0 text-fg-faint text-sm"
              />
            </a>
          </li>
        ))}
      </ul>
    </section>
  );
}

export function LibraryHome() {
  const libraries = useLibraries();
  const list = libraries.data;
  const ordered = useMemo(
    () =>
      [...(list ?? [])].sort(
        (a, b) => Number(b.kind === "personal") - Number(a.kind === "personal"),
      ),
    [list],
  );
  return (
    <div data-wf="LibraryHome" className="flex h-full min-h-0 flex-col bg-bg">
      <LibraryTopBar />
      <section aria-label="Library home" className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto flex w-full max-w-[960px] flex-col gap-8 px-6 py-8 sm:px-10">
          <header className="flex flex-col gap-1.5">
            <h1 className="m-0 font-semibold text-[26px] text-fg leading-tight tracking-[-0.02em] min-[1280px]:text-[28px]">
              Library
            </h1>
            <p className="m-0 text-fg-muted text-lg leading-snug">
              What you and your teams know, as markdown. Read it here, ask it from an issue.
            </p>
          </header>
          <section aria-label="Libraries" className="flex flex-col gap-3">
            {!list ? (
              <div role="status" aria-label="Loading the libraries" className={grid}>
                {[0, 1, 2].map((i) => (
                  <Skeleton key={i} className="h-32 w-full rounded-lg" />
                ))}
              </div>
            ) : (
              <div className={grid}>
                {ordered.map((l) => (
                  <LibraryCard key={l.alias} library={l} />
                ))}
                <AddCard />
              </div>
            )}
          </section>
          <Recent aliases={new Set(list?.map((l) => l.alias))} />
        </div>
      </section>
    </div>
  );
}

const grid = cn("grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3");
