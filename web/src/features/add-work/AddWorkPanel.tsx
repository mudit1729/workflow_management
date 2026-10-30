// + Add work: the inside of the dialog. One screen at a time, Back and the progress dots at the
// bottom, and the primary action at the right. The dialog and the gallery both render this.
import { ArrowLeft, LoaderCircle } from "lucide-react";
import { useEffect, useRef } from "react";
import { Button, Kbd } from "@/components/ui";
import { countIssues, keptRows } from "./flow";
import { DigitSlot, ProgressDots } from "./parts";
import { StepScreen } from "./steps";
import type { AddWorkFlow } from "./useAddWorkFlow";

/** The primary button's words for the screen on show. */
function primaryLabel(flow: AddWorkFlow): string {
  const { draft, step } = flow;
  if (step === "context") return draft.context.length > 0 ? "Continue" : "Skip";
  if (step === "split") {
    // The last screen of a group: the button writes it. It names what will be written.
    const kept = keptRows(draft).length;
    return kept > 0 ? `Add ${countIssues(kept)} to ${draft.name.trim()}` : "Add issues";
  }
  if (step === "review") {
    const place = flow.places.find((p) => p.id === draft.where);
    return `Add issue to ${place && !place.root ? place.node.title : "the top level"}`;
  }
  return "Continue";
}

/** Screens with no field to type in leave focus on the primary button, so Enter goes on. */
const PRIMARY_FOCUS = new Set(["context", "split", "review"]);

export function AddWorkPanel({
  flow,
  autoFocus = true,
}: {
  flow: AddWorkFlow;
  /** Move focus to the screen's first control when a screen opens (off in the gallery). */
  autoFocus?: boolean;
}) {
  const root = useRef<HTMLDivElement>(null);
  const scroller = useRef<HTMLDivElement>(null);
  const { step } = flow;
  const label = primaryLabel(flow);

  // A new screen starts at the top, and focus goes to its first control. Codex's proposals arrive
  // after the screen opens: then focus goes to the primary button.
  const focusKey = step === "split" && flow.ready ? "split:ready" : step;
  // biome-ignore lint/correctness/useExhaustiveDependencies: `focusKey` is the trigger: a new screen, or the proposals arriving.
  useEffect(() => {
    scroller.current?.scrollTo({ top: 0 });
    if (!autoFocus) return;
    const frame = requestAnimationFrame(() => {
      const target = root.current?.querySelector<HTMLElement>("[data-autofocus]:not(:disabled)");
      (target ?? root.current)?.focus({ preventScroll: true });
    });
    return () => cancelAnimationFrame(frame);
  }, [focusKey, autoFocus]);

  return (
    <DigitSlot value={flow.digits}>
      <div
        ref={root}
        data-wf="AddWorkPanel"
        tabIndex={-1}
        onKeyDown={flow.onKeyDown}
        className="flex min-h-0 flex-1 flex-col outline-none"
      >
        <div
          ref={scroller}
          className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-6 pt-3 pb-5 max-md:px-4"
        >
          <div key={step}>
            <StepScreen flow={flow} />
          </div>
        </div>
        <footer
          data-wf="AddWorkFooter"
          className="flex shrink-0 flex-wrap items-center gap-x-2 gap-y-1 border-border border-t px-4 py-3 max-md:px-3"
        >
          {/* On a phone the dots take their own row, so a long button label never meets them. */}
          <div className="order-first flex w-full min-w-0 justify-center md:order-none md:mx-auto md:w-auto md:flex-1">
            <ProgressDots
              steps={flow.steps}
              index={flow.index}
              onGo={flow.goTo}
              disabled={flow.submitting}
            />
          </div>
          <Button
            variant="ghost"
            aria-label="Back"
            aria-keyshortcuts="Backspace ArrowLeft"
            disabled={flow.index === 0 || flow.submitting}
            onClick={flow.back}
            className="max-md:order-1 md:order-first"
          >
            <ArrowLeft size={14} strokeWidth={1.75} />
            Back
          </Button>
          <Button
            variant="primary"
            data-autofocus={PRIMARY_FOCUS.has(step) ? "" : undefined}
            disabled={!flow.ready || flow.submitting}
            onClick={() => flow.advance()}
            className="min-w-0 max-w-[70%] max-md:order-2 max-md:ml-auto md:max-w-[55%]"
          >
            {flow.submitting ? (
              <>
                <LoaderCircle
                  aria-hidden
                  size={14}
                  strokeWidth={1.75}
                  className="motion-safe:animate-spin"
                />
                <span className="truncate">Adding…</span>
              </>
            ) : (
              <>
                <span className="truncate">{label}</span>
                <Kbd tone="inverted" aria-hidden className="max-md:hidden">
                  ↵
                </Kbd>
              </>
            )}
          </Button>
        </footer>
      </div>
    </DigitSlot>
  );
}
