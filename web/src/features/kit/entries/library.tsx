import { useState } from "react";
import { Button } from "@/components/ui";
import { GlossaryView, LibraryItemView, LibraryView, PromoteDialog } from "@/features/library";
import { type FacetState, facetCounts, NO_FILTERS, topTags } from "@/features/library/filters";
import { LibraryFacets, LibraryFilterChips } from "@/features/library/LibraryFacets";
import { LibraryList } from "@/features/library/LibraryList";
import { LibraryRow } from "@/features/library/LibraryRow";
import type { DecisionEntry, LearningEntry, LibrarySummary } from "@/gen/types";
import {
  entry,
  type KitEntry,
  Row,
  Sandbox,
  V,
  WhenVisible,
  WithDetail,
  WithLibrarySummary,
  WithSnapshot,
} from "../kit-ui";
import { ISSUE, LIB } from "./data";

const SRC = "src/features/library";

// ---------------------------------------------------------------- LibraryView

function LibraryViewBody() {
  return (
    <>
      <V label="items · facets, search, list" fill height={620}>
        <Sandbox quiet path="/lib">
          <LibraryView />
        </Sandbox>
      </V>
      <V label="item open (the detail pane docks from 1100 px)" fill height={620}>
        <WhenVisible>
          <Sandbox quiet path={`/lib/${LIB.reviewed}`}>
            <LibraryView selectedId={LIB.reviewed} />
          </Sandbox>
        </WhenVisible>
      </V>
    </>
  );
}

// ---------------------------------------------------------------- LibraryItemView

function Item({ id, label, note }: { id: string; label: string; note?: string }) {
  return (
    <V label={label} note={note} width={560} height={640}>
      <Sandbox quiet>
        <LibraryItemView id={id} onClose={() => undefined} />
      </Sandbox>
    </V>
  );
}

function LibraryItemViewBody() {
  return (
    <>
      <Item
        id={LIB.reviewed}
        label="rendered · lib-4tz7c (gotcha)"
        note="The page is the rendered markdown file: frontmatter as properties, then every section in file order. Point at a block to see its line."
      />
      <V
        label="source · lib-4tz7c"
        note="The same file as text, with its lint markers. Edit opens the inline editor."
        width={560}
        height={640}
      >
        <Sandbox quiet>
          <LibraryItemView id={LIB.reviewed} defaultView="source" onClose={() => undefined} />
        </Sandbox>
      </V>
      <Item
        id={LIB.draft}
        label="draft · lib-7nq3d"
        note="Banner: not injected into agent context until reviewed. Approve writes to the mock data."
      />
      <Item id={LIB.overdue} label="reviewed, review overdue · lib-2hq6n" />
      <Item id={LIB.retired} label="retired · lib-0rt4e" />
      <V label="small-screen variant (screen)" width={420} height={560}>
        <Sandbox quiet>
          <LibraryItemView id={LIB.reviewed} onClose={() => undefined} variant="screen" />
        </Sandbox>
      </V>
    </>
  );
}

// ---------------------------------------------------------------- GlossaryView

function GlossaryViewBody() {
  return (
    <V label="with its own search box" width={760} height={600}>
      <Sandbox quiet>
        <GlossaryView />
      </Sandbox>
    </V>
  );
}

// ---------------------------------------------------------------- PromoteDialog

function PromoteDemo({
  label,
  pick,
}: {
  label: string;
  pick: (learn: LearningEntry[], dec: DecisionEntry[]) => LearningEntry | DecisionEntry | undefined;
}) {
  const [open, setOpen] = useState(false);
  return (
    <WithDetail id={ISSUE.rich}>
      {(d) => {
        const e = pick(d.learnings, d.decisions);
        if (!e) return null;
        return (
          <>
            <Button variant="secondary" size="sm" onClick={() => setOpen(true)}>
              {label}
            </Button>
            <PromoteDialog open={open} onOpenChange={setOpen} issueId={d.summary.id} entry={e} />
          </>
        );
      }}
    </WithDetail>
  );
}

function PromoteDialogBody() {
  return (
    <V
      label="open with a real entry of wf-3k9x2"
      note="Create draft writes a draft item into the mock data and asks the group owner to review."
    >
      <Row>
        <PromoteDemo
          label="Candidate tip · L-9mz4e"
          pick={(l) => l.find((x) => x.id === "L-9mz4e")}
        />
        <PromoteDemo
          label="Plain pattern · L-6ct3p"
          pick={(l) => l.find((x) => x.id === "L-6ct3p")}
        />
        <PromoteDemo
          label="Gotcha with a similar item · L-2gk7r"
          pick={(l) => l.find((x) => x.id === "L-2gk7r")}
        />
        <PromoteDemo
          label="Decision · D-7f3k2"
          pick={(_, d) => d.find((x) => x.id === "D-7f3k2")}
        />
      </Row>
    </V>
  );
}

// ---------------------------------------------------------------- LibraryRow, LibraryList

function RowDemo({ item, selected }: { item: LibrarySummary; selected?: boolean }) {
  return (
    <ul className="overflow-hidden rounded-md border border-border">
      <LibraryRow item={item} selected={Boolean(selected)} onSelect={() => undefined} />
    </ul>
  );
}

function LibraryRowBody() {
  const rows: [string, string, boolean?][] = [
    [LIB.reviewed, "reviewed", false],
    [LIB.draft, "draft", false],
    [LIB.overdue, "review overdue", false],
    [LIB.retired, "retired (struck through)", false],
    [LIB.reviewed, "selected", true],
  ];
  return (
    <>
      {rows.map(([id, label, selected]) => (
        <V key={label} label={label} width={560}>
          <WithLibrarySummary id={id}>
            {(item) => <RowDemo item={item} selected={selected} />}
          </WithLibrarySummary>
        </V>
      ))}
    </>
  );
}

function LibraryListBody() {
  const noop = () => undefined;
  return (
    <>
      <V label="items" width={560} height={420}>
        <WithSnapshot>
          {(snap) => (
            <LibraryList
              items={snap.library}
              onSelect={noop}
              query=""
              loading={false}
              busy={false}
              total={snap.library.length}
              filtered={false}
              onClearFilters={noop}
            />
          )}
        </WithSnapshot>
      </V>
      <V label="nothing matches the filters" width={560} height={300}>
        <WithSnapshot>
          {(snap) => (
            <LibraryList
              items={[]}
              onSelect={noop}
              query=""
              loading={false}
              busy={false}
              total={snap.library.length}
              filtered
              onClearFilters={noop}
            />
          )}
        </WithSnapshot>
      </V>
      <V label="empty library" width={560} height={300}>
        <LibraryList
          items={[]}
          onSelect={noop}
          query=""
          loading={false}
          busy={false}
          total={0}
          filtered={false}
          onClearFilters={noop}
        />
      </V>
      <V label="loading" width={560} height={300}>
        <LibraryList
          items={[]}
          onSelect={noop}
          query=""
          loading
          busy={false}
          total={0}
          filtered={false}
          onClearFilters={noop}
        />
      </V>
    </>
  );
}

// ---------------------------------------------------------------- LibraryFacets

function FacetsDemo({ chips }: { chips?: boolean }) {
  const [filters, setFilters] = useState<FacetState>(NO_FILTERS);
  return (
    <WithSnapshot>
      {(snap) => {
        const counts = facetCounts(snap.library, filters);
        const handlers = {
          onKind: (kind: FacetState["kind"]) => setFilters((f) => ({ ...f, kind })),
          onStatus: (status: FacetState["status"]) => setFilters((f) => ({ ...f, status })),
          onOverdue: (overdue: boolean) => setFilters((f) => ({ ...f, overdue })),
        };
        if (chips) return <LibraryFilterChips filters={filters} counts={counts} {...handlers} />;
        return (
          <LibraryFacets
            filters={filters}
            counts={counts}
            tags={topTags(snap.library, filters.tags)}
            active={Boolean(
              filters.kind || filters.status || filters.overdue || filters.tags.length,
            )}
            onTag={(tag) =>
              setFilters((f) => ({
                ...f,
                tags: f.tags.includes(tag) ? f.tags.filter((t) => t !== tag) : [...f.tags, tag],
              }))
            }
            onClear={() => setFilters(NO_FILTERS)}
            {...handlers}
          />
        );
      }}
    </WithSnapshot>
  );
}

function LibraryFacetsBody() {
  return (
    <>
      <V label="facets column" width={200} height={560}>
        <FacetsDemo />
      </V>
      <V label="chips (narrow screens)" width={560}>
        <FacetsDemo chips />
      </V>
    </>
  );
}

export const libraryEntries: KitEntry[] = [
  entry(
    "Workdatabase",
    "LibraryView",
    `${SRC}/LibraryView.tsx`,
    "The library is what the team has learned, organized by kind and status; faceted browsing and server search find an item fast, and the detail pane docks beside the list.",
    LibraryViewBody,
  ),
  entry(
    "Workdatabase",
    "LibraryItemView",
    `${SRC}/LibraryItemView.tsx`,
    "An item shows its rule, when to use it, where it came from and who relies on it, and makes the one decision a reviewer owns (approve) impossible to miss.",
    LibraryItemViewBody,
  ),
  entry(
    "Workdatabase",
    "GlossaryView",
    `${SRC}/GlossaryView.tsx`,
    "The glossary fixes one word per idea and lists the words to avoid, which is what the S09 lint enforces in every issue.",
    GlossaryViewBody,
  ),
  entry(
    "Workdatabase",
    "PromoteDialog",
    `${SRC}/PromoteDialog.tsx`,
    "Promotion turns an issue's learning or decision into a reusable draft; the dialog previews it and warns about near-duplicates before a reviewer sees it.",
    PromoteDialogBody,
  ),
  entry(
    "Workdatabase",
    "LibraryRow",
    `${SRC}/LibraryRow.tsx`,
    "A row carries the title, the 'use when' line, status and how many issues rely on it, so scanning the list is enough to pick an item.",
    LibraryRowBody,
  ),
  entry(
    "Workdatabase",
    "LibraryList",
    `${SRC}/LibraryList.tsx`,
    "The list owns the quiet states (loading, empty library, nothing matches) so a filter that hides everything never looks like a bug.",
    LibraryListBody,
  ),
  entry(
    "Workdatabase",
    "LibraryFacets",
    `${SRC}/LibraryFacets.tsx`,
    "Kind, status, tag and overdue facets show counts that ignore their own selection, so you can see what the next click would give.",
    LibraryFacetsBody,
  ),
];
