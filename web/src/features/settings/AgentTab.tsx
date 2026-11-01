// Settings · Agent (spec 5.5): the agent that does the work, and whether it has the skills the flow
// names. The connection itself (agent, host, repo, version, Switch agent, Disconnect) arrives with
// round 2; until then this page offers the connect button the seam `setConnectAgentHandler`
// (library/team/connect-hook.ts) gives, says that the connection comes later, and already lists
// what the flow needs installed, with the commands.

import { Link } from "@tanstack/react-router";
import { Plug } from "lucide-react";
import { useState } from "react";
import { CopyButton } from "@/components/common";
import { Button, Chip } from "@/components/ui";
import { openConnectAgent } from "@/features/library/team/connect-hook";
import {
  flowSkillRefs,
  installFromCommand,
  parseSkillRef,
  type SkillShelf,
  shelfOf,
  useFlow,
} from "@/lib/api";
import { SourceChip } from "./parts";

export function AgentTab() {
  const { flow, catalog } = useFlow();
  // After a press with nothing to connect to, the line under the button says so more plainly.
  const [nothing, setNothing] = useState(false);
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
            <Chip>Not connected</Chip>
          </div>
          <div>
            <Button
              onClick={() => {
                if (!openConnectAgent()) setNothing(true);
              }}
            >
              <Plug aria-hidden size={14} strokeWidth={1.75} />
              Connect an agent
            </Button>
          </div>
          <p role={nothing ? "status" : undefined} className="text-fg-muted text-sm">
            {nothing
              ? "There is nothing to connect yet. The agent connection arrives with round 2."
              : "The agent connection arrives with round 2. Until then the dashboard writes the files itself, and a person runs the skills in Codex or Claude Code."}
          </p>
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
