// Settings · Workspace (spec 5.6): the workspace's name and id prefix (read-only, they live in
// workflow.toml), how long a claimed task is held, and the lint rules that are turned off.
// Context and staleness are under the Hand off and Status steps, not repeated here.
import { Link } from "@tanstack/react-router";
import { useState } from "react";
import { parse } from "smol-toml";
import { Button, Segmented, Skeleton } from "@/components/ui";
import { FilesLink } from "@/features/files";
import { useSnapshot, useWorkspaceFile, useWriteWorkspaceFile } from "@/lib/api";
import { SavedLine } from "./SavedLine";
import { showUndoable } from "./saved";
import { settingsFlowHref } from "./search";
import { setLeaseMinutes } from "./workspace-write";

const LEASES = [30, 60, 120] as const;

/** The codes `[lint] disable` names in workflow.toml, or none when the file cannot be read. */
export function disabledRules(text: string | null | undefined): string[] {
  if (!text) return [];
  try {
    const lint = (parse(text) as { lint?: { disable?: unknown } }).lint;
    return Array.isArray(lint?.disable)
      ? lint.disable.filter((c): c is string => typeof c === "string")
      : [];
  } catch {
    return [];
  }
}

export function WorkspaceTab() {
  const config = useSnapshot().data?.config;
  const file = useWorkspaceFile("workflow.toml").data;
  const write = useWriteWorkspaceFile();
  const [busy, setBusy] = useState(false);
  const rules = disabledRules(file?.text);

  const setLease = async (minutes: number) => {
    if (busy || minutes === config?.leases_minutes) return;
    setBusy(true);
    try {
      const saved = await setLeaseMinutes(minutes, write);
      if (saved) showUndoable(`Saved to ${saved.file}`, undefined, saved.undo, "workspace");
    } finally {
      setBusy(false);
    }
  };

  const leases: number[] = [...LEASES];
  if (config && !leases.includes(config.leases_minutes)) leases.push(config.leases_minutes);

  return (
    <div data-wf="WorkspaceTab" className="min-h-0 flex-1 overflow-y-auto">
      <div className="flex max-w-[640px] flex-col gap-6 px-6 py-5 max-md:px-4">
        <header className="flex flex-col gap-1">
          <h1 className="font-semibold text-fg text-xl leading-snug tracking-tight">Workspace</h1>
          <p className="text-fg-muted text-md">
            Settings of this workspace. They live in workflow.toml, so they are shared through git.
          </p>
        </header>

        <section
          aria-labelledby="ws-name"
          className="flex flex-col gap-3 rounded-lg border border-border px-4 py-3"
        >
          <h2 id="ws-name" className="font-semibold text-fg text-sm">
            Name
          </h2>
          {config ? (
            <dl className="m-0 grid grid-cols-[auto_1fr] gap-x-6 gap-y-1.5 text-base">
              <dt className="text-fg-muted">Workspace</dt>
              <dd className="m-0 text-fg">{config.name}</dd>
              <dt className="text-fg-muted">Id prefix</dt>
              <dd className="m-0 font-mono text-fg text-sm">{config.id_prefix}</dd>
            </dl>
          ) : (
            <Skeleton className="h-10 w-48" />
          )}
          <div>
            <Button asChild size="sm">
              <FilesLink path="workflow.toml">Open workflow.toml in Files</FilesLink>
            </Button>
          </div>
        </section>

        <section aria-labelledby="ws-leases" className="flex flex-col gap-2">
          <div className="flex flex-col gap-0.5">
            <h2 id="ws-leases" className="font-semibold text-fg text-sm">
              Leases
            </h2>
            <p className="text-fg-muted text-sm">
              How long a task stays claimed by an agent before another may take it over.
            </p>
          </div>
          <Segmented
            className="self-start"
            aria-label="Lease length in minutes"
            value={String(config?.leases_minutes ?? 60)}
            disabled={busy || !config}
            options={leases.map((m) => ({ value: String(m), label: `${m} minutes` }))}
            onChange={(v) => void setLease(Number(v))}
          />
          <SavedLine step={undefined} page="workspace" />
        </section>

        <section aria-labelledby="ws-lint" className="flex flex-col gap-2">
          <div className="flex flex-col gap-0.5">
            <h2 id="ws-lint" className="font-semibold text-fg text-sm">
              Lint rules turned off
            </h2>
            <p className="text-fg-muted text-sm">
              Listed in the [lint] table of workflow.toml. Change them in Files.
            </p>
          </div>
          {rules.length > 0 ? (
            <ul className="m-0 flex list-none flex-wrap gap-1.5 p-0">
              {rules.map((code) => (
                <li
                  key={code}
                  className="rounded-sm bg-muted px-1.5 py-0.5 font-mono text-fg text-sm"
                >
                  {code}
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-fg-faint text-sm">None. Every rule runs.</p>
          )}
        </section>

        <p className="text-fg-faint text-sm">
          The bundle size and when work counts as stale are under the{" "}
          <Link
            to="/settings/flow"
            search={{ step: "handoff" }}
            className="text-fg underline underline-offset-2"
            href={settingsFlowHref({ step: "handoff" })}
          >
            Hand off
          </Link>{" "}
          and{" "}
          <Link
            to="/settings/flow"
            search={{ step: "status" }}
            className="text-fg underline underline-offset-2"
            href={settingsFlowHref({ step: "status" })}
          >
            Status
          </Link>{" "}
          steps.
        </p>
      </div>
    </div>
  );
}
