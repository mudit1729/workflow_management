// The Agent panel (plan D11): what is connected, where it runs, whether the wf skills are there,
// the recent runs, and the three things to do about it: Switch, Disconnect, Reconnect. A dialog,
// so it opens from anywhere (the nav row, the palette, a Do next step on a lost agent) and on a
// phone. `AgentPanelBody` is the inside, shared with the gallery.
import { Check, TriangleAlert } from "lucide-react";
import { type ReactNode, useCallback } from "react";
import { useShell } from "@/app/shell-store";
import { RelativeTime } from "@/components/common";
import { Button, Chip, Dialog, DialogContent, DialogFooter } from "@/components/ui";
import { isBridgeRun, RunGlyph, runDetail, runLine, useResumeNextStep } from "@/features/codex";
import {
  type AgentConnection,
  type AgentKind,
  agentName,
  type CodexRun,
  useAgent,
  useAgentControls,
  useCodexRuns,
} from "@/lib/api";
import { useOpenIssue } from "@/lib/nav";
import { connectionAgent, modeLabel, otherAgent, skillsLine } from "./agent-copy";
import { InstallSkills } from "./ConnectScreens";
import { AgentTile, Facts, StatusDot } from "./parts";

const ICON = { size: 14, strokeWidth: 1.75 } as const;

/** Runs the panel lists; the issue's own popover has the full history. */
const SHOWN = 5;

export interface AgentPanelBodyProps {
  connection: AgentConnection;
  /** Runs of every issue, newest first. */
  runs: readonly CodexRun[];
  /** The issue whose next step waits for the agent: Do next step opened the panel. */
  waitingFor?: string;
  onConnect: () => void;
  onSwitch: (agent: AgentKind) => void;
  onDisconnect: () => void;
  /** Connect the same agent again, with a new code. */
  onReconnect: () => void;
  /** Ask the bridge now; a lost connection comes back when it answers. */
  onCheck: () => void;
  onOpenIssue: (id: string) => void;
}

export function AgentPanelBody({
  connection: c,
  runs,
  waitingFor,
  onConnect,
  onSwitch,
  onDisconnect,
  onReconnect,
  onCheck,
  onOpenIssue,
}: AgentPanelBodyProps) {
  const agent = connectionAgent(c);
  const name = agentName(agent);
  const known = c.status === "connected" || c.status === "lost";

  return (
    <div data-wf="AgentPanel" data-status={c.status} className="flex flex-col gap-4">
      <header className="flex items-center gap-3">
        {c.agent ? (
          <AgentTile kind={c.agent} px={28} />
        ) : (
          <span
            aria-hidden
            className="grid size-7 shrink-0 place-items-center rounded-md border border-border border-dashed"
          >
            <StatusDot status="none" />
          </span>
        )}
        <div className="flex min-w-0 flex-1 flex-col">
          <span className="truncate font-semibold text-md text-fg">
            {c.agent ? name : "No agent connected"}
          </span>
          {!known && (
            <span className="truncate text-fg-muted text-sm">
              {c.status === "pairing" ? "Waiting for the bridge" : "Codex or Claude Code"}
            </span>
          )}
        </div>
        <StatusChip status={c.status} />
      </header>

      {waitingFor && (
        <p
          data-wf="AgentWaiting"
          className="rounded-md bg-accent-subtle px-2.5 py-1.5 text-base text-fg leading-snug"
        >
          {c.status === "lost"
            ? `Reconnect, then Do next step starts on ${waitingFor}.`
            : `Connect an agent, then Do next step starts on ${waitingFor}.`}
        </p>
      )}

      {c.status === "lost" && (
        <div
          role="status"
          className="flex items-start gap-2 rounded-md bg-stale/12 py-1.5 pr-1.5 pl-2.5 text-base"
        >
          <TriangleAlert {...ICON} aria-hidden className="mt-px shrink-0 text-stale-text" />
          <span className="min-w-0 flex-1 text-fg leading-snug">
            {c.problem ?? `${name} stopped answering.`}
          </span>
          <Button variant="ghost" size="sm" onClick={onCheck} className="-my-0.5 shrink-0">
            Check again
          </Button>
        </div>
      )}

      {c.status === "none" && (
        <p className="text-base text-fg-muted leading-snug">
          Do next step runs on an agent you connect: a small bridge on your computer starts it in
          this repo. Connecting takes a minute.
        </p>
      )}

      {c.status === "pairing" && (
        <p className="text-base text-fg-muted leading-snug">
          {c.problem ??
            "Run the command in the repo and this panel fills in when the bridge answers."}
        </p>
      )}

      {known && (
        <>
          <Facts
            rows={[
              ["Mode", <Mode key="mode" connection={c} />],
              ["Host", c.host ?? "this computer"],
              ["Repo", c.repo ?? "-"],
              ["Workspace", c.workspace ?? "-"],
              ["Version", c.version ?? "-"],
              [
                c.status === "lost" ? "Last seen" : "Connected",
                c.since ? <RelativeTime key="since" ts={c.since} long /> : "-",
              ],
            ]}
          />
          <Skills connection={c} agent={agent} />
          <Runs runs={runs} host={c.host} onOpenIssue={onOpenIssue} />
        </>
      )}

      <DialogFooter className="mt-0 flex-wrap">
        {known && (
          <Button variant="ghost" onClick={onDisconnect} className="mr-auto">
            Disconnect
          </Button>
        )}
        {c.status === "none" && (
          <Button variant="primary" onClick={onConnect}>
            Connect an agent
          </Button>
        )}
        {c.status === "pairing" && (
          <>
            <Button variant="ghost" onClick={onDisconnect} className="mr-auto">
              Cancel
            </Button>
            <Button variant="primary" onClick={onConnect}>
              Continue connecting
            </Button>
          </>
        )}
        {known && (
          <Button variant="secondary" onClick={() => onSwitch(otherAgent(agent))}>
            Switch to {agentName(otherAgent(agent))}
          </Button>
        )}
        {c.status === "lost" && (
          <Button variant="primary" onClick={onReconnect}>
            Reconnect
          </Button>
        )}
      </DialogFooter>
    </div>
  );
}

function StatusChip({ status }: { status: AgentConnection["status"] }) {
  const tone = status === "connected" ? "success" : status === "lost" ? "stale" : "neutral";
  const label =
    status === "connected"
      ? "Connected"
      : status === "lost"
        ? "Lost"
        : status === "pairing"
          ? "Pairing"
          : "Not connected";
  return (
    <Chip tone={tone} icon={<StatusDot status={status} />}>
      {label}
    </Chip>
  );
}

function Mode({ connection }: { connection: AgentConnection }) {
  return (
    <span className="flex min-w-0 items-baseline gap-1.5">
      {modeLabel(connection)}
      <span className="truncate text-fg-faint text-sm">
        {connection.mode === "simulated" ? "simulated" : "127.0.0.1:7457"}
      </span>
    </span>
  );
}

function Section({
  title,
  aside,
  children,
}: {
  title: string;
  aside?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="flex flex-col gap-2">
      <h3 className="flex items-baseline gap-2 font-semibold text-base text-fg">
        {title}
        {aside && <span className="font-normal text-fg-faint text-sm tabular">{aside}</span>}
      </h3>
      {children}
    </section>
  );
}

/** Skills installed, the names of the ones that are missing, and the commands that fix it. */
function Skills({ connection: c, agent }: { connection: AgentConnection; agent: AgentKind }) {
  if (!c.skills) return null;
  const line = skillsLine(c.skills, agent);
  const total = c.skills.installed.length + c.skills.missing.length;
  return (
    <Section
      title="Skills"
      aside={line.ok ? undefined : `${c.skills.installed.length} of ${total} installed`}
    >
      <p className="flex items-start gap-1.5 text-base text-fg">
        {line.ok ? (
          <Check {...ICON} aria-hidden className="mt-px shrink-0 text-status-done" />
        ) : (
          <TriangleAlert {...ICON} aria-hidden className="mt-px shrink-0 text-stale-text" />
        )}
        {line.text}
      </p>
      {!line.ok && (
        <>
          <p className="text-fg-muted text-sm leading-snug">
            Missing: <span className="font-mono text-xs">{c.skills.missing.join(", ")}</span>
          </p>
          <InstallSkills agent={agent} />
        </>
      )}
    </Section>
  );
}

function Runs({
  runs,
  host,
  onOpenIssue,
}: {
  runs: readonly CodexRun[];
  host?: string;
  onOpenIssue: (id: string) => void;
}) {
  return (
    <Section title="Recent runs" aside={runs.length > 0 ? String(runs.length) : undefined}>
      {runs.length === 0 ? (
        <p className="text-fg-faint text-sm">No runs yet. Do next step starts the first.</p>
      ) : (
        <ul className="-mx-1 flex flex-col">
          {runs.slice(0, SHOWN).map((run) => (
            <li key={run.id}>
              <button
                type="button"
                data-wf="AgentRun"
                data-status={run.status}
                onClick={() => onOpenIssue(run.issue)}
                className="flex w-full cursor-default items-start gap-2 rounded-sm px-1 py-1.5 text-left transition-colors duration-100 ease-wf hover:bg-subtle"
              >
                <span className="mt-0.5 flex size-3.5 shrink-0 items-center justify-center">
                  <RunGlyph run={run} />
                </span>
                <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <span className="truncate font-medium text-base text-fg">
                    {runLine(run, isBridgeRun(run) ? host : undefined)}
                  </span>
                  <span className="flex min-w-0 items-baseline gap-1.5 text-fg-muted text-sm">
                    <span className="shrink-0 font-mono text-fg-faint text-xs">{run.issue}</span>
                    {runDetail(run) && <span className="truncate">{runDetail(run)}</span>}
                  </span>
                </span>
                <RelativeTime
                  ts={run.finished_at ?? run.started_at}
                  className="shrink-0 text-fg-faint text-xs"
                />
              </button>
            </li>
          ))}
        </ul>
      )}
    </Section>
  );
}

// ---------------------------------------------------------------- the dialog

export function AgentPanel() {
  const open = useShell((s) => s.agentPanelOpen);
  const setOpen = useShell((s) => s.setAgentPanelOpen);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent
        title="Agent"
        size="md"
        className="max-w-[460px]"
        // A status panel, not a form: focus the panel itself, so no Copy button shows a ring unasked.
        onOpenAutoFocus={(e) => {
          e.preventDefault();
          (e.currentTarget as HTMLElement).focus({ preventScroll: true });
        }}
      >
        <AgentPanelContent />
      </DialogContent>
    </Dialog>
  );
}

/** The panel's inside, tied to the connection. Mounted only while the dialog is open. */
function AgentPanelContent() {
  const then = useShell((s) => s.agentStart?.then);
  const setOpen = useShell((s) => s.setAgentPanelOpen);
  const openFlow = useShell((s) => s.setAgentOpen);
  const connection = useAgent();
  const controls = useAgentControls();
  const runs = useCodexRuns();
  const openIssue = useOpenIssue();
  const resume = useResumeNextStep();

  const onCheck = useCallback(async () => {
    const now = await controls.recheck();
    // The agent answers again: the step that was waiting for it starts, and the panel has done its job.
    if (now.status !== "connected" || !then) return;
    setOpen(false);
    resume(then);
  }, [controls, then, setOpen, resume]);

  return (
    <AgentPanelBody
      connection={connection}
      runs={runs}
      waitingFor={then?.issueId}
      onConnect={() => openFlow(true, { then })}
      onSwitch={(agent) => openFlow(true, { agent, then })}
      onDisconnect={controls.disconnect}
      onReconnect={() => openFlow(true, { agent: connectionAgent(connection), then })}
      onCheck={() => void onCheck()}
      onOpenIssue={(id) => {
        setOpen(false);
        void openIssue(id);
      }}
    />
  );
}
