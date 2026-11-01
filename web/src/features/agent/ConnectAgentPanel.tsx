// The connect flow's inside: one screen at a time, Back and the progress dots at the bottom, the
// primary action at the right. The dialog and the gallery both render this, as they do for Add work.
import { ArrowLeft } from "lucide-react";
import { useCallback, useEffect, useRef } from "react";
import { Button, Kbd } from "@/components/ui";
import { DigitSlot } from "@/features/add-work/parts";
import { cn } from "@/lib/cn";
import { ConnectScreen } from "./ConnectScreens";
import { primaryLabel, STEP_LABEL, type StepId } from "./connect-flow";
import type { ConnectFlow } from "./useConnectFlow";

/** Screens with nothing to pick leave focus on the primary button once it can be pressed. */
const PRIMARY_FOCUS = new Set<StepId>(["run", "done"]);

export function ConnectAgentPanel({
  flow,
  autoFocus = true,
}: {
  flow: ConnectFlow;
  /** Move focus to the screen's first control when a screen opens (off in the gallery). */
  autoFocus?: boolean;
}) {
  const root = useRef<HTMLDivElement>(null);
  const scroller = useRef<HTMLDivElement>(null);
  const { step, ready } = flow;
  const label = primaryLabel(step, flow.then !== undefined);

  // Focus goes to the screen's first control: the answer, or the Copy button; once the bridge has
  // answered, to the primary button, so Enter goes on.
  const focusKey = `${step}:${ready}`;
  const focusFirst = useCallback(() => {
    const target = root.current?.querySelector<HTMLElement>("[data-autofocus]:not(:disabled)");
    (target ?? root.current)?.focus({ preventScroll: true });
  }, []);

  // biome-ignore lint/correctness/useExhaustiveDependencies: `focusKey` is the trigger: a new screen, or the bridge answering.
  useEffect(() => {
    scroller.current?.scrollTo({ top: 0 });
    if (!autoFocus) return;
    const frame = requestAnimationFrame(focusFirst);
    return () => cancelAnimationFrame(frame);
  }, [focusKey, autoFocus, focusFirst]);

  return (
    <DigitSlot value={flow.digits}>
      <div
        ref={root}
        data-wf="ConnectAgentPanel"
        tabIndex={-1}
        onKeyDown={flow.onKeyDown}
        className="flex min-h-0 flex-1 flex-col outline-none"
      >
        <div
          ref={scroller}
          className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-6 pt-3 pb-5 max-md:px-4"
        >
          <div key={step}>
            <ConnectScreen flow={flow} />
          </div>
        </div>
        <footer
          data-wf="ConnectAgentFooter"
          className="flex shrink-0 flex-wrap items-center gap-x-2 gap-y-1 border-border border-t px-4 py-3 max-md:px-3"
        >
          {/* On a phone the dots take their own row, so a long button label never meets them. */}
          <div className="order-first flex w-full min-w-0 justify-center md:order-none md:mx-auto md:w-auto md:flex-1">
            <StepDots steps={flow.steps} index={flow.index} onGo={flow.goTo} />
          </div>
          <Button
            variant="ghost"
            aria-label="Back"
            aria-keyshortcuts="Backspace ArrowLeft"
            disabled={flow.index === 0}
            onClick={flow.back}
            className="max-md:order-1 md:order-first"
          >
            <ArrowLeft size={14} strokeWidth={1.75} />
            Back
          </Button>
          <Button
            variant="primary"
            data-autofocus={ready && PRIMARY_FOCUS.has(step) ? "" : undefined}
            disabled={!ready}
            onClick={() => flow.advance()}
            className="min-w-0 max-w-[70%] max-md:order-2 max-md:ml-auto md:max-w-[55%]"
          >
            <span className="truncate">{label}</span>
            <Kbd tone="inverted" aria-hidden className="max-md:hidden">
              ↵
            </Kbd>
          </Button>
        </footer>
      </div>
    </DigitSlot>
  );
}

/**
 * One dot per screen. The dot you are on is a longer pill; the ones behind you take you back.
 * (The dots of Add work are typed to its own steps.)
 */
function StepDots({
  steps,
  index,
  onGo,
}: {
  steps: readonly StepId[];
  index: number;
  onGo: (i: number) => void;
}) {
  return (
    <ol
      data-wf="ProgressDots"
      aria-label={`Screen ${index + 1} of ${steps.length}`}
      className="flex items-center"
    >
      {steps.map((s, i) => (
        <li key={s} className="flex">
          {i < index ? (
            <button
              type="button"
              aria-label={`Back to ${STEP_LABEL[s]}`}
              title={STEP_LABEL[s]}
              onClick={() => onGo(i)}
              className="group/dot grid h-6 w-3.5 cursor-default place-items-center rounded-sm"
            >
              <span className="size-1.5 rounded-full bg-fg-faint transition-colors duration-100 group-hover/dot:bg-fg-muted" />
            </button>
          ) : (
            <span
              aria-current={i === index ? "step" : undefined}
              className="grid h-6 w-3.5 place-items-center"
            >
              <span
                className={cn(
                  "h-1.5 rounded-full transition-[width,background-color] duration-150 ease-wf",
                  i === index ? "w-3.5 bg-accent" : "w-1.5 bg-border",
                )}
              />
            </span>
          )}
        </li>
      ))}
    </ol>
  );
}
