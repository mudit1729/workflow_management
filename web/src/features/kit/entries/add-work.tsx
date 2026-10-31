// Kit entries for + Add work (plan D6) and the board's Needs you filter (D5).
//
// The dialog is shown as its inside, screen by screen, in a framed surface (the real dialog is
// modal and would cover the page). Every frame runs the real flow on the sample workspace the kit
// holds, so a click goes on to the next screen and the last one writes to the sample copy.
import { useState } from "react";
import type { AddWorkStart } from "@/app/shell-store";
import { Button } from "@/components/ui";
import { DiscardDialog } from "@/features/add-work/AddWorkDialog";
import { AddWorkPanel } from "@/features/add-work/AddWorkPanel";
import {
  type Draft,
  emptyDraft,
  issueSignature,
  rowsFrom,
  type SplitRow,
  type StepId,
  splitSignature,
} from "@/features/add-work/flow";
import { ChoiceList, KeyCap, ProgressDots, ToggleChip } from "@/features/add-work/parts";
import { SplitCard, SplitProgress, StartIn } from "@/features/add-work/steps/SplitStep";
import { useAddWorkFlow } from "@/features/add-work/useAddWorkFlow";
import { BoardPage } from "@/features/board";
import { NeedsYouToggle } from "@/features/board/BoardToolbar";
import { SPLIT_STEPS } from "@/lib/api";
import { entry, type KitEntry, Sandbox, V } from "../kit-ui";

const SRC = "src/features/add-work";

// ---------------------------------------------------------------- the flow, screen by screen

/** What Codex proposed for the group, as the split returns it (the split screen runs the real one). */
const PROPOSALS = [
  {
    key: "p1",
    title: "Define the live board contract",
    size: "s",
    priority: "high",
    criterion: "The contract shall list each request, response and error.",
    why: "Fix the request and response shapes before any code.",
  },
  {
    key: "p2",
    title: "Build the live board route",
    size: "m",
    priority: "high",
    criterion: "When a client calls the route, the server shall return the documented response.",
    why: "Deliver the happy path so clients can start against it.",
  },
  {
    key: "p3",
    title: "Guard the live board against bad input",
    size: "s",
    priority: "medium",
    criterion: "If the input is invalid, then the server shall name the field and refuse it.",
    why: "Refuse bad input at the edge, with the field named.",
  },
] as const;

const OUTCOME = "Push board updates over SSE so the board stays live";

function seedDraft(over: Partial<Draft>): Partial<Draft> {
  return { kind: "group", where: "g-wf001", outcome: OUTCOME, name: "Live board", ...over };
}

/** One frame: the real flow started on `step`, with some answers already in. */
function Frame({
  step,
  draft,
  start,
}: {
  step: StepId;
  draft?: Partial<Draft>;
  start?: AddWorkStart;
}) {
  return (
    <Sandbox quiet path="/w">
      <FrameBody step={step} draft={draft} start={start} />
    </Sandbox>
  );
}

function FrameBody({
  step,
  draft,
  start,
}: {
  step: StepId;
  draft?: Partial<Draft>;
  start?: AddWorkStart;
}) {
  const flow = useAddWorkFlow({ start, onClose: () => {}, seed: { step, draft } });
  return (
    <div data-wf="AddWorkSurface" className="flex min-h-0 flex-1 flex-col bg-bg">
      <header className="flex h-11 shrink-0 items-center px-4 font-semibold text-fg text-md">
        Add work
      </header>
      <AddWorkPanel flow={flow} autoFocus={false} />
      <DiscardDialog
        open={flow.confirming}
        onKeepEditing={flow.keepEditing}
        onDiscard={flow.discard}
      />
    </div>
  );
}

function Screen({
  label,
  note,
  step,
  draft,
  start,
  height = 600,
}: {
  label: string;
  note?: string;
  step: StepId;
  draft?: Partial<Draft>;
  start?: AddWorkStart;
  height?: number;
}) {
  return (
    <V label={label} note={note} width={560} height={height}>
      <Frame step={step} draft={draft} start={start} />
    </V>
  );
}

function AddWorkDialogBody() {
  const groupDraft = seedDraft({});
  const withRows = seedDraft({
    status: "backlog",
    size: "m",
    priority: "high",
    split: {
      signature: splitSignature(emptyDraft(seedDraft({ size: "m" }))),
      rows: rowsFrom([...PROPOSALS], "high"),
    },
  });
  const issueAnswers = emptyDraft({
    kind: "issue",
    where: "g-web01",
    title: "Fix tab-title count",
    priority: "high",
    size: "xs",
    status: "planned",
  });
  // Seeded with Codex's draft, so the frame shows the criterion at once instead of the 2 s wait.
  const issueReview: Partial<Draft> = {
    ...issueAnswers,
    issue: {
      signature: issueSignature(issueAnswers),
      criterion:
        "When a board column holds cards, the tab title shall show the number of open cards.",
      why: "People read the tab title to see how much is waiting, so it has to match the board.",
    },
  };
  return (
    <>
      <Screen
        label="1 · What are you adding? (skipped when the caller names the kind)"
        step="kind"
        draft={{}}
        height={420}
      />
      <Screen
        label="2 · Where: buttons, the top level preselected"
        step="where"
        draft={{ kind: "group" }}
        height={640}
      />
      <Screen
        label="3 · The outcome: the one typed line"
        step="outcome"
        draft={{ kind: "group", where: "g-wf001", outcome: OUTCOME }}
        height={300}
      />
      <Screen
        label="4 · The name: three suggestions and Write my own"
        step="name"
        draft={{ ...groupDraft, name: "" }}
        height={440}
      />
      <Screen label="5 · Size of the whole" step="size" draft={groupDraft} height={400} />
      <Screen label="6 · Priority" step="priority" draft={groupDraft} height={480} />
      <Screen
        label="7 · Context from the library: toggle chips, Skip"
        note="Library items and glossary terms found by a search on the outcome."
        step="context"
        draft={groupDraft}
        height={420}
      />
      <Screen
        label="8 · Codex splits it (runs the mock split, about 2 s)"
        note="Three steps, then the proposals."
        step="split"
        draft={groupDraft}
        height={640}
      />
      <Screen
        label="8 · The proposals: keep or drop, where they start, add"
        note="The last screen of a group. Backlog or Planned (keys 1 and 2), and the button adds the kept issues: no separate review."
        step="split"
        draft={withRows}
        height={720}
      />
      <Screen
        label="Issue path · the title (verb first)"
        step="title"
        draft={{ kind: "issue", where: "g-web01", title: "Fix tab-title count" }}
        start={{ kind: "issue" }}
        height={300}
      />
      <Screen
        label="Issue path · status"
        step="status"
        draft={{
          kind: "issue",
          where: "g-web01",
          title: "Fix tab-title count",
          priority: "high",
          size: "xs",
        }}
        start={{ kind: "issue" }}
        height={380}
      />
      <Screen
        label="Issue path · add (the criterion Codex drafted, with Edit)"
        step="review"
        draft={issueReview}
        start={{ kind: "issue" }}
        height={440}
      />
    </>
  );
}

// ---------------------------------------------------------------- answers

function Choice({
  label,
  note,
  initial,
  columns,
  dense,
}: {
  label: string;
  note?: string;
  initial?: string;
  columns?: 1 | 2;
  dense?: boolean;
}) {
  const [value, setValue] = useState<string | undefined>(initial);
  return (
    <V label={label} note={note} width={520}>
      <ChoiceList<string>
        label={label}
        value={value}
        columns={columns}
        dense={dense}
        autoFocus={false}
        advanceOnClick={false}
        onPick={setValue}
        onGo={setValue}
        options={[
          { value: "a", label: "Backlog", hint: "Not scheduled yet" },
          { value: "b", label: "Planned", hint: "Scheduled, ready to start" },
          ...(columns === 2
            ? []
            : [{ value: "c", label: "Top level", hint: "Beside wf, platform" }]),
        ]}
      />
    </V>
  );
}

function ChoiceListBody() {
  return (
    <>
      <Choice label="nothing picked" />
      <Choice label="one picked" initial="b" />
      <Choice label="two columns" columns={2} initial="a" />
      <Choice label="dense: one line per answer" dense initial="c" />
    </>
  );
}

function ChoiceButtonBody() {
  return (
    <V
      label="number key · label · hint · check"
      note="Selected: accent border, filled key cap and a check. The key cap is hidden on a phone."
      width={520}
    >
      <div className="flex flex-col gap-2">
        <div className="flex min-h-12 items-center gap-3 rounded-md border border-border px-3 py-2">
          <KeyCap n={1} />
          <span className="font-medium text-md">Unselected</span>
        </div>
        <div className="flex min-h-12 items-center gap-3 rounded-md border border-accent bg-accent-subtle px-3 py-2">
          <KeyCap n={2} selected />
          <span className="font-medium text-md">Selected</span>
        </div>
      </div>
    </V>
  );
}

function ToggleChipBody() {
  const [on, setOn] = useState([true, false]);
  const labels = ["Push one-way live updates over SSE", "Quote handles in YAML frontmatter"];
  return (
    <V label="toggle: library items and glossary terms" width={520}>
      <div className="flex flex-wrap gap-2">
        {labels.map((l, i) => (
          <ToggleChip
            key={l}
            n={i + 1}
            pressed={on[i]}
            onToggle={() => setOn((s) => s.map((v, j) => (j === i ? !v : v)))}
          >
            <span className="truncate">{l}</span>
          </ToggleChip>
        ))}
      </div>
    </V>
  );
}

function ProgressDotsBody() {
  const steps: StepId[] = [
    "kind",
    "where",
    "outcome",
    "name",
    "size",
    "priority",
    "context",
    "split",
  ];
  return (
    <>
      {[0, 3, 7].map((i) => (
        <V key={i} label={`question ${i + 1} of 8`} note="Dots behind you go back." width={260}>
          <div className="flex justify-center py-1">
            <ProgressDots steps={steps} index={i} onGo={() => {}} />
          </div>
        </V>
      ))}
    </>
  );
}

// ---------------------------------------------------------------- the split

function SplitProgressBody() {
  return (
    <>
      {[0, 1, 2].map((i) => (
        <V key={i} label={`step ${i + 1} in progress`} width={520}>
          <SplitProgress steps={SPLIT_STEPS} step={i} pending />
        </V>
      ))}
    </>
  );
}

function Card({ label, row, note }: { label: string; row: SplitRow; note?: string }) {
  const [state, setState] = useState(row);
  return (
    <V label={label} note={note} width={520}>
      <SplitCard row={state} onChange={(c) => setState((r) => ({ ...r, ...c }))} />
    </V>
  );
}

function SplitCardBody() {
  const base = rowsFrom([...PROPOSALS], "high");
  return (
    <>
      <Card
        label="kept"
        row={base[0]}
        note="Edit title turns the title into a field; Enter saves, Esc cancels."
      />
      <Card label="dropped" row={{ ...base[1], keep: false }} />
    </>
  );
}

function StartInBody() {
  const [value, setValue] = useState<"backlog" | "planned">("backlog");
  return (
    <V
      label="Backlog (default) or Planned"
      note="Keys 1 and 2 on the split screen. Planned issues are ready to start."
      width={520}
    >
      <StartIn value={value} onChange={setValue} />
    </V>
  );
}

function DiscardBody() {
  const [open, setOpen] = useState(false);
  return (
    <V label="Esc, the × or a click away, after typing" width={260}>
      <Button variant="secondary" onClick={() => setOpen(true)}>
        Open the question
      </Button>
      <DiscardDialog
        open={open}
        onKeepEditing={() => setOpen(false)}
        onDiscard={() => setOpen(false)}
      />
    </V>
  );
}

// ---------------------------------------------------------------- the board's Needs you filter

function NeedsYouToggleBody() {
  const [active, setActive] = useState(true);
  return (
    <>
      <V label="nothing needs you" width={180}>
        <NeedsYouToggle active={false} requests={0} issues={0} onChange={() => {}} />
      </V>
      <V label="4 open requests" width={180}>
        <NeedsYouToggle active={false} requests={4} issues={3} onChange={() => {}} />
      </V>
      <V label="filter on (click to switch)" width={180}>
        <NeedsYouToggle active={active} requests={4} issues={3} onChange={setActive} />
      </V>
      <V
        label="the board with the filter on"
        note="Only issues with an open request for the acting person. The empty state is “Nothing needs you”."
        fill
        height={420}
      >
        <Sandbox quiet path="/w?needs=me">
          <BoardPage />
        </Sandbox>
      </V>
      <V label="nothing needs you here, but requests wait in other groups" fill height={320}>
        <Sandbox quiet path="/w?needs=me&group=g-auth1">
          <BoardPage />
        </Sandbox>
      </V>
    </>
  );
}

export const addWorkEntries: KitEntry[] = [
  entry(
    "Shell",
    "AddWorkDialog",
    `${SRC}/AddWorkDialog.tsx`,
    "One way to add work: a group that Codex splits into issues, or one issue, asked one question at a time with buttons first and typing last.",
    AddWorkDialogBody,
  ),
  entry(
    "Shell",
    "ChoiceList",
    `${SRC}/parts.tsx`,
    "The answer buttons of one question: numbered, one pick, a click or Enter goes on, the arrows move the pick.",
    ChoiceListBody,
  ),
  entry(
    "Shell",
    "ChoiceButton",
    `${SRC}/parts.tsx`,
    "A large answer button: the key to press, the answer and a line that says what it means.",
    ChoiceButtonBody,
  ),
  entry(
    "Shell",
    "ToggleChip",
    `${SRC}/parts.tsx`,
    "A chip for a question with several answers (context): pressed shows the accent, the number key toggles it.",
    ToggleChipBody,
  ),
  entry(
    "Shell",
    "ProgressDots",
    `${SRC}/parts.tsx`,
    "Where you are in the questions: one dot each, a longer pill for the current one, and the dots behind you go back.",
    ProgressDotsBody,
  ),
  entry(
    "Shell",
    "SplitProgress",
    `${SRC}/steps/SplitStep.tsx`,
    "The three things Codex does while it splits a group, the current one marked and the finished ones checked.",
    SplitProgressBody,
  ),
  entry(
    "Shell",
    "SplitCard",
    `${SRC}/steps/SplitStep.tsx`,
    "One issue Codex proposed: keep or drop it, change its size and priority, edit the title only when asked.",
    SplitCardBody,
  ),
  entry(
    "Shell",
    "SplitStart",
    `${SRC}/steps/SplitStep.tsx`,
    "Where the issues start is two buttons on the same screen as the proposals, so adding a group needs no review screen.",
    StartInBody,
  ),
  entry(
    "Shell",
    "DiscardDialog",
    `${SRC}/AddWorkDialog.tsx`,
    "Esc, the × and a click away ask first once there is something to lose; before that they just close.",
    DiscardBody,
  ),
  entry(
    "Workflow · Board",
    "NeedsYouToggle",
    "src/features/board/BoardToolbar.tsx",
    "The board's way to show what waits on you (it replaces the inbox list): one click, and the count says how many requests are open.",
    NeedsYouToggleBody,
  ),
];
