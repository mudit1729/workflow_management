// How a team gets the skills: the commands for Claude Code (add the marketplace, install the
// plugin) and for Codex (copy the skills into .agents/skills), each with a copy button. The
// commands come from the repository's own files (marketplace.json, plugin.json), so they never
// go stale.
import { FileText } from "lucide-react";
import { CopyButton } from "@/components/common";
import { Skeleton } from "@/components/ui";
import {
  claudeInstallCommands,
  codexInstallCommands,
  type InstallCommand,
  type SkillsCatalog,
} from "@/lib/api";

export interface InstallPanelProps {
  catalog: SkillsCatalog | undefined;
  /** The catalog is still being read: hold the room of the Claude Code commands, so the panel does not jump. */
  loading?: boolean;
}

export function InstallPanel({ catalog, loading = false }: InstallPanelProps) {
  const claude = claudeInstallCommands(catalog);
  const codex = codexInstallCommands();

  return (
    <section
      data-wf="InstallPanel"
      aria-labelledby="skills-install"
      className="rounded-lg border border-border bg-bg"
    >
      <header className="px-4 pt-3 pb-1">
        <h2 id="skills-install" className="font-semibold text-base text-fg">
          Install for your team
        </h2>
      </header>
      <div className="flex flex-col gap-4 px-4 pt-2 pb-3">
        {claude.length > 0 ? (
          <CommandGroup title="Claude Code" hint="Run in a session" commands={claude} />
        ) : (
          loading && <CommandsSkeleton />
        )}
        <CommandGroup title="Codex" hint="In a clone of this repository" commands={codex} />
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

function CommandGroup({
  title,
  hint,
  commands,
}: {
  title: string;
  hint: string;
  commands: InstallCommand[];
}) {
  return (
    <div data-wf="InstallCommands" className="flex flex-col gap-2">
      <h3 className="flex items-baseline gap-2 font-medium text-fg-muted text-xs">
        {title}
        <span className="font-normal text-fg-faint">{hint}</span>
      </h3>
      <ol className="m-0 flex list-none flex-col gap-2 p-0">
        {commands.map((c, i) => (
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
