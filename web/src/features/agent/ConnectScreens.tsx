// The three screens of the connect flow (plan D10), each one question: Which agent?, Run this in
// the repo, and Done. They share the frame, the answer buttons and the key hints of Add work.
import { Check, Info, TriangleAlert } from "lucide-react";
import { type ReactNode, useId, useState } from "react";
import { Button } from "@/components/ui";
import { ChoiceList, KeyHint } from "@/features/add-work/parts";
import { AGENT_KINDS, type AgentKind, agentName, pairCommand, useSkills } from "@/lib/api";
import { cn } from "@/lib/cn";
import {
  ALLOW_DOC,
  allowLine,
  installCommands,
  installWhere,
  skillsLine,
  withAllowList,
} from "./agent-copy";
import { doneCopy, pairCodeOf, STEP_LABEL } from "./connect-flow";
import { AgentTile, CommandBox, Facts, StatusDot } from "./parts";
import type { ConnectFlow } from "./useConnectFlow";

const ICON = { size: 14, strokeWidth: 1.75 } as const;

/** The frame of the screen on show, with its place in the progress. Same look as Add work. */
function Screen({
  flow,
  title,
  hint,
  children,
}: {
  flow: ConnectFlow;
  title: ReactNode;
  hint?: ReactNode;
  children: ReactNode;
}) {
  const id = useId();
  return (
    <section
      data-wf="ConnectAgentStep"
      data-step={flow.step}
      aria-labelledby={id}
      // Keyed by the step, so each screen eases in. No motion for a reduced-motion user.
      className="fade-in-0 slide-in-from-right-2 flex min-w-0 animate-in flex-col duration-150 motion-reduce:animate-none"
    >
      <p className="text-fg-faint text-xs tabular">
        {flow.index + 1} of {flow.steps.length}
        <span className="sr-only"> · {STEP_LABEL[flow.step]}</span>
      </p>
      <h2 id={id} className="mt-1 font-semibold text-fg text-xl leading-snug tracking-tight">
        {title}
      </h2>
      {hint && <p className="mt-1.5 max-w-[56ch] text-fg-muted text-md">{hint}</p>}
      <div className="mt-5 flex min-w-0 flex-col gap-3">{children}</div>
    </section>
  );
}

export function ConnectScreen({ flow }: { flow: ConnectFlow }) {
  if (flow.step === "which") return <WhichStep flow={flow} />;
  if (flow.step === "run") return <RunStep flow={flow} />;
  return <DoneStep flow={flow} />;
}

// ---------------------------------------------------------------- Which agent?

const MAKER: Record<AgentKind, string> = { codex: "OpenAI", claude: "Anthropic" };

function WhichStep({ flow }: { flow: ConnectFlow }) {
  const title = "Which agent?";
  return (
    <Screen flow={flow} title={title} hint="Pick the one you work with. You can switch later.">
      <ChoiceList<AgentKind>
        label={title}
        value={flow.agent}
        onPick={flow.pick}
        onGo={flow.advance}
        options={AGENT_KINDS.map((kind) => ({
          value: kind,
          label: agentName(kind),
          hint: `${MAKER[kind]} · runs in your terminal`,
          lead: <AgentTile kind={kind} px={20} />,
        }))}
      />
      <KeyHint>Press 1 or 2 to pick, Enter to continue.</KeyHint>
    </Screen>
  );
}

// ---------------------------------------------------------------- Run this in the repo

function RunStep({ flow }: { flow: ConnectFlow }) {
  const { connection: c, agent } = flow;
  const connected = c.status === "connected" && c.agent === agent;

  // The connection forgets the command once it is connected; the screen keeps it, for the code.
  const [kept, setKept] = useState(c.command);
  if (c.command && c.command !== kept) setKept(c.command);
  const command = c.command ?? kept ?? (connected ? undefined : pairCommand(agent, "…"));
  // Once a real bridge has answered the code is spent: one quiet line, and no Copy for a dead
  // command. The prototype never ran the command, so it has no code to name.
  const code = connected && c.mode === "bridge" ? pairCodeOf(command) : undefined;
  // Claude Code only: the command with its allowlist (a headless run skips scripts and commits).
  const [allow, setAllow] = useState(false);

  return (
    <Screen
      flow={flow}
      title="Run this in the repo"
      hint={
        connected
          ? c.mode === "bridge"
            ? "Leave the bridge running in its terminal."
            : "Prototype: there is no bridge to run."
          : flow.stopBridge
            ? `${flow.stopBridge} Then paste this at the repo root and leave it running.`
            : flow.stopped
              ? `${flow.stopped} Paste this at the repo root to start the new one, and leave it running.`
              : "Open a terminal at the repo root, paste it and leave it running."
      }
    >
      {command && !connected && (
        <>
          <CommandBox command={allow ? withAllowList(command) : command} autoFocus />
          <p className="-mt-1 text-fg-faint text-xs">
            Needs Node 18 or newer. The code works once.
          </p>
          {agent === "claude" && <AllowLine allowed={allow} onToggle={() => setAllow(!allow)} />}
        </>
      )}
      {code && (
        <p data-wf="PairedCode" className="text-fg-faint text-xs">
          Paired with code <span className="font-mono">{code}</span>
        </p>
      )}
      <div role="status" aria-live="polite" data-wf="ConnectStatus">
        {connected ? <Connected flow={flow} /> : <Waiting flow={flow} />}
      </div>
    </Screen>
  );
}

/** One line about what a headless Claude Code may run, with the one button that allows more. */
function AllowLine({ allowed, onToggle }: { allowed: boolean; onToggle: () => void }) {
  const line = allowLine(allowed);
  return (
    <div data-wf="AllowLine" className="-mt-1 flex items-start gap-2">
      <p className="min-w-0 flex-1 text-fg-faint text-xs leading-snug">
        {line.text}
        <span className="block">
          What it can do: <span className="font-mono">{ALLOW_DOC}</span>
        </span>
      </p>
      <Button
        variant="ghost"
        size="sm"
        onClick={onToggle}
        aria-pressed={allowed}
        className="-my-0.5 shrink-0"
      >
        {line.button}
      </Button>
    </div>
  );
}

/**
 * "Waiting for the bridge…", what the person can do while it waits (stop an old bridge), or why it
 * stopped. The prototype says it answers by itself.
 */
function Waiting({ flow }: { flow: ConnectFlow }) {
  const { connection: c } = flow;
  if (c.problem)
    return (
      <div className="flex items-start gap-2 rounded-md bg-stale/12 py-1.5 pr-1.5 pl-2.5 text-base">
        <TriangleAlert {...ICON} aria-hidden className="mt-px shrink-0 text-stale-text" />
        <span className="min-w-0 flex-1 text-fg leading-snug">{c.problem}</span>
        <Button variant="ghost" size="sm" onClick={flow.retry} className="-my-0.5 shrink-0">
          Try again
        </Button>
      </div>
    );
  return (
    <div className="flex flex-col gap-1">
      <p className="flex items-center gap-2 text-base text-fg-muted">
        <StatusDot status="pairing" />
        Waiting for the bridge…
        {c.mode === "bridge" && (
          <button
            type="button"
            onClick={flow.simulate}
            title="Connect without a bridge: the prototype answers by itself"
            className="ml-auto rounded-sm text-fg-faint text-xs underline-offset-2 hover:text-fg-muted hover:underline"
          >
            Simulate
          </button>
        )}
      </p>
      {/* Not an error: an old bridge holds the port, and the pairing goes on once it is stopped. */}
      {c.note && (
        <p data-wf="PairNote" className="pl-[14px] text-fg-muted text-sm leading-snug">
          {c.note}
        </p>
      )}
      {c.mode === "simulated" && (
        <p className="pl-[14px] text-fg-faint text-xs">Prototype: the bridge answers by itself.</p>
      )}
    </div>
  );
}

/** "Connected", with where the agent runs and the skills check. */
function Connected({ flow }: { flow: ConnectFlow }) {
  const { connection: c, agent } = flow;
  const skills = skillsLine(c.skills, agent);
  return (
    <div
      data-wf="ConnectedFacts"
      className="flex flex-col gap-3 rounded-md border border-border bg-bg px-3 py-2.5"
    >
      <p className="flex items-center gap-2 font-medium text-base text-fg">
        <StatusDot status="connected" />
        Connected
      </p>
      <Facts
        rows={[
          ["Host", c.host ?? "this computer"],
          ["Repo", c.repo ?? "-"],
          ["Version", c.version ?? agentName(agent)],
          [
            "Skills",
            <span key="skills" className="flex min-w-0 items-center gap-1.5">
              {skills.ok ? (
                <Check {...ICON} aria-hidden className="shrink-0 text-status-done" />
              ) : (
                <TriangleAlert {...ICON} aria-hidden className="shrink-0 text-stale-text" />
              )}
              <span className="truncate">{skills.value}</span>
            </span>,
          ],
        ]}
      />
      {!skills.ok && <InstallSkills agent={agent} />}
    </div>
  );
}

/** The commands that install the skills for the agent, each with its own Copy. */
export function InstallSkills({ agent, className }: { agent: AgentKind; className?: string }) {
  const catalog = useSkills().data;
  const commands = installCommands(agent, catalog);
  return (
    <div data-wf="InstallSkills" className={cn("flex flex-col gap-2", className)}>
      <p className="text-fg-faint text-xs">{installWhere(agent)}.</p>
      {commands.map((command) => (
        <div key={command.command} className="flex min-w-0 flex-col gap-1">
          <span className="text-fg-muted text-xs">{command.label}</span>
          <CommandBox command={command.command} />
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------- Done

function DoneStep({ flow }: { flow: ConnectFlow }) {
  const { connection: c, agent, then } = flow;
  const copy = doneCopy(c, then?.issueId);
  const skills = skillsLine(c.skills, agent);
  return (
    <Screen flow={flow} title={copy.title} hint={copy.text}>
      <div
        data-wf="ConnectedSummary"
        className="flex min-w-0 items-center gap-3 rounded-md border border-border bg-subtle px-3 py-2.5"
      >
        <AgentTile kind={agent} px={24} />
        <div className="flex min-w-0 flex-1 flex-col">
          <span className="truncate font-medium text-base text-fg">{agentName(agent)}</span>
          <span className="truncate text-fg-muted text-sm">
            {c.host ?? "this computer"} · {c.repo ?? "workflow_management"}
            {c.version ? ` · ${c.version}` : ""}
          </span>
        </div>
        <StatusDot status="connected" />
      </div>
      {!skills.ok && (
        <p className="flex items-start gap-2 text-fg-muted text-sm">
          <Info {...ICON} aria-hidden className="mt-px shrink-0 text-fg-faint" />
          {skills.text}. The Agent panel has the commands.
        </p>
      )}
      <KeyHint>Press Enter to {then ? "do the next step" : "close"}.</KeyHint>
    </Screen>
  );
}
