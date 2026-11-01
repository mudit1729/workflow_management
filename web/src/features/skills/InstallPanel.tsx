// How a team gets the skills: the commands for Claude Code (add the marketplace, install the
// plugin; once for you, once for everyone on the repository) and for Codex (copy the skills into
// .agents/skills, tell Codex to use them), each with a copy button. The plugin and marketplace
// names come from the repository's own files (marketplace.json, plugin.json), so they never go
// stale; the repository is the team's (`SKILLS_REPO`). The skills of this workspace, of a team
// library and of mine are not in the plugin: each folder has its own command, `install-skills.sh
// --from <folder>`, which puts them beside the built-in ones.
import { FileText } from "lucide-react";
import type { ReactNode } from "react";
import { CopyButton } from "@/components/common";
import { Skeleton } from "@/components/ui";
import {
  claudeInstallGroups,
  codexInstallCommands,
  type InstallCommand,
  type InstallGroup,
  installFromCommand,
  SKILLS_REPO,
  type SkillsCatalog,
} from "@/lib/api";

export interface InstallPanelProps {
  catalog: SkillsCatalog | undefined;
  /** The catalog is still being read: hold the room of the Claude Code commands, so the panel does not jump. */
  loading?: boolean;
}

export function InstallPanel({ catalog, loading = false }: InstallPanelProps) {
  const claude = claudeInstallGroups(catalog);
  const codex = codexInstallCommands();
  // The places that hold skills of their own, and only the ones that do.
  const own = catalog?.shelves.filter((s) => s.skills.length > 0) ?? [];

  return (
    <section
      data-wf="InstallPanel"
      aria-labelledby="skills-install"
      className="rounded-lg border border-border bg-bg"
    >
      <header className="flex flex-col gap-0.5 px-4 pt-3 pb-1">
        <h2 id="skills-install" className="font-semibold text-base text-fg">
          Install for your team
        </h2>
        <p className="text-fg-muted text-sm">
          The team&apos;s repository is{" "}
          <code className="code-inline rounded-sm bg-muted px-1 py-px text-fg">{SKILLS_REPO}</code>.
          Install for yourself, or once for everyone who opens it.
        </p>
      </header>
      <div className="flex flex-col gap-4 px-4 pt-2 pb-3">
        {claude.length > 0 ? (
          <Tool title="Claude Code">
            {claude.map((group) => (
              <CommandGroup key={group.title} group={group} />
            ))}
          </Tool>
        ) : (
          loading && <CommandsSkeleton />
        )}
        <Tool title="Codex">
          <CommandGroup
            group={{
              title: "In a clone of this repository",
              hint: "Commit .agents/skills and AGENTS.md and everyone has them",
              commands: codex,
            }}
          />
        </Tool>
        {own.length > 0 && (
          <Tool title="Your own skills">
            {own.map((shelf) => (
              <CommandGroup
                key={shelf.key}
                group={{
                  title: shelf.name,
                  hint:
                    shelf.source === "me"
                      ? "Only for you, beside the built-in skills"
                      : "Run it where the agent runs, beside the built-in skills",
                  commands: [
                    { label: "Install for Codex", command: installFromCommand(shelf, "codex") },
                    {
                      label: "Install for Claude Code",
                      command: installFromCommand(shelf, "claude"),
                    },
                  ],
                }}
              />
            ))}
          </Tool>
        )}
      </div>
      <p className="flex items-center gap-2 border-border border-t px-4 py-2 text-fg-muted text-sm">
        <FileText aria-hidden size={14} strokeWidth={1.75} className="shrink-0 text-fg-faint" />
        <span className="min-w-0">
          The skills and this board read and write the same markdown files.
        </span>
      </p>
    </section>
  );
}

function CommandsSkeleton() {
  return (
    <div
      role="status"
      aria-busy="true"
      aria-label="Loading the install commands"
      className="flex flex-col gap-2"
    >
      <Skeleton className="h-3 w-40" />
      {[0, 1].map((i) => (
        <div key={i} className="flex flex-col gap-1">
          <Skeleton className="h-3 w-24" />
          <Skeleton className="h-8 w-full" />
        </div>
      ))}
    </div>
  );
}

/** One tool (Claude Code, Codex) and the groups of commands for it. */
function Tool({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div data-wf="InstallTool" className="flex flex-col gap-3">
      <h3 className="font-semibold text-fg text-sm">{title}</h3>
      <div className="flex flex-col gap-3 border-border border-l pl-3">{children}</div>
    </div>
  );
}

function CommandGroup({ group }: { group: InstallGroup }) {
  const { title, hint, commands } = group;
  return (
    <div data-wf="InstallCommands" className="flex flex-col gap-2">
      <h4 className="flex flex-wrap items-baseline gap-x-2 font-medium text-fg-muted text-xs">
        {title}
        <span className="font-normal text-fg-faint">{hint}</span>
      </h4>
      <ol className="m-0 flex list-none flex-col gap-2 p-0">
        {commands.map((c: InstallCommand, i) => (
          <li key={c.command} className="flex min-w-0 flex-col gap-1">
            <span className="text-fg-faint text-xs">
              {commands.length > 1 && <span className="tabular">{i + 1}. </span>}
              {c.label}
            </span>
            <Command command={c.command} label={c.label} />
          </li>
        ))}
      </ol>
    </div>
  );
}

function Command({ command, label }: { command: string; label: string }) {
  return (
    <div className="flex min-h-8 items-start gap-1 rounded-md border border-border bg-subtle py-px pr-0.5 pl-2.5">
      <span aria-hidden className="select-none pt-[5px] font-mono text-fg-faint text-sm">
        $
      </span>
      <code className="min-w-0 flex-1 whitespace-pre-wrap break-words py-[5px] font-mono text-fg text-sm leading-[18px]">
        {command}
      </code>
      <CopyButton text={command} label={`Copy: ${label}`} />
    </div>
  );
}
