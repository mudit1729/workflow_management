// Context from the Workdatabase: the picker in the New issue dialog, what the agent gets, and the
// links as the Goal tab shows them. Items here are plain objects with real mock ids, so the
// previews size the real library items.
import { useState } from "react";
import { openNewIssueWithContext } from "@/app/NewIssueDialog";
import { Button, Textarea } from "@/components/ui";
import {
  AddContextButton,
  ContextChip,
  type ContextItem,
  ContextPicker,
  ContextPreview,
  ContextSearch,
  LinkedContext,
  termItem,
} from "@/features/context";
import { entry, type KitEntry, Row, Sandbox, V, WhenVisible } from "../kit-ui";
import { ISSUE } from "./data";

const SRC = "src/features/context";

// ---------------------------------------------------------------- sample items

const REVIEWED: ContextItem = {
  kind: "library",
  target: "lib-4tz7c",
  label: "Rescan subtrees instead of trusting notify on macOS",
  title: "Rescan subtrees instead of trusting notify on macOS",
  id: "lib-4tz7c",
  detail: "Use when a file watcher on macOS must follow renamed or deleted folders.",
  libKind: "gotcha",
  status: "reviewed",
};

const DECISION_ITEM: ContextItem = {
  kind: "library",
  target: "lib-3fz8t",
  label: "Push one-way live updates over SSE",
  title: "Push one-way live updates over SSE",
  id: "lib-3fz8t",
  detail: "Use when a local web UI needs live updates from a daemon.",
  libKind: "decision",
  status: "reviewed",
};

const DRAFT: ContextItem = {
  kind: "library",
  target: "lib-7nq3d",
  label: "Match glossary synonyms on whole words",
  title: "Match glossary synonyms on whole words",
  id: "lib-7nq3d",
  detail: "Use when a lint rule or a search matches words from a list.",
  libKind: "pattern",
  status: "draft",
};

const TERM: ContextItem = termItem({
  term: "lease",
  kind: "noun",
  means:
    "A time-limited claim: `claimed_by` plus `lease_until`. It expires after 60 minutes without a heartbeat.",
  avoid: ["reservation", "booking"],
  see: ["coordinator"],
});

const FILE: ContextItem = {
  kind: "file",
  target: "issues/wf/web/live-board-updates/notes/research.md",
  label: "Delivering board updates",
  title: "notes/research.md",
  detail: "Live board updates",
  chars: 1280,
};

const DECISION: ContextItem = {
  kind: "entry",
  target: "wf-3k9x2#D-7f3k2",
  label: "Push board updates over SSE",
  title: "Push board updates over SSE",
  id: "D-7f3k2",
  detail: "Live board updates",
  chars: 420,
};

const ALL = [REVIEWED, DRAFT, FILE, TERM, DECISION];

const LINKS_MD = [
  "- [[lib-4tz7c]] Rescan subtrees instead of trusting notify on macOS",
  "- [[lib-7nq3d]] Match glossary synonyms on whole words",
  "- [[wf-3k9x2#D-7f3k2]] Push board updates over SSE",
  "- Glossary: lease — a time-limited claim",
  "- [Delivering board updates](notes/research.md)",
  "- [[wf-7p4dn]]: index scan and snapshot.",
  "- `spec/api.md`: the SSE event types.",
].join("\n");

// ---------------------------------------------------------------- ContextPicker

function PickerDemo({
  initial = [],
  compact,
  open,
}: {
  initial?: ContextItem[];
  compact?: boolean;
  open?: boolean;
}) {
  const [items, setItems] = useState(initial);
  return <ContextPicker value={items} onChange={setItems} compact={compact} defaultOpen={open} />;
}

function ContextPickerBody() {
  return (
    <>
      <V label="empty" width={560}>
        <PickerDemo />
      </V>
      <V
        label="with items"
        note="A reviewed item, a draft (amber, with the reason in its tooltip), a file, a glossary term and a decision from another issue."
        width={560}
      >
        <PickerDemo initial={ALL} />
      </V>
      <V label="compact · no intro line" width={560}>
        <PickerDemo compact />
      </V>
      <V
        label="popover open"
        note="Add opens it. The list stays open after a pick, so several items go in one visit."
        width={560}
        height={430}
      >
        {/* The list opens on mount and takes focus: mount it only once it is on screen. */}
        <WhenVisible minHeight={430}>
          <div className="p-2">
            <PickerDemo initial={[REVIEWED]} open />
          </div>
        </WhenVisible>
      </V>
    </>
  );
}

// ---------------------------------------------------------------- ContextSearch

function ContextSearchBody() {
  return (
    <V
      label="contents of the popover"
      note="Type to search, ↑ ↓ to move, ↵ to add. A highlighted draft says what agents get: nothing, until it is reviewed."
      width={460}
    >
      <div className="overflow-hidden rounded-md border border-border bg-bg shadow-pop">
        <ContextSearch onPick={() => undefined} autoFocus={false} />
      </div>
    </V>
  );
}

// ---------------------------------------------------------------- ContextChip

function ContextChipBody() {
  return (
    <V label="library · draft · glossary · file · decision · without a remove button" width={560}>
      <Row>
        {ALL.map((item) => (
          <ContextChip key={item.target} item={item} onRemove={() => undefined} />
        ))}
        <ContextChip item={REVIEWED} />
      </Row>
    </V>
  );
}

// ---------------------------------------------------------------- ContextPreview

function ContextPreviewBody() {
  return (
    <>
      <V label="under budget · 6,000 tokens" width={560}>
        <ContextPreview items={[REVIEWED, DECISION_ITEM, FILE]} budget={6000} />
      </V>
      <V
        label="with a draft and a term"
        note="A draft is listed by name. Its text is not injected until someone reviews it."
        width={560}
      >
        <ContextPreview items={ALL} budget={6000} issueId={ISSUE.rich} />
      </V>
      <V
        label="over budget · 400 tokens"
        note="Amber. The last items are left out first, the way wf context drops them."
        width={560}
      >
        <ContextPreview items={ALL} budget={400} />
      </V>
      <V label="collapsed" width={560}>
        <ContextPreview items={ALL} budget={6000} defaultOpen={false} />
      </V>
      <V label="empty" width={560}>
        <ContextPreview items={[]} budget={6000} />
      </V>
    </>
  );
}

// ---------------------------------------------------------------- LinkedContext, AddContextButton

function LinkedContextBody() {
  return (
    <V
      label="a Links section with every kind of bullet"
      note="Library items, entries and issues are RefLinks. A term opens the glossary, a file opens its source in Workspace files. A bullet wf does not know keeps its markdown."
      width={560}
    >
      <Sandbox path="/w">
        <LinkedContext md={LINKS_MD} issueId={ISSUE.rich} dir="issues/wf/web/live-board-updates" />
      </Sandbox>
    </V>
  );
}

function AddContextButtonBody() {
  return (
    <V
      label="in the Links section"
      note="A pick is written to goal.md at once: the mock data changes."
      width={360}
    >
      <div className="flex justify-end">
        <AddContextButton issueId={ISSUE.rich} linked={new Set()} />
      </div>
    </V>
  );
}

// ---------------------------------------------------------------- the dialog

function NewIssueContextBody() {
  const [context, setContext] = useState(
    "Agents lose their claim when a lease runs out, and nobody tells them why.",
  );
  const [items, setItems] = useState([REVIEWED, DRAFT, FILE]);
  return (
    <>
      <V
        label="open the dialog with context filled in"
        note="The dialog grows to its large size when it holds context. Create writes goal.md with the context and the links."
      >
        <Button
          variant="secondary"
          size="sm"
          onClick={() =>
            openNewIssueWithContext({
              group: "g-web01",
              context: "Agents lose their claim when a lease runs out, and nobody tells them why.",
              items: [REVIEWED, DRAFT, FILE],
            })
          }
        >
          New issue with context
        </Button>
      </V>
      <V label="the context block of the dialog" width={600}>
        <div className="flex flex-col gap-4">
          <Textarea
            aria-label="Context"
            value={context}
            onChange={(e) => setContext(e.target.value)}
            rows={2}
            placeholder="Why this matters, in 1–2 short paragraphs."
            className="max-h-[8.25rem] min-h-14"
          />
          <ContextPicker value={items} onChange={setItems} />
          {items.length > 0 && <ContextPreview items={items} />}
        </div>
      </V>
    </>
  );
}

export const contextEntries: KitEntry[] = [
  entry(
    "Workdatabase",
    "ContextPicker",
    `${SRC}/ContextPicker.tsx`,
    "Lets a person attach library items, glossary terms, files and decisions to an issue while they write it, so the agent starts with what the team already knows.",
    ContextPickerBody,
  ),
  entry(
    "Workdatabase",
    "ContextSearch",
    `${SRC}/ContextSearch.tsx`,
    "One search over the whole Workdatabase, grouped by where an item lives, so context is found by typing a few words and pressing Enter.",
    ContextSearchBody,
  ),
  entry(
    "Workdatabase",
    "ContextChip",
    `${SRC}/ContextPicker.tsx`,
    "Shows a picked item with its glyph, its title and its id, and flags a draft that agents will not get yet.",
    ContextChipBody,
  ),
  entry(
    "Workdatabase",
    "ContextPreview",
    `${SRC}/ContextPreview.tsx`,
    "Shows what the agent receives with wf context and what it costs, so nobody finds out after the fact that the budget cut their pick.",
    ContextPreviewBody,
  ),
  entry(
    "Issue · Goal",
    "LinkedContext",
    `${SRC}/LinkedContext.tsx`,
    "Reads the Links section of goal.md back as rows with a glyph per kind, so the markdown that was written and the page that shows it agree.",
    LinkedContextBody,
  ),
  entry(
    "Issue · Goal",
    "AddContextButton",
    `${SRC}/AddContextButton.tsx`,
    "Adds context to an issue that already exists, with the same search as the New issue dialog.",
    AddContextButtonBody,
  ),
  entry(
    "Shell",
    "NewIssueContext",
    "src/app/NewIssueDialog.tsx",
    "The context part of the New issue dialog: a few lines of prose, the picker and the preview.",
    NewIssueContextBody,
  ),
];
