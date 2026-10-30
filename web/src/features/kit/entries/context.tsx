// Context from the Workdatabase: the picker (New file), what the agent gets, and the
// links as the Goal tab shows them. The sample items are read from the sample world (web/mock/sample) by id, so
// the previews show and size the real library items, terms, files and decisions.
import { type ReactNode, useMemo, useState } from "react";
import {
  AddContextButton,
  ContextChip,
  type ContextItem,
  ContextPicker,
  ContextPreview,
  ContextSearch,
  decisionItem,
  fileItem,
  LinkedContext,
  libraryItem,
  linkLine,
  termItem,
  toLink,
} from "@/features/context";
import { useGlossary, useIssue, useSnapshot, useWorkspaceFiles } from "@/lib/api";
import { entry, type KitEntry, Loading, Missing, Row, Sandbox, V, WhenVisible } from "../kit-ui";
import { CONTEXT, ISSUE, LIB } from "./data";

const SRC = "src/features/context";

// ---------------------------------------------------------------- sample items
//
// The items are built from the live Workdatabase with the same builders the picker uses, so a title
// or a size edited in a file changes here too. Only the ids live in ./data.

interface Samples {
  /** A reviewed gotcha. */
  reviewed: ContextItem;
  /** A reviewed decision. */
  decisionLib: ContextItem;
  /** A draft pattern: listed, not injected. */
  draft: ContextItem;
  term: ContextItem;
  file: ContextItem;
  /** A decision entry of the rich issue. */
  decision: ContextItem;
  all: ContextItem[];
  /** The Links section of a goal.md that holds every kind of bullet. */
  linksMd: string;
  /** The folder of the issue that holds those links. */
  dir: string;
}

type SamplesState = { samples: Samples } | { missing: string } | undefined;

function useSamples(): SamplesState {
  const snapshot = useSnapshot().data;
  const glossary = useGlossary().data;
  const files = useWorkspaceFiles().data;
  const detail = useIssue(ISSUE.rich).data;
  return useMemo(() => {
    if (!snapshot || !glossary || !files || !detail) return undefined;
    const lib = (id: string) => snapshot.library.find((l) => l.id === id);
    const reviewed = lib(LIB.reviewed);
    const decisionLib = lib(LIB.decision);
    const draft = lib(LIB.draft);
    const term = glossary.find((t) => t.term === CONTEXT.term);
    const rel = CONTEXT.file;
    const path = `${detail.summary.path}/${rel}`;
    const fileInfo = files.find((f) => f.path === path);
    const decision = detail.decisions.find((d) => d.id === CONTEXT.decision);
    const missing = !reviewed
      ? LIB.reviewed
      : !decisionLib
        ? LIB.decision
        : !draft
          ? LIB.draft
          : !term
            ? `The glossary term “${CONTEXT.term}”`
            : !fileInfo
              ? path
              : !decision
                ? `${ISSUE.rich}#${CONTEXT.decision}`
                : undefined;
    if (missing || !reviewed || !decisionLib || !draft || !term || !fileInfo || !decision) {
      return { missing: missing ?? "A sample item" };
    }
    const docTitle = detail.docs.find((d) => d.path === rel)?.title;
    const items = {
      reviewed: libraryItem(reviewed),
      decisionLib: libraryItem(decisionLib),
      draft: libraryItem(draft),
      term: termItem(term),
      file: fileItem(fileInfo, detail.summary, docTitle),
      decision: decisionItem(detail.summary, decision),
    };
    const dir = detail.summary.path;
    const bullet = (item: ContextItem) => linkLine(toLink(item), dir);
    const linksMd = [
      bullet(items.reviewed),
      bullet(items.draft),
      bullet(items.decision),
      bullet(items.term),
      bullet(items.file),
      "- [[wf-7p4dn]]: index scan and snapshot.",
      "- `spec/api.md`: the SSE event types.",
    ].join("\n");
    return {
      samples: {
        ...items,
        all: [items.reviewed, items.draft, items.file, items.term, items.decision],
        linksMd,
        dir,
      },
    };
  }, [snapshot, glossary, files, detail]);
}

/** Renders once the sample items exist; says so when the mock world lost one of them. */
function WithSamples({ children }: { children: (samples: Samples) => ReactNode }) {
  const state = useSamples();
  if (!state) return <Loading height={96} />;
  if ("missing" in state) return <Missing what={state.missing} />;
  return <>{children(state.samples)}</>;
}

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
        <WithSamples>{(s) => <PickerDemo initial={s.all} />}</WithSamples>
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
          <WithSamples>
            {(s) => (
              <div className="p-2">
                <PickerDemo initial={[s.reviewed]} open />
              </div>
            )}
          </WithSamples>
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
      <WithSamples>
        {(s) => (
          <Row>
            {s.all.map((item) => (
              <ContextChip key={item.target} item={item} onRemove={() => undefined} />
            ))}
            <ContextChip item={s.reviewed} />
          </Row>
        )}
      </WithSamples>
    </V>
  );
}

// ---------------------------------------------------------------- ContextPreview

function ContextPreviewBody() {
  return (
    <>
      <V label="under budget · 6,000 tokens" width={560}>
        <WithSamples>
          {(s) => <ContextPreview items={[s.reviewed, s.decisionLib, s.file]} budget={6000} />}
        </WithSamples>
      </V>
      <V
        label="with a draft and a term"
        note="A draft is listed by name. Its text is not injected until someone reviews it."
        width={560}
      >
        <WithSamples>
          {(s) => <ContextPreview items={s.all} budget={6000} issueId={ISSUE.rich} />}
        </WithSamples>
      </V>
      <V
        label="over budget · 400 tokens"
        note="Amber. The last items are left out first, the way wf context drops them."
        width={560}
      >
        <WithSamples>{(s) => <ContextPreview items={s.all} budget={400} />}</WithSamples>
      </V>
      <V label="collapsed" width={560}>
        <WithSamples>
          {(s) => <ContextPreview items={s.all} budget={6000} defaultOpen={false} />}
        </WithSamples>
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
      note="Library items, entries and issues are RefLinks. A term opens the glossary, a file opens its source in Workdatabase · Files. A bullet wf does not know keeps its markdown."
      width={560}
    >
      <WithSamples>
        {(s) => (
          <Sandbox path="/w">
            <LinkedContext md={s.linksMd} issueId={ISSUE.rich} dir={s.dir} />
          </Sandbox>
        )}
      </WithSamples>
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
    "Adds context to an issue that already exists, with the same search as the Add work flow.",
    AddContextButtonBody,
  ),
];
