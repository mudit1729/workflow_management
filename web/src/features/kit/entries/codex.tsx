// Kit entries for the Codex buttons (plan D3, D4). Integration registers `codexEntries` in
// `registry.ts`. The live variants run the real mock: a click starts a run in the sample copy the
// kit holds, and the run takes about six seconds. The static variants show one state each.
import { Play } from "lucide-react";
import { Button } from "@/components/ui";
import { IssueCard } from "@/features/board";
import {
  CodexActions,
  CodexRunMarker,
  OpenInCodexPanel,
  RunNotice,
  RunStatus,
  RunsList,
} from "@/features/codex";
import type { CodexPhaseId, CodexRun, CodexRunStatus } from "@/lib/api";
import { useStartCodexRun } from "@/lib/api";
import { entry, type KitEntry, Sandbox, V, WithSummary } from "../kit-ui";
import { ISSUE } from "./data";

const SRC = "src/features/codex";

// ---------------------------------------------------------------- fixtures

const ORDER: CodexPhaseId[] = ["claim", "log", "verify", "done"];

function ago(seconds: number): string {
  return new Date(Date.now() - seconds * 1000).toISOString().replace(/\.\d+Z$/, "Z");
}

/** A run in a given state. A run that stopped early leaves its cut-short phase `pending`. */
function fixture(
  status: CodexRunStatus,
  phase: CodexPhaseId | undefined,
  extra: Partial<CodexRun> = {},
): CodexRun {
  const task = "T-4";
  const labels: Record<CodexPhaseId, string> = {
    claim: `Claim ${task}`,
    log: "Log the change",
    verify: "Run CI",
    done: `Finish ${task}`,
  };
  const at = phase ? ORDER.indexOf(phase) : -1;
  const phases =
    status === "nothing_ready"
      ? []
      : ORDER.map((id, i) => ({
          id,
          label: labels[id],
          state:
            status === "done"
              ? ("done" as const)
              : i < at
                ? ("done" as const)
                : i === at && status === "running"
                  ? ("running" as const)
                  : ("pending" as const),
        }));
  return {
    id: `run-${status}-${phase ?? "none"}`,
    issue: ISSUE.rich,
    kind: "next_step",
    status,
    by: "codex",
    task: status === "nothing_ready" ? undefined : task,
    task_title: status === "nothing_ready" ? undefined : "Wire resync into the board store",
    phase,
    phases,
    started_at: ago(40),
    ...(status === "running" ? {} : { finished_at: ago(30) }),
    ...extra,
  };
}

const RUNNING: { label: string; run: CodexRun }[] = [
  { label: "claim", run: fixture("running", "claim") },
  { label: "log", run: fixture("running", "log") },
  { label: "verify", run: fixture("running", "verify") },
];

const NOTHING = [
  fixture("nothing_ready", undefined, { reason: "No ready task. Plan the issue first." }),
  fixture("nothing_ready", undefined, { reason: "No ready task. Wait for the tasks in flight." }),
  fixture("nothing_ready", undefined, { reason: "Every task is done." }),
];

const HISTORY: CodexRun[] = [
  fixture("running", "log", { id: "run-h1", started_at: ago(8) }),
  fixture("done", "done", {
    id: "run-h2",
    task: "T-3",
    task_title: "Build the SSE delta stream",
    finished_at: ago(600),
    commit: "3a9f2c1",
    pipeline: "ci-4001",
  }),
  fixture("cancelled", "verify", {
    id: "run-h3",
    finished_at: ago(3 * 3600),
    reason: "Stopped before the task finished.",
  }),
  fixture("failed", "log", {
    id: "run-h4",
    finished_at: ago(26 * 3600),
    reason: "T-4 changed while Codex worked on it.",
  }),
  fixture("nothing_ready", undefined, {
    id: "run-h5",
    finished_at: ago(2 * 86400),
    reason: "No ready task. Plan the issue first.",
  }),
];

// ---------------------------------------------------------------- CodexActions

function Framed({ id, width }: { id: string; width: number }) {
  return (
    <Sandbox quiet>
      <WithSummary id={id}>
        {(s) => (
          <div className="rounded-md border border-border bg-bg p-3" style={{ width }}>
            <CodexActions issue={s} />
          </div>
        )}
      </WithSummary>
    </Sandbox>
  );
}

function CodexActionsBody() {
  return (
    <>
      <V
        label="live · wf-3k9x2 (T-4 is ready)"
        note="Click Do next step: the strip follows the run (about 6 s), then the task, the Log, Git and CI change."
      >
        <Framed id={ISSUE.rich} width={528} />
      </V>
      <V
        label="live · wf-h2tb7 (no plan: nothing ready)"
        note="Click Do next step: the reason shows on its own line, with a way to the Plan tab."
      >
        <Framed id={ISSUE.noPlan} width={528} />
      </V>
      <V label="drawer at its narrowest (440 px)" width={408}>
        <Framed id={ISSUE.rich} width={408} />
      </V>
      <V
        label="phone (358 px)"
        note="The labels give way to the glyph while a run shows, so the phase keeps its room."
      >
        <Framed id={ISSUE.rich} width={358} />
      </V>
    </>
  );
}

// ---------------------------------------------------------------- RunStatus, RunNotice

function RunStatusBody() {
  return (
    <>
      {RUNNING.map(({ label, run }) => (
        <V key={label} label={`running · ${label}`} width={360}>
          <RunStatus run={run} onCancel={() => undefined} />
        </V>
      ))}
      <V label="done" note="Stays for six seconds, with a way to the Log." width={360}>
        <RunStatus run={fixture("done", "done")} onOpenLog={() => undefined} />
      </V>
      <V label="cancelled" width={360}>
        <RunStatus
          run={fixture("cancelled", "verify", { reason: "Stopped before the task finished." })}
        />
      </V>
    </>
  );
}

function RunNoticeBody() {
  return (
    <>
      {NOTHING.map((run) => (
        <V key={run.reason} label={`nothing ready · ${run.reason}`} width={480}>
          <RunNotice run={run} onOpenPlan={() => undefined} onDismiss={() => undefined} />
        </V>
      ))}
      <V label="failed" width={480}>
        <RunNotice
          run={fixture("failed", "log", { reason: "T-4 changed while Codex worked on it." })}
          onOpenPlan={() => undefined}
          onDismiss={() => undefined}
        />
      </V>
      <V label="failed · phone (358 px), the sentence wraps" width={358}>
        <RunNotice
          run={fixture("failed", "log", { reason: "T-4 changed while Codex worked on it." })}
          onOpenPlan={() => undefined}
          onDismiss={() => undefined}
        />
      </V>
    </>
  );
}

// ---------------------------------------------------------------- OpenInCodexPanel

function Popover({ children }: { children: React.ReactNode }) {
  return (
    <div className="w-[380px] max-w-full rounded-md border border-border bg-bg p-3 shadow-pop">
      {children}
    </div>
  );
}

function OpenInCodexBody() {
  return (
    <>
      <V label="after the click · copied" note="What the popover shows next to the button.">
        <WithSummary id={ISSUE.rich}>
          {(s) => (
            <Popover>
              <OpenInCodexPanel issue={s} copied />
            </Popover>
          )}
        </WithSummary>
      </V>
      <V label="clipboard blocked">
        <WithSummary id={ISSUE.noPlan}>
          {(s) => (
            <Popover>
              <OpenInCodexPanel issue={s} copied={false} />
            </Popover>
          )}
        </WithSummary>
      </V>
    </>
  );
}

// ---------------------------------------------------------------- RunsList

function RunsListBody() {
  return (
    <>
      <V label="five runs, newest first" width={340}>
        <Sandbox quiet>
          <Popover>
            <RunsList runs={HISTORY} onOpenTab={() => undefined} />
          </Popover>
        </Sandbox>
      </V>
      <V label="no runs" width={340}>
        <Popover>
          <RunsList runs={[]} />
        </Popover>
      </V>
    </>
  );
}

// ---------------------------------------------------------------- CodexRunMarker

function Slot({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex w-[264px] min-w-0 items-center gap-2 rounded-md border border-border bg-bg px-3 py-2.5 text-fg-faint text-xs">
      {children}
      <span className="ml-auto font-mono tabular">wf-3k9x2</span>
    </div>
  );
}

function StartOnCard({ id }: { id: string }) {
  const { start } = useStartCodexRun();
  return (
    <Button
      variant="secondary"
      size="sm"
      className="self-start"
      onClick={() => void start(id, "next_step")}
    >
      <Play size={14} strokeWidth={1.75} />
      Do next step
    </Button>
  );
}

function CodexRunMarkerBody() {
  return (
    <>
      {RUNNING.map(({ label, run }) => (
        <V key={label} label={`running · ${label}`} width={264}>
          <Slot>
            <CodexRunMarker run={run} />
          </Slot>
        </V>
      ))}
      <V label="done" note="Shows for four seconds, then the path comes back." width={264}>
        <Slot>
          <CodexRunMarker run={fixture("done", "done")} />
        </Slot>
      </V>
      <V
        label="live · the card"
        note="Start a run and watch the card: it keeps its height, and the marker takes the place of the group path."
        width={264}
      >
        <Sandbox quiet>
          <div className="flex flex-col gap-2">
            <WithSummary id={ISSUE.rich}>{(s) => <IssueCard issue={s} dragDisabled />}</WithSummary>
            <StartOnCard id={ISSUE.rich} />
          </div>
        </Sandbox>
      </V>
    </>
  );
}

// ---------------------------------------------------------------- entries

export const codexEntries: KitEntry[] = [
  entry(
    "Issue · Header",
    "CodexActions",
    `${SRC}/CodexActions.tsx`,
    "Two buttons let you work with Codex without leaving the board: hand the issue over, or let it do the next step in the background and watch it.",
    CodexActionsBody,
  ),
  entry(
    "Issue · Header",
    "CodexRunStatus",
    `${SRC}/RunStatus.tsx`,
    "While Codex works, the button's own slot says what it is doing, so a click is answered and the run is never a mystery.",
    RunStatusBody,
  ),
  entry(
    "Issue · Header",
    "CodexRunNotice",
    `${SRC}/RunStatus.tsx`,
    "A run with nothing to do says why in a sentence, with the next move, instead of failing silently.",
    RunNoticeBody,
  ),
  entry(
    "Issue · Header",
    "OpenInCodexPanel",
    `${SRC}/OpenInCodex.tsx`,
    "The popover shows the exact prompt Codex receives, so the person never pastes a command they have not seen.",
    OpenInCodexBody,
  ),
  entry(
    "Issue · Header",
    "CodexRunsList",
    `${SRC}/RunsPopover.tsx`,
    "The issue's recent runs, each with how it ended and the commit and CI run it added, answer 'what did Codex do here?'.",
    RunsListBody,
  ),
  entry(
    "Workflow · Board",
    "CodexRunMarker",
    `${SRC}/CodexRunMarker.tsx`,
    "A card shows that Codex is on its issue without growing: the Codex tile, the task and one word for the phase take the path's place.",
    CodexRunMarkerBody,
  ),
];
