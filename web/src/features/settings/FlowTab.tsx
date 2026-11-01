// Settings · Skills flow (spec 5.2): the header with its In effect for me | Team default switch,
// the flow, and beside it the panel of the step that is open. The panel is part of the address
// (`?step=plan`), so a link opens it and Back closes it. Beside the flow while the page is wide;
// under 900 px it is a screen of its own, as the skill is in Library · Skills.
import { useEffect, useRef } from "react";
import { Segmented } from "@/components/ui";
import type { FlowAfter } from "@/gen/types";
import { FLOW_AFTER, useFlow, useSnapshot } from "@/lib/api";
import { useHotkey } from "@/lib/hooks";
import { CustomStepPanel, NewStepPanel } from "./CustomPanel";
import { FlowLine } from "./FlowLine";
import { customKey } from "./labels";
import type { PanelVariant } from "./panel";
import { Warning } from "./parts";
import { SavedLine } from "./SavedLine";
import { StepPanel } from "./StepPanel";
import { useSaved } from "./saved";
import { type PanelKey, useFlowNav } from "./search";

/** Page width at which the panel docks beside the flow. */
export const DOCK_AT = 900;
/** The panel is a document form: 400 px, 440 on a wide page. */
const panelWidthFor = (page: number) => (page >= 1180 ? 440 : 400);
/** Under this the states stack, one under the other (spec 5.2). */
export const STACK_UNDER = 640;

export function FlowTab({ width }: { width: number }) {
  const nav = useFlowNav();
  const state = useFlow();
  const workspace = useSnapshot().data?.config.name ?? "this workspace";
  const mine = nav.view === "me";
  const shown = mine ? state.flow : state.team;
  const open = nav.step;

  const docked = width >= DOCK_AT;
  const screen = open !== undefined && !docked && width > 0;
  // From the page, not from the room the panel leaves: opening a panel never redraws the flow.
  const layout = width > 0 && width < STACK_UNDER ? "stack" : "line";

  useHotkey("Escape", () => nav.close(), { enabled: open !== undefined });

  // A step that was there and is gone (undone, or removed in another tab) takes its panel with it.
  const seen = useRef<PanelKey | undefined>(undefined);
  const stillThere = open?.startsWith("custom:")
    ? shown.custom.some((c) => customKey(c) === open) ||
      state.flow.custom.some((c) => customKey(c) === open)
    : true;
  useEffect(() => {
    if (!open?.startsWith("custom:")) return;
    if (stillThere) seen.current = open;
    else if (seen.current === open) nav.close({ replace: true });
  }, [open, stillThere, nav]);

  // The saved line belongs to the panel it was made in: when another panel (or none) opens, it
  // goes. It is looked at when the panel changes, not when a line arrives: an added step's line is
  // shown a moment before its own panel opens.
  useEffect(() => {
    const line = useSaved.getState().line;
    if (line && line.page === "flow" && line.step !== open) useSaved.getState().clear();
  }, [open]);

  // Focus: on a screen, the panel's Back button; when the panel closes, the card it came from.
  const was = useRef<{ key?: PanelKey; after?: string }>({});
  useEffect(() => {
    const before = was.current;
    was.current = { key: open, after: nav.after };
    const frame = requestAnimationFrame(() => {
      if (open && screen) {
        document.querySelector<HTMLElement>('[data-wf="SettingsView"] [data-panel-back]')?.focus();
      } else if (!open && before.key) {
        const key = before.key === "new" ? `new:${before.after ?? ""}` : before.key;
        // A step that is gone (removed) leaves the start of the flow.
        (
          document.querySelector<HTMLElement>(`[data-flow-nav="${CSS.escape(key)}"]`) ??
          document.querySelector<HTMLElement>('[data-wf="FlowLine"] [data-flow-nav="add"]')
        )?.focus({ preventScroll: true });
      }
    });
    return () => cancelAnimationFrame(frame);
  }, [open, screen, nav.after]);

  const variant: PanelVariant = screen ? "screen" : "pane";
  const panel = open && (
    <PanelHost
      key={open}
      open={open}
      after={nav.after}
      variant={variant}
      teamView={!mine}
      onClose={() => nav.close()}
      onAdded={(id) => nav.select(`custom:${id}`)}
      onOpen={nav.select}
      onAddStep={nav.openNew}
    />
  );

  if (screen)
    return (
      <div data-wf="FlowScreen" className="min-h-0 flex-1 bg-bg">
        {panel}
      </div>
    );

  return (
    <div className="flex min-h-0 min-w-0 flex-1">
      <section
        aria-label="Skills flow"
        data-wf="FlowTab"
        className="flex min-h-0 min-w-0 flex-1 flex-col overflow-y-auto"
      >
        <header className="flex flex-wrap items-start justify-between gap-x-6 gap-y-3 px-6 pt-5 pb-5 max-md:px-4">
          <div className="flex min-w-0 flex-1 basis-80 flex-col gap-1">
            <h1 className="font-semibold text-fg text-xl leading-snug tracking-tight">
              Skills flow
            </h1>
            <p className="min-h-[2lh] max-w-[62ch] text-fg-muted text-md">
              {mine
                ? `Which skill runs each step of the work, for everyone in ${workspace}. Change a step for the whole team or just for you.`
                : "The team default alone, as workflow.toml has it. Your own choices are left out."}
            </p>
          </div>
          <Segmented
            aria-label="Show"
            value={nav.view}
            onChange={nav.setView}
            options={[
              { value: "me", label: "In effect for me" },
              { value: "team", label: "Team default" },
            ]}
          />
        </header>

        <div className="flex min-w-0 flex-col gap-4 px-6 pb-8 max-md:px-4">
          <Notes problems={state.personalProblems} />
          {/* A removed step has no panel to say so in: the line is above the flow, where it is seen. */}
          {open === undefined && <SavedLine step={undefined} />}
          <FlowLine
            flow={shown}
            catalog={state.catalog}
            mine={mine}
            selected={open && open !== "new" ? open : undefined}
            adding={open === "new" ? nav.after : undefined}
            layout={layout}
            onSelect={nav.select}
            onAdd={nav.openNew}
          />
        </div>
      </section>

      {open && docked && (
        <aside
          aria-label="Step"
          style={{ width: panelWidthFor(width) }}
          className="min-h-0 shrink-0 border-border border-l bg-bg"
        >
          {panel}
        </aside>
      )}
    </div>
  );
}

/** What is wrong with my own file, above the flow. */
function Notes({ problems }: { problems: string[] }) {
  return problems.map((p) => (
    <Warning key={p} role="status">
      Your library.toml: {p}
    </Warning>
  ));
}

function PanelHost({
  open,
  after,
  variant,
  teamView,
  onClose,
  onAdded,
  onOpen,
  onAddStep,
}: {
  open: PanelKey;
  teamView: boolean;
  after?: string;
  variant: PanelVariant;
  onClose: () => void;
  onAdded: (id: string) => void;
  onOpen: (key: PanelKey) => void;
  onAddStep: (after: FlowAfter) => void;
}) {
  if (open === "new")
    return (
      <NewStepPanel
        after={FLOW_AFTER.find((a) => a === after) ?? "do"}
        variant={variant}
        teamView={teamView}
        onClose={onClose}
        onAdded={onAdded}
      />
    );
  if (open.startsWith("custom:"))
    return <CustomStepPanel id={open.slice(7)} variant={variant} onClose={onClose} />;
  return (
    <StepPanel
      step={open as Exclude<PanelKey, "new" | `custom:${string}`>}
      variant={variant}
      onClose={onClose}
      teamView={teamView}
      onOpen={onOpen}
      onAdd={onAddStep}
    />
  );
}
