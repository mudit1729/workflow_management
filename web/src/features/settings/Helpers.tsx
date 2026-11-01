// "Helpers in this step" (spec 5.3, item 4b): the steps that run inside the arrow, each opening its
// own panel, then the custom steps on this arrow and the way to add one. Log, Writing style and
// Status have no place on the line; this is where they are changed.
import { ChevronRight } from "lucide-react";
import { Button } from "@/components/ui";
import type { FlowAfter, FlowStepId } from "@/gen/types";
import { customAfter, flowStep, isFlowAfter, type ResolvedFlow } from "@/lib/api";
import { customKey, HELPERS, usedIn } from "./labels";
import { PanelSection } from "./panel";
import type { PanelKey } from "./search";

const ROW =
  "flex w-full min-w-0 cursor-default items-baseline gap-3 px-3 py-2 text-left transition-colors duration-100 ease-wf hover:bg-subtle focus-visible:bg-subtle";

/** The panel of a step that arrows run: the helpers inside it, its custom steps, and "+ Add a step here". */
export function Helpers({
  step,
  flow,
  onOpen,
  onAdd,
}: {
  step: FlowStepId;
  /** The flow the page shows (mine, or the team default alone). */
  flow: ResolvedFlow;
  onOpen?: (key: PanelKey) => void;
  onAdd?: (after: FlowAfter) => void;
}) {
  const helpers = HELPERS[step] ?? [];
  const after = isFlowAfter(step) ? step : undefined;
  const customs = after ? customAfter(flow, after, { all: true }) : [];
  if (helpers.length === 0 && !after) return <UsedIn step={step} />;
  return (
    <PanelSection
      title="Helpers in this step"
      hint="Skills that run inside it. Open one to change it."
    >
      {(helpers.length > 0 || customs.length > 0) && (
        <ul
          data-wf="Helpers"
          className="flex flex-col divide-y divide-border overflow-hidden rounded-md border border-border"
        >
          {helpers.map((h) => (
            <li key={h.step}>
              <button
                type="button"
                data-helper={h.step}
                onClick={() => onOpen?.(h.step)}
                className={ROW}
              >
                <span className="min-w-0 flex-1">
                  <span className="font-medium text-base text-fg">{flowStep(h.step).name}</span>{" "}
                  <span className="text-fg-faint text-sm">{h.why}</span>
                </span>
                <code className="shrink-0 font-mono text-fg-muted text-xs">
                  {flow.steps[h.step].skill}
                </code>
                <ChevronRight
                  aria-hidden
                  size={12}
                  strokeWidth={1.75}
                  className="shrink-0 self-center text-fg-faint"
                />
              </button>
            </li>
          ))}
          {customs.map((c) => (
            <li key={c.id}>
              <button
                type="button"
                data-custom={c.id}
                onClick={() => onOpen?.(customKey(c))}
                className={ROW}
              >
                <span className="min-w-0 flex-1 truncate font-medium text-base text-fg">
                  + {c.label}
                </span>
                <code className="shrink-0 font-mono text-fg-muted text-xs">{c.skill}</code>
                <ChevronRight
                  aria-hidden
                  size={12}
                  strokeWidth={1.75}
                  className="shrink-0 self-center text-fg-faint"
                />
              </button>
            </li>
          ))}
        </ul>
      )}
      {after && (
        <Button
          size="sm"
          variant="ghost"
          className="-ml-2 self-start"
          onClick={() => onAdd?.(after)}
        >
          + Add a step here
        </Button>
      )}
    </PanelSection>
  );
}

/** Log, Writing style and Status: where they run, since the line does not draw them. */
function UsedIn({ step }: { step: FlowStepId }) {
  const where = usedIn(step).map((id) => flowStep(id).name);
  if (where.length === 0) return null;
  return (
    <p data-wf="UsedIn" className="text-fg-faint text-sm">
      Runs inside {where.join(", ")}.
    </p>
  );
}
