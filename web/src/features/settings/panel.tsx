// The frame every panel of the flow page shares (spec 5.3): title and one line on top, sections in
// the middle, the saved line at the foot. On a phone the panel is a screen of its own and says
// "Skills flow" to go back; beside the flow it has a close button.
import { ArrowLeft, X } from "lucide-react";
import { type ReactNode, useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { CopyButton } from "@/components/common";
import { Button, IconButton, Segmented } from "@/components/ui";
import {
  openAddLibraryFromSettings,
  useAddedFromSettings,
} from "@/features/library/team/from-settings";
import type { FlowScope } from "@/lib/api";
import {
  type FlowSaved,
  FlowWriteError,
  installFromCommand,
  installFromNote,
  type Skill,
  type SkillsCatalog,
  shelfOf,
} from "@/lib/api";
import { cn } from "@/lib/cn";
import { SavedLine } from "./SavedLine";
import { showSaved, useSaved } from "./saved";
import type { PanelKey } from "./search";

export type PanelVariant = "pane" | "screen";

export interface PanelFrameProps {
  /** Which panel this is: the saved line belongs to it. */
  panel: PanelKey;
  /** The element's name in the Kit and in feedback. */
  name?: "StepPanel" | "CustomStepPanel" | "NewStepPanel";
  title: ReactNode;
  about?: ReactNode;
  variant: PanelVariant;
  onClose: () => void;
  children: ReactNode;
  /** After the saved line, pinned under the scrolling body: a form's Add step and Cancel. */
  footer?: ReactNode;
}

export function PanelFrame({
  panel,
  name = "StepPanel",
  title,
  about,
  variant,
  onClose,
  children,
  footer,
}: PanelFrameProps) {
  // Back from the editor, or from adding a step, the panel says what was saved: focus starts at its
  // title, so a keyboard user is not sent back to the top of the page.
  const heading = useRef<HTMLHeadingElement>(null);
  // biome-ignore lint/correctness/useExhaustiveDependencies: only when the panel opens
  useEffect(() => {
    if (variant === "pane" && useSaved.getState().line?.step === panel)
      heading.current?.focus({ preventScroll: true });
  }, []);
  return (
    <section
      data-wf={name}
      data-panel={panel}
      aria-label={typeof title === "string" ? title : "Step"}
      className="flex h-full min-h-0 flex-col bg-bg"
    >
      <header className="flex shrink-0 items-start gap-2 border-border border-b py-3 pr-3 pl-5">
        {variant === "screen" && (
          <Button
            variant="ghost"
            size="sm"
            data-panel-back=""
            onClick={onClose}
            className="-ml-3 mt-0.5"
          >
            <ArrowLeft aria-hidden size={14} strokeWidth={1.75} />
            Skills flow
          </Button>
        )}
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <h2
            ref={heading}
            tabIndex={-1}
            className="truncate font-semibold text-fg text-lg leading-snug outline-none"
          >
            {title}
          </h2>
          {/* Two lines are kept, so the first section does not move from one step to the next. */}
          {about && <p className="min-h-[2lh] text-fg-muted text-base">{about}</p>}
        </div>
        {variant === "pane" && (
          <IconButton
            size="sm"
            label="Close"
            shortcut="Escape"
            icon={<X size={14} strokeWidth={1.75} />}
            onClick={onClose}
          />
        )}
      </header>
      <div className="flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto px-5 py-4">{children}</div>
      <footer className="flex min-h-10 shrink-0 flex-col justify-center gap-2 border-border border-t px-5 py-2 empty:hidden">
        <SavedLine step={panel} />
        {footer}
      </footer>
    </section>
  );
}

/** A titled section of a panel. */
export function PanelSection({
  title,
  hint,
  children,
  className,
}: {
  title: ReactNode;
  hint?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section data-wf="PanelSection" className={cn("flex min-w-0 flex-col gap-2", className)}>
      <div className="flex flex-col gap-0.5">
        <h3 className="font-semibold text-base text-fg">{title}</h3>
        {hint && <p className="text-fg-muted text-sm">{hint}</p>}
      </div>
      {children}
    </section>
  );
}

/** What a replacement skill must do (spec 1): quiet text under the title. */
export function Contract({ children }: { children: ReactNode }) {
  return (
    <div data-wf="Contract" className="flex flex-col gap-0.5">
      <h3 className="font-medium text-fg-muted text-xs">Contract</h3>
      <p className="text-fg-faint text-sm">{children}</p>
    </div>
  );
}

/** Apply to [Everyone] [Just me]: whose file the next click writes. */
export function ApplyTo({
  scope,
  onChange,
  canBeMine,
  why,
  teamValue,
}: {
  scope: FlowScope;
  onChange: (scope: FlowScope) => void;
  /** There is a personal library to hold an override, and the page is not the team's view. */
  canBeMine: boolean;
  /** Why Just me is off, when it is not for lack of a library. */
  why?: string;
  /** "The team uses planning-issues", shown with Just me. */
  teamValue?: ReactNode;
}) {
  return (
    <PanelSection title="Apply to">
      <Segmented<FlowScope>
        className="self-start"
        aria-label="Apply to"
        value={scope}
        onChange={onChange}
        options={[
          { value: "team", label: "Everyone" },
          { value: "me", label: "Just me", disabled: !canBeMine },
        ]}
      />
      {scope === "me" && teamValue && (
        <p data-wf="TeamValue" className="text-fg-muted text-sm">
          {teamValue}
        </p>
      )}
      {!canBeMine && (
        <p className="text-fg-faint text-xs">
          {why ?? "Just me keeps your choice in your library. Set one up under Library, Personal."}
        </p>
      )}
    </PanelSection>
  );
}

/**
 * Runs the writes of a panel one at a time: a refusal the caller can explain (`FlowWriteError`)
 * becomes `problem`, shown beside the controls; a server failure has toasted already. A write that
 * saved shows the saved line.
 */
export function useWriter(panel: PanelKey | undefined) {
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string>();
  const running = useRef(false);
  const run = useCallback(
    async (
      task: () => Promise<FlowSaved | undefined>,
      opts: {
        /** The line's words, instead of "Saved to workflow.toml". */
        text?: string | ((saved: FlowSaved) => string);
        /** The panel the line is on, when it is not this one (an added step opens its own). */
        step?: PanelKey | undefined | ((saved: FlowSaved) => PanelKey | undefined);
      } = {},
    ): Promise<FlowSaved | undefined> => {
      if (running.current) return undefined;
      running.current = true;
      setBusy(true);
      setProblem(undefined);
      try {
        const saved = await task();
        if (saved) {
          const step = "step" in opts ? opts.step : panel;
          showSaved(
            saved,
            typeof step === "function" ? step(saved) : step,
            typeof opts.text === "function" ? opts.text(saved) : opts.text,
          );
        }
        return saved;
      } catch (err) {
        if (err instanceof FlowWriteError) setProblem(err.message);
        else
          toast.error("Could not save the change", {
            description: err instanceof Error ? err.message : "Try again in a moment.",
          });
        return undefined;
      } finally {
        running.current = false;
        setBusy(false);
      }
    },
    [panel],
  );
  return { busy, problem, run };
}

type InstallTool = "codex" | "claude";
const INSTALL_TOOLS: { value: InstallTool; label: string }[] = [
  { value: "codex", label: "Codex" },
  { value: "claude", label: "Claude Code" },
];
/** The tool picked last stays for the next note. The connected agent will set it (round 2). */
let lastTool: InstallTool = "codex";

/**
 * Under the skills of a step: what puts a skill that is not built in beside the built-ins on an
 * agent's machine (spec 7), for Codex and for Claude Code. A skill nobody installed cannot run,
 * whatever the flow names. It names the skill, so it is not read as being about another card.
 */
export function InstallNote({
  skill,
  catalog,
  scope,
}: {
  skill: Skill | undefined;
  catalog: SkillsCatalog | undefined;
  /** Whose agent: everyone's (the team's value) or mine. */
  scope: FlowScope;
}) {
  const [tool, setTool] = useState<InstallTool>(lastTool);
  const shelf =
    skill && skill.source !== "built-in"
      ? shelfOf(catalog, skill.library ?? (skill.source === "workspace" ? "ws" : "me"))
      : undefined;
  if (!skill || !shelf) return null;
  const command = installFromCommand(shelf, tool);
  const note =
    installFromNote(shelf) ??
    (shelf.source === "library"
      ? `Needs the team library ${shelf.name} added on that machine first.`
      : undefined);
  return (
    <div data-wf="InstallNote" className="flex min-w-0 flex-col gap-1.5">
      <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1.5">
        <p className="min-w-0 text-fg-muted text-sm">
          Install{" "}
          <code className="code-inline rounded-sm bg-muted px-1 py-px text-fg">{skill.name}</code>{" "}
          on {scope === "me" ? "your" : "everyone's"} agent:
        </p>
        <Segmented<InstallTool>
          size="sm"
          aria-label="Install for"
          value={tool}
          onChange={(next) => {
            lastTool = next;
            setTool(next);
          }}
          options={INSTALL_TOOLS}
        />
      </div>
      <div className="flex min-h-8 items-start gap-1 rounded-md border border-border bg-subtle py-px pr-0.5 pl-2.5">
        <span aria-hidden className="select-none pt-[5px] font-mono text-fg-faint text-sm">
          $
        </span>
        <code className="min-w-0 flex-1 whitespace-pre-wrap break-words py-[5px] font-mono text-fg text-sm leading-[18px]">
          {command}
        </code>
        <CopyButton text={command} label="Copy the install command" />
      </div>
      {note && <p className="text-fg-faint text-xs">{note}</p>}
    </div>
  );
}

/**
 * Under the skill cards, where more skills come from: a team library when none is added (its
 * skills appear on adding it), and, in a step's panel (`copy`), a first copy when the cards are
 * only the built-in ones.
 */
export function MoreSkills({
  catalog,
  groups,
  copy = false,
}: {
  catalog: SkillsCatalog;
  groups: readonly unknown[];
  copy?: boolean;
}) {
  const library = catalog.shelves.some((s) => s.source === "library");
  const first = copy && groups.length === 1;
  const added = useAddedFromSettings();
  if (library && !first && !added) return null;
  return (
    <div data-wf="MoreSkills" className="flex flex-col items-start gap-1.5">
      {added && (
        <p role="status" className="text-fg-muted text-sm">
          Added {added.name}
          <span className="block text-fg-faint text-xs">{added.description}</span>
        </p>
      )}
      {(first || !library) && (
        <p className="text-fg-faint text-xs">
          {first
            ? "Skills of this workspace, of a team library and of your own library appear here. Edit a copy of a skill to make the first one."
            : "Skills of a team library appear here once you add it."}
        </p>
      )}
      {!library && (
        <Button size="sm" variant="ghost" onClick={openAddLibraryFromSettings} className="-ml-2">
          Add team library
        </Button>
      )}
    </div>
  );
}
