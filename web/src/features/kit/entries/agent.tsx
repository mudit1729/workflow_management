// Kit entries for connecting an agent (plan D10, D11): the nav row in its four states, each screen
// of the connect flow, and the Agent panel. The nav rows and the panels take the connection as
// data, so every state shows without a bridge; the flow frames run the real flow on a fixed
// connection (a click goes on to the next screen and starts nothing).
import type { AgentStart } from "@/app/shell-store";
import { AgentPanelBody } from "@/features/agent/AgentPanel";
import { AgentStatusRow } from "@/features/agent/AgentStatus";
import { ConnectAgentPanel } from "@/features/agent/ConnectAgentPanel";
import { type FlowSeed, useConnectFlow } from "@/features/agent/useConnectFlow";
import {
  type AgentConnection,
  type AgentKind,
  type CodexRun,
  pairCommand,
  simulatedConnection,
  WF_SKILL_NAMES,
} from "@/lib/api";
import { entry, type KitEntry, V } from "../kit-ui";
import { ISSUE } from "./data";

const SRC = "src/features/agent";

// ---------------------------------------------------------------- fixtures

function ago(seconds: number): string {
  return new Date(Date.now() - seconds * 1000).toISOString().replace(/\.\d+Z$/, "Z");
}

const CODE = "4F7K-92";

const NONE: AgentConnection = { status: "none" };

/** Waiting for the bridge. In the static build the prototype answers by itself. */
const pairing = (agent: AgentKind, mode: "bridge" | "simulated"): AgentConnection => ({
  status: "pairing",
  agent,
  mode,
  pairCode: CODE,
  command: pairCommand(agent, CODE),
});

/** A real bridge that answered, with every skill installed. */
const CODEX_BRIDGE: AgentConnection = {
  status: "connected",
  agent: "codex",
  mode: "bridge",
  host: "laptop-2",
  repo: "workflow_management",
  version: "codex 0.46.0",
  workspace: "web/mock/workspace",
  skills: { installed: [...WF_SKILL_NAMES], missing: [] },
  since: ago(18 * 60),
  command: pairCommand("codex", CODE),
};

/** The prototype's Claude Code: no skills installed, so the install commands show. */
const CLAUDE_PROTOTYPE: AgentConnection = {
  ...simulatedConnection("claude"),
  since: ago(3 * 60),
  command: pairCommand("claude", CODE),
};

/** A bridge with some skills missing: the install commands name only what is left. */
const CODEX_PARTIAL: AgentConnection = {
  ...CODEX_BRIDGE,
  skills: { installed: WF_SKILL_NAMES.slice(0, 5), missing: WF_SKILL_NAMES.slice(5) },
};

const LOST: AgentConnection = {
  ...CODEX_BRIDGE,
  status: "lost",
  command: undefined,
  problem: "The bridge does not answer. Is it still running?",
};

const CODEX_PROTOTYPE: AgentConnection = { ...simulatedConnection("codex"), since: ago(40) };

const RUNS: CodexRun[] = [
  {
    id: "run-b1",
    issue: ISSUE.rich,
    kind: "next_step",
    status: "running",
    by: "codex",
    agent: "codex",
    source: "bridge",
    phases: [],
    lastLine: "Reading plan.md and picking the next ready task",
    started_at: ago(70),
  },
  {
    id: "run-b2",
    issue: ISSUE.plain,
    kind: "next_step",
    status: "done",
    by: "codex",
    agent: "codex",
    source: "bridge",
    phases: [],
    started_at: ago(26 * 60),
    finished_at: ago(20 * 60),
  },
  {
    id: "run-b3",
    issue: ISSUE.noPlan,
    kind: "next_step",
    status: "failed",
    by: "codex",
    agent: "codex",
    source: "bridge",
    phases: [],
    reason: "Codex exited with code 1.",
    started_at: ago(3 * 3600),
    finished_at: ago(3 * 3600 - 40),
  },
  {
    id: "run-s1",
    issue: ISSUE.fyi,
    kind: "next_step",
    status: "done",
    by: "codex",
    agent: "codex",
    source: "simulated",
    task: "T-2",
    task_title: "Build the SSE delta stream",
    phases: [],
    started_at: ago(26 * 3600),
    finished_at: ago(26 * 3600 - 30),
  },
];

const noop = () => undefined;

// ---------------------------------------------------------------- AgentStatus

/** The nav's grey, so the row reads as it does in the rail. */
function Rail({ children, width }: { children: React.ReactNode; width: number }) {
  return (
    <div className="rounded-md bg-subtle px-2 py-2" style={{ width }}>
      {children}
    </div>
  );
}

function AgentStatusBody() {
  const states: { label: string; connection: AgentConnection }[] = [
    { label: "none", connection: NONE },
    { label: "pairing", connection: pairing("codex", "bridge") },
    { label: "connected · Codex", connection: CODEX_BRIDGE },
    { label: "connected · Claude Code", connection: CLAUDE_PROTOTYPE },
    { label: "lost · a warning tone", connection: LOST },
  ];
  return (
    <>
      {states.map(({ label, connection }) => (
        <V key={label} label={`expanded · ${label}`} width={232}>
          <Rail width={232}>
            <AgentStatusRow connection={connection} onClick={noop} />
          </Rail>
        </V>
      ))}
      <V
        label="collapsed rail · none, pairing, connected, lost"
        note="Just the icon with the dot. Hover for the words."
        width={52}
      >
        <Rail width={52}>
          <div className="flex flex-col items-center gap-1">
            {states
              .filter((s) => s.label !== "connected · Claude Code")
              .map(({ label, connection }) => (
                <AgentStatusRow key={label} connection={connection} collapsed onClick={noop} />
              ))}
          </div>
        </Rail>
      </V>
    </>
  );
}

// ---------------------------------------------------------------- ConnectAgentPanel

/** One frame: the real flow, on a fixed connection, on one screen. */
function FlowFrame({ seed, start }: { seed: FlowSeed; start?: AgentStart }) {
  const flow = useConnectFlow({ start, onFinish: noop, seed });
  return (
    <div data-wf="ConnectAgentSurface" className="flex min-h-0 flex-1 flex-col bg-bg">
      <header className="flex h-11 shrink-0 items-center px-4 font-semibold text-fg text-md">
        Connect an agent
      </header>
      <ConnectAgentPanel flow={flow} autoFocus={false} />
    </div>
  );
}

function Screen({
  label,
  note,
  seed,
  start,
  height = 460,
}: {
  label: string;
  note?: string;
  seed: FlowSeed;
  start?: AgentStart;
  height?: number;
}) {
  return (
    <V label={label} note={note} width={520} height={height}>
      <FlowFrame seed={seed} start={start} />
    </V>
  );
}

function ConnectAgentBody() {
  // The run that Do next step asked for before it found no agent.
  const then = { issueId: ISSUE.rich, kind: "next_step" } as const;
  return (
    <>
      <Screen
        label="1 · Which agent? (keys 1 and 2)"
        seed={{ step: "which", agent: "codex", connection: NONE }}
        height={360}
      />
      <Screen
        label="2 · Run this in the repo · waiting, in the dev server"
        note="The small Simulate link connects without a bridge."
        seed={{ step: "run", agent: "codex", connection: pairing("codex", "bridge") }}
        height={380}
      />
      <Screen
        label="2 · Run this in the repo · waiting, in the prototype"
        note="The static build cannot reach 127.0.0.1: the bridge answers by itself after a moment."
        seed={{ step: "run", agent: "claude", connection: pairing("claude", "simulated") }}
        height={380}
      />
      <Screen
        label="2 · Run this in the repo · the bridge did not answer"
        seed={{
          step: "run",
          agent: "codex",
          connection: {
            ...pairing("codex", "bridge"),
            problem:
              "A bridge answered, but with another code. Stop it (Ctrl+C) and run the command again.",
          },
        }}
        height={380}
      />
      <Screen
        label="2 · Connected, every skill installed (Codex)"
        seed={{ step: "run", agent: "codex", connection: CODEX_BRIDGE }}
        height={470}
      />
      <Screen
        label="2 · Connected, skills not installed (Claude Code): the install commands to copy"
        seed={{ step: "run", agent: "claude", connection: CLAUDE_PROTOTYPE }}
        height={640}
      />
      <Screen
        label="3 · Done"
        seed={{ step: "done", agent: "codex", connection: CODEX_BRIDGE }}
        height={380}
      />
      <Screen
        label="3 · Done, opened by Do next step: the button starts the run"
        note="The shell store remembers the issue; Done (or Enter) starts the run at once and closes."
        seed={{ step: "done", agent: "codex", connection: CODEX_BRIDGE }}
        start={{ then }}
        height={380}
      />
    </>
  );
}

// ---------------------------------------------------------------- AgentPanel

/** The panel on the surface of a dialog. */
function PanelFrame({
  connection,
  runs,
  waitingFor,
}: {
  connection: AgentConnection;
  runs: readonly CodexRun[];
  waitingFor?: string;
}) {
  return (
    <div className="w-[460px] max-w-full rounded-lg border border-border bg-bg shadow-pop">
      <header className="px-4 pt-3.5 pb-2 font-semibold text-fg text-md">Agent</header>
      <div className="px-4 pb-4">
        <AgentPanelBody
          connection={connection}
          runs={runs}
          waitingFor={waitingFor}
          onConnect={noop}
          onSwitch={noop}
          onDisconnect={noop}
          onReconnect={noop}
          onCheck={noop}
          onOpenIssue={noop}
        />
      </div>
    </div>
  );
}

function AgentPanelEntryBody() {
  return (
    <>
      <V
        label="connected · Codex on a real bridge"
        note="Every skill installed; the runs are the bridge's."
      >
        <PanelFrame connection={CODEX_BRIDGE} runs={RUNS} />
      </V>
      <V
        label="connected · Claude Code in the prototype, skills not installed"
        note="The missing skills and the commands that install them."
      >
        <PanelFrame connection={CLAUDE_PROTOTYPE} runs={[]} />
      </V>
      <V label="connected · some skills missing">
        <PanelFrame connection={CODEX_PARTIAL} runs={RUNS.slice(0, 2)} />
      </V>
      <V
        label="lost · the bridge stopped answering"
        note="Check again asks the bridge now; Reconnect makes a new code. Opened by Do next step it says what waits."
      >
        <PanelFrame connection={LOST} runs={RUNS} waitingFor={ISSUE.rich} />
      </V>
      <V label="none">
        <PanelFrame connection={NONE} runs={[]} />
      </V>
      <V label="pairing">
        <PanelFrame connection={pairing("claude", "bridge")} runs={[]} />
      </V>
      <V label="connected · Codex in the prototype, no runs yet">
        <PanelFrame connection={CODEX_PROTOTYPE} runs={[]} />
      </V>
    </>
  );
}

// ---------------------------------------------------------------- entries

export const agentEntries: KitEntry[] = [
  entry(
    "Agent",
    "AgentStatus",
    `${SRC}/AgentStatus.tsx`,
    "One calm row in the nav says whether an agent is connected and opens the place to connect or manage it, so Do next step never has to explain itself.",
    AgentStatusBody,
  ),
  entry(
    "Agent",
    "ConnectAgentPanel",
    `${SRC}/ConnectAgentPanel.tsx`,
    "Connecting is three questions and one command: which agent, run this in the repo, done. The screen waits for the bridge and shows what it found, so nobody has to guess whether it worked.",
    ConnectAgentBody,
  ),
  entry(
    "Agent",
    "AgentPanel",
    `${SRC}/AgentPanel.tsx`,
    "Everything about the connected agent in one place: where it runs, whether the wf skills are installed, what it did lately, and the three things to do about it.",
    AgentPanelEntryBody,
  ),
];
