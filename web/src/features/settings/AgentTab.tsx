// Settings · Agent (spec 5.5): the agent that does the work, and whether it has the skills the flow
// names. The connection is the one the nav's agent row shows (plan D10, D11): this page reads it
// and opens the connect flow or the Agent panel (Switch agent, Disconnect) for the actions, and lists
// what the flow needs installed, with the commands.

import { Link } from "@tanstack/react-router";
import { Plug } from "lucide-react";
import { openAgent, openAgentPanel } from "@/app/shell-store";
import { CopyButton } from "@/components/common";
import { Button, Chip } from "@/components/ui";
import {
  agentName,
  flowSkillRefs,
  installFromCommand,
  installFromNote,
  parseSkillRef,
  type SkillShelf,
  shelfOf,
  useAgent,
  useFlow,
} from "@/lib/api";
import { SourceChip } from "./parts";

export function AgentTab() {
  const { flow, catalog } = useFlow();
  const connection = useAgent();
  const known = connection.status === "connected" || connection.status === "lost";
  const name = connection.agent ? agentName(connection.agent) : undefined;
  const refs = flowSkillRefs(flow, { builtin: false });
  const shelves = [
    ...new Map(
      refs.flatMap((ref) => {
        const p = parseSkillRef(ref);
        const shelf =
          p &&
          shelfOf(
            catalog,
            p.source === "workspace" ? "ws" : p.source === "me" ? "me" : (p.alias ?? ""),
          );
        return shelf ? [[shelf.key, shelf] as const] : [];
      }),
    ).values(),
  ];

  return (
    <div data-wf="AgentTab" className="min-h-0 flex-1 overflow-y-auto">
      <div className="flex max-w-[640px] flex-col gap-6 px-6 py-5 max-md:px-4">
        <header className="flex flex-col gap-1">
          <h1 className="font-semibold text-fg text-xl leading-snug tracking-tight">Agent</h1>
          <p className="text-fg-muted text-md">
            The agent that does the work for you, and the skills it needs to follow the flow.
          </p>
        </header>

        <section
          aria-labelledby="agent-connection"
          className="flex flex-col gap-3 rounded-lg border border-border px-4 py-3"
        >
          <div className="flex items-center gap-2">
            <h2 id="agent-connection" className="font-semibold text-fg text-sm">
              Connection
            </h2>
            <Chip
              tone={
                connection.status === "connected"
                  ? "success"
                  : connection.status === "lost"
                    ? "stale"
                    : undefined
              }
            >
              {connection.status === "connected"
                ? `${name} · connected`
                : connection.status === "lost"
                  ? `${name} · lost`
                  : connection.status === "pairing"
                    ? `${name ?? "Agent"} · pairing…`
                    : "Not connected"}
            </Chip>
          </div>
          {known && (
            <p className="text-fg-muted text-sm">
              {[connection.host, connection.repo, connection.version].filter(Boolean).join(" · ")}
            </p>
          )}
          <div>
            {known ? (
              <Button onClick={() => openAgentPanel()}>Open the Agent panel</Button>
            ) : (
              <Button onClick={() => openAgent()}>
                <Plug aria-hidden size={14} strokeWidth={1.75} />
                {connection.status === "pairing" ? "Finish connecting" : "Connect an agent"}
              </Button>
            )}
          </div>
          {!known && (
            <p className="text-fg-muted text-sm">
              Codex or Claude Code on your computer, through a small bridge you start in the repo.
              Do next step runs it.
            </p>
          )}
        </section>

        <section aria-labelledby="agent-skills" className="flex flex-col gap-3">
          <div className="flex flex-col gap-0.5">
            <h2 id="agent-skills" className="font-semibold text-fg text-sm">
              Skills the flow uses
            </h2>
            <p className="text-fg-muted text-sm">
              An agent can only run a skill that is installed. Once an agent is connected, this list
              shows the ones it lacks.
            </p>
          </div>
          {refs.length === 0 ? (
            <p className="text-fg-faint text-sm">
              The flow uses only built-in skills.{" "}
              <Link to="/skills" className="text-fg underline underline-offset-2">
                See how to install them
              </Link>
              .
            </p>
          ) : (
            <>
              <ul className="m-0 flex list-none flex-col divide-y divide-border rounded-lg border border-border p-0">
                {refs.map((ref) => {
                  const p = parseSkillRef(ref);
                  return (
                    <li key={ref} className="flex min-w-0 items-center gap-2 px-3 py-2">
                      <code className="min-w-0 flex-1 truncate font-mono text-fg text-sm">
                        {ref}
                      </code>
                      {p && <SourceChip source={p.source} alias={p.alias} catalog={catalog} />}
                    </li>
                  );
                })}
              </ul>
              {shelves.map((shelf) => (
                <InstallCommands key={shelf.key} shelf={shelf} />
              ))}
            </>
          )}
        </section>
      </div>
    </div>
  );
}

function InstallCommands({ shelf }: { shelf: SkillShelf }) {
  return (
    <div className="flex flex-col gap-2">
      <h3 className="font-medium text-fg-muted text-xs">Install {shelf.name}</h3>
      {installFromNote(shelf) && <p className="text-fg-faint text-xs">{installFromNote(shelf)}</p>}
      {(["codex", "claude"] as const).map((tool) => {
        const command = installFromCommand(shelf, tool);
        return (
          <div key={tool} className="flex min-w-0 flex-col gap-1">
            <span className="text-fg-faint text-xs">
              {tool === "codex" ? "Codex" : "Claude Code"}
            </span>
            <div className="flex min-h-8 items-start gap-1 rounded-md border border-border bg-subtle py-px pr-0.5 pl-2.5">
              <span aria-hidden className="select-none pt-[5px] font-mono text-fg-faint text-sm">
                $
              </span>
              <code className="min-w-0 flex-1 whitespace-pre-wrap break-words py-[5px] font-mono text-fg text-sm leading-[18px]">
                {command}
              </code>
              <CopyButton
                text={command}
                label={`Copy the ${tool === "codex" ? "Codex" : "Claude Code"} command`}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}
