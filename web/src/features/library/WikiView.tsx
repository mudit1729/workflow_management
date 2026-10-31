// The wiki viewer: a library as a calm document wiki (spec section 5). Under one 44 px top bar
// (the Library tabs and the search):
//   1280 px and up   page tree (240 px) · document (text measure about 720 px) · right rail
//   1024 to 1279 px  page tree · document; On this page is a popover in the page header
//   under 1024 px    the document alone; the page tree opens as a sheet
// Keys: `[` and `]` go to the previous and next page, `/` searches.

import { useBlocker, useRouterState } from "@tanstack/react-router";
import { PanelLeft } from "lucide-react";
import { useEffect, useState } from "react";
import { EmptyState } from "@/components/common";
import { Button, Sheet, Skeleton } from "@/components/ui";
import { DiscardDialog } from "@/features/files/DiscardDialog";
import { useLibraries, useLibraryPage, useLibraryTree } from "@/lib/api";
import { isPageMissing } from "@/lib/api/library";
import type { LibraryInfo, LibraryTree, LibraryTreeNode } from "@/lib/api/types";
import { useHotkey, useMediaQuery } from "@/lib/hooks";
import { useGo, useOpenPage } from "@/lib/nav";
import { PERSONAL_ALIAS } from "./address";
import { LibraryOverview } from "./LibraryOverview";
import { LibraryTopBar } from "./LibraryTopBar";
import { OutlinePopover, useActiveHeading } from "./OnThisPage";
import { PageEditor } from "./PageEditor";
import { PageHeader, type PageView } from "./PageHeader";
import { PageTree } from "./PageTree";
import { PageDocument, PageFooter, SectionList } from "./PageView";
import { PersonalHome } from "./personal/PersonalHome";
import { SummaryBanner } from "./personal/SummaryBanner";
import { RightRail } from "./RightRail";
import { useRecentPages } from "./recent";
import { SearchResults } from "./SearchResults";
import { useLibrarySearchState } from "./useLibrarySearchState";

/** The section node at a folder path, anywhere in the tree. */
function sectionAt(nodes: LibraryTreeNode[], path: string): LibraryTreeNode | undefined {
  for (const n of nodes) {
    if (n.type !== "section") continue;
    if (n.path === path) return n;
    const hit = sectionAt(n.children ?? [], path);
    if (hit) return hit;
  }
  return undefined;
}

export interface WikiViewProps {
  alias: string;
  /** Root-relative path of the page, or of a folder; empty for the library's home. */
  path: string;
}

export function WikiView({ alias, path }: WikiViewProps) {
  const libraries = useLibraries();
  const library = libraries.data?.find((l) => l.alias === alias);
  const treeQuery = useLibraryTree(library?.loaded === false ? undefined : alias);
  const tree = treeQuery.data;
  const search = useLibrarySearchState();
  const wide = useMediaQuery("(min-width: 1024px)");
  const [sheet, setSheet] = useState(false);

  const frame = (content: React.ReactNode, current: string, rail?: React.ReactNode) => (
    <div data-wf="WikiView" data-alias={alias} className="flex h-full min-h-0 flex-col bg-bg">
      <LibraryTopBar
        pages={
          !wide && (
            <Button
              variant="secondary"
              size="sm"
              aria-label={`Pages of ${library?.name ?? "the library"}`}
              onClick={() => setSheet(true)}
              className="shrink-0"
            >
              <PanelLeft aria-hidden size={14} strokeWidth={1.75} />
              Pages
            </Button>
          )
        }
      />
      <div className="flex min-h-0 flex-1">
        {wide && library && tree && (
          <aside
            aria-label="Pages"
            className="w-60 shrink-0 overflow-y-auto border-border border-r px-2 py-3"
          >
            <PageTree library={library} tree={tree} current={current} />
          </aside>
        )}
        {content}
        {rail}
      </div>
      {!wide && library && tree && (
        <Sheet open={sheet} onOpenChange={setSheet} side="left" title={library.name} width={300}>
          <PageTree
            library={library}
            tree={tree}
            current={current}
            onOpen={() => setSheet(false)}
            className="px-2 pb-4"
          />
        </Sheet>
      )}
    </div>
  );

  // ---- states before there is a page
  if (libraries.isPending || (library?.loaded !== false && treeQuery.isPending)) {
    return frame(<Loading />, path);
  }
  if (!library) {
    return frame(
      <Centered>
        <MissingLibrary alias={alias} />
      </Centered>,
      path,
    );
  }
  if (!library.loaded || !tree) {
    return frame(
      <Centered>
        <EmptyState
          title={`${library.name} is not loaded`}
          hint="This library is listed in your libraries.toml, but its files have not been read in this session."
        />
      </Centered>,
      path,
    );
  }
  if (search.q.trim()) {
    return frame(
      <section aria-label="Page" className="min-h-0 min-w-0 flex-1 overflow-y-auto">
        <SearchResults q={search.q} scope={search.scopeValue} />
      </section>,
      path,
    );
  }
  return frame(<Page library={library} tree={tree} path={path} />, path);
}

function Loading() {
  return (
    <div role="status" aria-label="Loading the library" className="flex-1 px-10 py-8">
      <div className="mx-auto flex max-w-[72ch] flex-col gap-3">
        <Skeleton className="h-3 w-48" />
        <Skeleton className="h-8 w-2/3" />
        <Skeleton className="h-3.5 w-full" />
        <Skeleton className="h-3.5 w-5/6" />
        <Skeleton className="h-3.5 w-3/4" />
      </div>
    </div>
  );
}

function Centered({ children }: { children: React.ReactNode }) {
  return <div className="flex min-w-0 flex-1 items-center justify-center">{children}</div>;
}

function MissingLibrary({ alias }: { alias: string }) {
  const go = useGo();
  return (
    <EmptyState
      title={`No library named ${alias}`}
      hint="It may have been removed, or it was never added in this session."
      action={
        <Button size="sm" onClick={() => void go.library()}>
          Back to the library
        </Button>
      }
    />
  );
}

// ---------------------------------------------------------------- one page

function Page({ library, tree, path }: { library: LibraryInfo; tree: LibraryTree; path: string }) {
  const alias = library.alias;
  const target = path || tree.home || undefined;
  const personalHome = alias === PERSONAL_ALIAS && !path;
  const query = useLibraryPage(
    personalHome ? undefined : alias,
    target ?? (path ? path : undefined),
  );
  const page = query.data;
  const search = useLibrarySearchState();
  const open = useOpenPage();
  const visit = useRecentPages((s) => s.visit);
  const hash = useRouterState({ select: (s) => s.location.hash });
  const [scroller, setScroller] = useState<HTMLElement | null>(null);
  const railDocked = useMediaQuery("(min-width: 1280px)");
  const [editing, setEditing] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [saved, setSaved] = useState<string>();
  // Leaving the page with an unsaved edit asks first (no window.confirm).
  const blocker = useBlocker({
    shouldBlockFn: () => true,
    disabled: !(editing && dirty),
    enableBeforeUnload: false,
    withResolver: true,
  });

  // A new page starts at its top, or at its heading; an edit does not carry over.
  // biome-ignore lint/correctness/useExhaustiveDependencies: the address is the trigger.
  useEffect(() => {
    setEditing(false);
    setSaved(undefined);
  }, [page?.address]);
  useEffect(() => {
    if (page)
      visit({
        address: page.address,
        alias: page.alias,
        path: page.path,
        title: page.title,
        library: page.library,
      });
  }, [page, visit]);
  const address = page?.address;
  // Keyed by the address, not the page: a live edit of the text must not scroll it.
  useEffect(() => {
    if (!address || !scroller || editing) return;
    const calm = matchMedia("(prefers-reduced-motion: reduce)").matches;
    const target = hash ? document.getElementById(decodeURIComponent(hash)) : null;
    if (target) target.scrollIntoView({ behavior: calm ? "auto" : "smooth", block: "start" });
    else scroller.scrollTo({ top: 0 });
  }, [address, hash, scroller, editing]);

  const view: PageView = search.view === "source" ? "source" : "rendered";
  const active = useActiveHeading(
    scroller,
    page?.headings.map((h) => h.anchor) ?? [],
    page?.address ?? "",
  );

  // `[` and `]` read on; they do nothing while something is being typed or edited.
  useHotkey("[", () => page?.prev && open(page.prev), { enabled: !editing && Boolean(page?.prev) });
  useHotkey("]", () => page?.next && open(page.next), { enabled: !editing && Boolean(page?.next) });

  if (personalHome) {
    return (
      <section
        aria-label="Page"
        ref={setScroller}
        className="min-h-0 min-w-0 flex-1 overflow-y-auto"
      >
        <div className="mx-auto w-full max-w-[960px] px-6 py-8 sm:px-10">
          <PersonalHome />
        </div>
      </section>
    );
  }

  if (query.isPending && target) return <Loading />;

  if (!page) {
    const section = path ? sectionAt(tree.root.children ?? [], path.replace(/\/$/, "")) : undefined;
    if (!target || section) {
      return (
        <section
          aria-label="Page"
          ref={setScroller}
          className="min-h-0 min-w-0 flex-1 overflow-y-auto"
        >
          <LibraryOverview library={library} section={section} nodes={tree.root.children ?? []} />
        </section>
      );
    }
    return (
      <Centered>
        <EmptyState
          title={isPageMissing(query.error) ? "No such page" : "Could not open this page"}
          hint={
            isPageMissing(query.error)
              ? `${library.name} has no page at ${path}. It may have been renamed or removed.`
              : "The server did not answer. Your files are safe."
          }
          action={
            <Button
              size="sm"
              onClick={() => (isPageMissing(query.error) ? open({ alias }) : void query.refetch())}
            >
              {isPageMissing(query.error) ? `Back to ${library.name}` : "Try again"}
            </Button>
          }
        />
      </Centered>
    );
  }

  const headingsShown = page.headings.some((h) => h.depth >= 2 && h.depth <= 3);
  const outline = !railDocked && headingsShown && (
    <OutlinePopover alias={page.alias} path={page.path} headings={page.headings} active={active} />
  );

  if (editing) {
    return (
      <section aria-label="Page" className="flex min-h-0 min-w-0 flex-1 flex-col gap-3 px-6 py-4">
        <h1 className="m-0 truncate font-semibold text-lg text-fg">{page.title}</h1>
        <DiscardDialog
          open={blocker.status === "blocked"}
          name={page.path.slice(page.path.lastIndexOf("/") + 1)}
          onKeep={() => blocker.reset?.()}
          onDiscard={() => blocker.proceed?.()}
        />
        <PageEditor
          page={page}
          live={page}
          onDirtyChange={setDirty}
          onDone={(commit) => {
            setEditing(false);
            setSaved(commit);
          }}
        />
      </section>
    );
  }

  return (
    <>
      <section
        aria-label="Page"
        ref={setScroller}
        className="min-h-0 min-w-0 flex-1 overflow-y-auto"
      >
        <div className="mx-auto flex w-full max-w-[72ch] flex-col gap-6 px-6 py-8 sm:px-10">
          <PageHeader
            page={page}
            library={library}
            view={view}
            onView={(v) => search.setView(v === "source" ? "source" : undefined)}
            onEdit={library.editable ? () => setEditing(true) : undefined}
            leading={outline}
            note={
              <>
                {saved && (
                  <p role="status" className="m-0 text-fg-muted text-sm">
                    Saved · pushed <code className="font-mono">{saved}</code>
                  </p>
                )}
                <SummaryBanner page={page} />
              </>
            }
          />
          <PageDocument page={page} view={view} />
          {view === "rendered" && page.section && (
            <SectionList title="In this section" pages={page.children} />
          )}
          {view === "rendered" && page.address === `${alias}:${tree.home}` && (
            <SectionList title="In this library" pages={page.children} />
          )}
          <PageFooter page={page} />
          {!railDocked && (
            <RightRail page={page} outline={false} className="mt-2 border-border border-t pt-6" />
          )}
        </div>
      </section>
      {railDocked && (
        <aside
          aria-label="About this page"
          className="w-60 shrink-0 overflow-y-auto border-border border-l px-4 py-8"
        >
          <RightRail page={page} active={active} />
        </aside>
      )}
    </>
  );
}
