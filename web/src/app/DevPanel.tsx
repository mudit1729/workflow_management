// Prototype controls: a "Prototype" pill (expanded nav) or an icon button (collapsed rail,
// phone top bar) that opens a popover for driving the mock server (live events, connection
// state, conflicts, archify, reset, sample data). "." toggles it. Nothing floats over board content.
import {
  ArrowRight,
  Check,
  Database,
  FlaskConical,
  FolderTree,
  Play,
  RotateCcw,
} from "lucide-react";
import { type ReactNode, useEffect, useState } from "react";
import { toast } from "sonner";
import {
  Button,
  Chip,
  Kbd,
  Popover,
  PopoverContent,
  PopoverTrigger,
  Segmented,
  Switch,
} from "@/components/ui";
import { useFilesNav } from "@/features/files";
import { queryClient, useSnapshot } from "@/lib/api";
import { cn } from "@/lib/cn";
import { useLiveStatus } from "@/lib/live";
import { useGo } from "@/lib/nav";
import { getMockControls, type MockConnection, playNextEvent } from "./mock-controls";
import { useShell } from "./shell-store";

/** nav: the pill above the expanded nav footer. rail: icon for the collapsed rail. bar: phone top bar. */
type Placement = "nav" | "rail" | "bar";

const ICON = { size: 14, strokeWidth: 1.75 } as const;
const STATE_DOT: Record<MockConnection, string> = {
  live: "bg-status-done",
  reconnecting: "bg-stale animate-pulse",
  offline: "bg-danger",
};
const STATE_LABEL: Record<MockConnection, string> = {
  live: "Live",
  reconnecting: "Reconnecting…",
  offline: "Offline",
};

export function DevPanel({ placement }: { placement: Placement }) {
  const open = useShell((s) => s.devPanelOpen);
  const setOpen = useShell((s) => s.setDevPanelOpen);
  const { state } = useLiveStatus();
  const nav = placement === "nav";

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <div data-wf="DevPanel">
        <PopoverTrigger asChild>
          {nav ? (
            <button
              type="button"
              aria-label="Prototype controls"
              aria-keyshortcuts="."
              className={cn(
                "inline-flex h-6 items-center gap-1.5 rounded-full border border-border bg-bg px-2.5 font-medium text-fg-muted text-xs",
                "transition-colors duration-100 ease-wf hover:border-border-strong hover:text-fg data-[state=open]:border-border-strong data-[state=open]:text-fg",
              )}
            >
              <FlaskConical size={12} strokeWidth={1.75} aria-hidden />
              Prototype
              {state !== "live" && (
                <span aria-hidden className={cn("size-1.5 rounded-full", STATE_DOT[state])} />
              )}
            </button>
          ) : (
            <Button
              variant="ghost"
              size={placement === "bar" ? "icon" : "icon-sm"}
              aria-label="Prototype controls"
              aria-keyshortcuts="."
              className="relative"
            >
              <FlaskConical {...ICON} aria-hidden />
              {state !== "live" && (
                <span
                  aria-hidden
                  className={cn(
                    "absolute top-1 right-1 size-1.5 rounded-full ring-2 ring-subtle",
                    STATE_DOT[state],
                  )}
                />
              )}
            </Button>
          )}
        </PopoverTrigger>
      </div>
      <PopoverContent
        side={nav ? "top" : placement === "rail" ? "right" : "bottom"}
        align={nav ? "start" : "end"}
        sideOffset={8}
        className="w-80 p-0"
        aria-label="Prototype controls"
      >
        <DevPanelBody onClose={() => setOpen(false)} />
      </PopoverContent>
    </Popover>
  );
}

function DevPanelBody({ onClose }: { onClose: () => void }) {
  const mock = getMockControls();
  const live = useLiveStatus();
  const snapshot = useSnapshot().data;
  const go = useGo();
  const files = useFilesNav();
  const [conflictArmed, setConflictArmed] = useState(false);
  // The snapshot is the truth: the diagram card can flip archify too. `pending` only carries the
  // switch over the moment between the click and the refetched snapshot.
  const real = snapshot?.config.archify !== "unavailable";
  const [pending, setPending] = useState<boolean | undefined>();
  const archify = pending ?? real;
  useEffect(() => {
    if (pending === real) setPending(undefined);
  }, [pending, real]);
  const disabled = !mock;

  return (
    <div className="flex flex-col">
      <header className="flex flex-col gap-0.5 px-3 pt-3 pb-2.5">
        <h2 className="font-semibold text-base text-fg">Prototype controls</h2>
        <p className="text-fg-faint text-xs">
          {mock
            ? "Mock data in memory. Nothing here touches your files."
            : "Unavailable: this build talks to wf serve, not the mock server."}
        </p>
      </header>

      <Section title="Live updates">
        <Row
          label={
            <span className="flex items-center gap-2">
              <span aria-hidden className={cn("size-2 rounded-full", STATE_DOT[live.state])} />
              <span className="text-fg">{STATE_LABEL[live.state]}</span>
              {live.rev && (
                <span className="font-mono text-fg-faint text-xs" title="Workspace rev">
                  {live.rev.slice(0, 7)}
                </span>
              )}
            </span>
          }
        >
          <Button
            size="sm"
            variant="secondary"
            disabled={disabled}
            onClick={() => mock && playNextEvent(mock)}
          >
            <Play {...ICON} aria-hidden />
            Play next event
          </Button>
        </Row>
        <Row label="Connection">
          <Segmented<MockConnection>
            size="sm"
            aria-label="Connection state"
            value={live.state}
            disabled={disabled}
            onChange={(v) => mock?.setConnection(v)}
            options={[
              { value: "live", label: "Live" },
              { value: "reconnecting", label: "Retrying" },
              { value: "offline", label: "Offline" },
            ]}
          />
        </Row>
      </Section>

      <Section title="Writes and rendering">
        <Row
          label="Conflict on next write"
          hint="The next write answers 409 and rolls back. One shot."
        >
          {conflictArmed ? (
            <Chip tone="accent" icon={<Check size={12} strokeWidth={1.75} />}>
              Armed
            </Chip>
          ) : (
            <Button
              size="sm"
              variant="secondary"
              disabled={disabled}
              onClick={() => {
                mock?.conflictNextWrite();
                setConflictArmed(true);
              }}
            >
              Arm
            </Button>
          )}
        </Row>
        <Row
          label="Archify available"
          hint={archify ? "Diagrams render as usual." : "Diagrams show the unavailable state."}
          htmlFor="wf-dev-archify"
        >
          <Switch
            id="wf-dev-archify"
            checked={archify}
            disabled={disabled}
            onCheckedChange={(on) => {
              setPending(on);
              mock?.setArchifyAvailable(on);
            }}
          />
        </Row>
      </Section>

      <Section title="Source of truth">
        <p className="text-fg-faint text-xs">
          The workspace is a folder of markdown files. Edit one and the Workflow board changes.
        </p>
        <Button
          size="sm"
          variant="secondary"
          className="self-start"
          onClick={() => {
            onClose();
            void files.open();
          }}
        >
          <FolderTree {...ICON} aria-hidden />
          Open Library · Files
        </Button>
      </Section>

      <footer className="flex flex-wrap items-center gap-x-1 gap-y-1 border-border border-t px-3 py-2.5">
        <Button
          size="sm"
          variant="ghost"
          disabled={disabled}
          onClick={() => {
            mock?.reset();
            void queryClient.invalidateQueries();
            setConflictArmed(false);
            toast.success("Mock data reset", {
              description: "The workspace is back to its shipped files: groups, no issues.",
            });
          }}
        >
          <RotateCcw {...ICON} aria-hidden />
          Reset data
        </Button>
        <Button
          size="sm"
          variant="ghost"
          disabled={disabled}
          onClick={() => {
            if (!mock) return;
            const count = mock.loadSample();
            void queryClient.invalidateQueries();
            setConflictArmed(false);
            toast.success(`Loaded ${count} sample ${count === 1 ? "issue" : "issues"}`, {
              description: "Reset data goes back to the empty workspace.",
            });
          }}
        >
          <Database {...ICON} aria-hidden />
          Load sample data
        </Button>
        <Button
          size="sm"
          variant="ghost"
          className="ml-auto"
          onClick={() => {
            onClose();
            go.kit();
          }}
        >
          Kit
          <ArrowRight {...ICON} aria-hidden />
        </Button>
      </footer>
      <p className="flex items-center gap-1 border-border border-t bg-subtle px-3 py-1.5 text-fg-faint text-xs">
        Press <Kbd combo="." /> to show or hide this panel.
      </p>
    </div>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-1 border-border border-t px-3 py-2.5">
      <h3 className="font-medium text-fg-faint text-xs">{title}</h3>
      {children}
    </section>
  );
}

function Row({
  label,
  hint,
  htmlFor,
  children,
}: {
  label: ReactNode;
  hint?: string;
  htmlFor?: string;
  children: ReactNode;
}) {
  const text = htmlFor ? (
    <label htmlFor={htmlFor} className="text-fg">
      {label}
    </label>
  ) : (
    <span className="text-fg">{label}</span>
  );
  return (
    <div className="flex min-h-8 items-center gap-3">
      <div className="flex min-w-0 flex-1 flex-col">
        {text}
        {hint && <span className="text-fg-faint text-xs">{hint}</span>}
      </div>
      <div className="flex shrink-0 items-center">{children}</div>
    </div>
  );
}
