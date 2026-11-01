// Kit entries for the agent buttons (plan D3, D4, D12). The live variants run the real mock: a
// click starts a run in the sample copy the kit holds, and the run takes about six seconds; with no
// agent connected (the nav's agent row) the click opens the connect flow first. The static variants
// show one state each, for Codex and for Claude Code, and for a run on a real bridge.
import { Play } from "lucide-react";
import { Button } from "@/components/ui";
import { IssueCard } from "@/features/board";
import type { CodexIssue } from "@/features/codex";
import {
  CodexActions,
  CodexRunMarker,
  OpenInCodexPanel,
  RunNotice,
  RunStatus,
  RunsList,
  useNextStep,
} from "@/features/codex";
import type { CodexPhaseId, CodexRun, CodexRunStatus } from "@/lib/api";
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
    agent: "codex",
    source: "simulated",
    task: status === "nothing_ready" ? undefined : task,
    task_title: status === "nothing_ready" ? undefined : "Wire resync into the board store",
    phase,
    phases,
    started_at: ago(40),
    ...(status === "running" ? {} : { finished_at: ago(30) }),
    ...extra,
  };
}

/** A run on a real bridge: no phases, no task; the agent printed a last line. */
function bridge(status: CodexRunStatus, extra: Partial<CodexRun> = {}): CodexRun {
  return {
    id: `run-bridge-${status}`,
    issue: ISSUE.rich,
    kind: "next_step",
    status,
    by: "codex",
    agent: "codex",
    source: "bridge",
    phases: [],
    started_at: ago(40),
    ...(status === "running" ? {} : { finished_at: ago(30) }),
    ...extra,
  };
}

const HOST = "laptop-2";

const BRIDGE_RUNNING = bridge("running", {
  lastLine: "Reading plan.md and picking the next ready task",
});
const CLAUDE_RUNNING = bridge("running", {
  id: "run-bridge-claude",
  by: "claude",
  agent: "claude",
  lastLine: "Editing plan.md: T-4 is in progress",
});

const RUNNING: { label: string; run: CodexRun }[] = [
  { label: "claim", run: fixture("running", "claim") },
  { label: "log", run: fixture("running", "log") },
  { label: "verify", run: fixture("running", "verify") },
  {
    label: "claim, on an issue without a plan",
    run: fixture("running", "claim", {
      plans: true,
      task: "T-1",
      phases: [
        { id: "claim", label: "Plan the issue, claim T-1", state: "running" },
        { id: "log", label: "Log the change", state: "pending" },
        { id: "verify", label: "Run CI", state: "pending" },
        { id: "done", label: "Finish T-1", state: "pending" },
      ],
    }),
  },
];

const NOTHING = [
  fixture("nothing_ready", undefined, { reason: "No ready task. Wait for the tasks in flight." }),
  fixture("nothing_ready", undefined, { reason: "Every task is done." }),
  fixture("nothing_ready", undefined, { reason: "Waiting on Q-4m2pz: Which stream format?" }),
  fixture("nothing_ready", undefined, {
    reason: "The issue has no criteria to plan from. Add one to goal.md first.",
  }),
  fixture("nothing_ready", undefined, { reason: "Waiting on wf-3k9x2: it is not done." }),
  fixture("nothing_ready", undefined, {
    reason:
      "@cursor-bot holds the lease on this issue and has not planned it. Ask them to plan it.",
  }),
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
  bridge("done", { id: "run-h4b", finished_at: ago(27 * 3600), started_at: ago(27 * 3600 + 50) }),
  fixture("nothing_ready", undefined, {
    id: "run-h5",
    finished_at: ago(2 * 86400),
    reason: "Waiting on Q-4m2pz: Which stream format?",
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
        note="Click Do next step: the strip follows the run (about 6 s), then the task, the Log, Git and CI change. With no agent connected the click opens the connect flow, and the run starts after it. The buttons name the connected agent."
      >
        <Framed id={ISSUE.rich} width={528} />
      </V>
      <V
        label="live · wf-h2tb7 (another author holds the lease)"
        note="Click Do next step: the reason shows on its own line, without a button, because the header already names the lease."
      >
        <Framed id={ISSUE.noPlan} width={528} />
      </V>
      <V
        label="live · wf-e6kc1 (no plan: the agent plans first)"
        note="Click Do next step: the strip says Planning, claiming T-1, then follows the run. plan.md and the first change entry appear."
      >
        <Framed id="wf-e6kc1" width={528} />
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
      <V
        label="running · on a bridge: where it runs and the last line"
        note="No phases to count: the tile pulses, the last line the agent printed follows."
        width={480}
      >
        <RunStatus run={BRIDGE_RUNNING} host={HOST} onCancel={() => undefined} />
      </V>
      <V label="running · on a bridge · Claude Code" width={480}>
        <RunStatus run={CLAUDE_RUNNING} host={HOST} onCancel={() => undefined} />
      </V>
      <V label="running · on a bridge · phone (358 px), the last line gives way" width={358}>
        <div className="@container w-full">
          <RunStatus run={BRIDGE_RUNNING} host={HOST} onCancel={() => undefined} />
        </div>
      </V>
      <V label="done" note="Stays for six seconds, with a way to the Log." width={360}>
        <RunStatus run={fixture("done", "done")} onOpenLog={() => undefined} />
      </V>
      <V label="done · on a bridge" width={360}>
        <RunStatus run={bridge("done")} onOpenLog={() => undefined} />
      </V>
      <V label="done · the task waits for a hand check" width={360}>
        <RunStatus run={fixture("done", "done", { review: true })} onOpenLog={() => undefined} />
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
          <RunNotice run={run} onOpen={() => undefined} onDismiss={() => undefined} />
        </V>
      ))}
      <V label="failed" width={480}>
        <RunNotice
          run={fixture("failed", "log", { reason: "T-4 changed while Codex worked on it." })}
          onOpen={() => undefined}
          onDismiss={() => undefined}
        />
      </V>
      <V
        label="failed · on a bridge, by the exit code"
        note="No button: the plan holds no answer to an exit code."
        width={480}
      >
        <RunNotice
          run={bridge("failed", { reason: "Codex exited with code 1." })}
          onOpen={() => undefined}
          onDismiss={() => undefined}
        />
      </V>
      <V
        label="failed · on a bridge, the bridge was lost"
        note="Agent status opens the Agent panel, where Reconnect is."
        width={480}
      >
        <RunNotice
          run={bridge("failed", {
            reason: "Lost the bridge. Codex may still be working on your computer.",
          })}
          onOpen={() => undefined}
          onOpenAgent={() => undefined}
          onDismiss={() => undefined}
        />
      </V>
      <V label="failed · phone (358 px), the sentence wraps" width={358}>
        <RunNotice
          run={fixture("failed", "log", { reason: "T-4 changed while Codex worked on it." })}
          onOpen={() => undefined}
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
      <V
        label="Claude Code · the button follows the connected agent"
        note="Open in Claude Code copies claude '…'."
      >
        <WithSummary id={ISSUE.rich}>
          {(s) => (
            <Popover>
              <OpenInCodexPanel issue={s} copied agent="claude" />
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
      <V
        label="a run on a bridge: where it runs and its last line"
        note="Both agents on one issue: the title says Agent runs."
        width={340}
      >
        <Popover>
          <RunsList
            runs={[
              CLAUDE_RUNNING,
              bridge("failed", { reason: "Codex exited with code 1." }),
              HISTORY[1],
            ]}
            host={HOST}
          />
        </Popover>
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

function StartOnCard({ issue }: { issue: CodexIssue }) {
  // The same path as the card menu: with no agent connected it opens the connect flow.
  const { start } = useNextStep(issue);
  return (
    <Button variant="secondary" size="sm" className="self-start" onClick={() => void start()}>
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
      <V label="running · on a bridge: no task, one word" width={264}>
        <Slot>
          <CodexRunMarker run={BRIDGE_RUNNING} />
        </Slot>
      </V>
      <V label="running · on a bridge · Claude Code" width={264}>
        <Slot>
          <CodexRunMarker run={CLAUDE_RUNNING} />
        </Slot>
      </V>
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
            <WithSummary id={ISSUE.rich}>
              {(s) => (
                <>
                  <IssueCard issue={s} dragDisabled />
                  <StartOnCard issue={s} />
                </>
              )}
            </WithSummary>
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
    "Two buttons let you work with your agent without leaving the board: hand the issue over, or let it do the next step in the background and watch it.",
    CodexActionsBody,
  ),
  entry(
    "Issue · Header",
    "CodexRunStatus",
    `${SRC}/RunStatus.tsx`,
    "While the agent works, the button's own slot says what it is doing, so a click is answered and the run is never a mystery.",
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
    "The popover shows the exact prompt the agent receives, so the person never pastes a command they have not seen.",
    OpenInCodexBody,
  ),
  entry(
    "Issue · Header",
    "CodexRunsList",
    `${SRC}/RunsPopover.tsx`,
    "The issue's recent runs, each with how it ended and the commit and CI run it added, answer 'what did the agent do here?'.",
    RunsListBody,
  ),
  entry(
    "Workflow · Board",
    "CodexRunMarker",
    `${SRC}/CodexRunMarker.tsx`,
    "A card shows that an agent is on its issue without growing: the agent's tile, the task and one word for the phase take the path's place.",
    CodexRunMarkerBody,
  ),
];
