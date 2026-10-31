// Add team library: the inside of the dialog. One screen at a time, Back and the progress dots at
// the bottom, and the primary action at the right: the same shape as Add work's panel.
import { ArrowLeft, LoaderCircle } from "lucide-react";
import { useCallback, useEffect, useRef } from "react";
import { Button, Kbd } from "@/components/ui";
import { DigitSlot } from "@/features/add-work/parts";
import { ScreenDots } from "./parts";
import { LibraryScreen } from "./screens";
import type { AddLibraryFlow } from "./useAddLibraryFlow";

/** The primary button's words for the screen on show. */
function primaryLabel(flow: AddLibraryFlow): string {
  const { state } = flow;
  if (state.busy === "looking") return "Looking…";
  if (state.screen === "preview") return "Add library";
  return "Continue";
}

export function AddLibraryPanel({
  flow,
  autoFocus = true,
}: {
  flow: AddLibraryFlow;
  /** Move focus to the screen's first control when a screen opens (off in the gallery). */
  autoFocus?: boolean;
}) {
  const root = useRef<HTMLDivElement>(null);
  const scroller = useRef<HTMLDivElement>(null);
  const { state } = flow;
  const adding = state.busy === "adding";
  const label = primaryLabel(flow);

  // Focus goes to the screen's first control. The preview's primary button is off until the first
  // page has loaded: then focus goes to it, so Enter adds.
  const focusKey = state.screen === "preview" && flow.ready ? "preview:ready" : state.screen;
  const focusFirst = useCallback(() => {
    const target = root.current?.querySelector<HTMLElement>("[data-autofocus]:not(:disabled)");
    (target ?? root.current)?.focus({ preventScroll: true });
    target?.scrollIntoView({ block: "nearest" });
  }, []);

  // biome-ignore lint/correctness/useExhaustiveDependencies: `focusKey` is the trigger: a new screen, or the preview arriving.
  useEffect(() => {
    scroller.current?.scrollTo({ top: 0 });
    if (!autoFocus) return;
    const frame = requestAnimationFrame(focusFirst);
    return () => cancelAnimationFrame(frame);
  }, [focusKey, autoFocus, focusFirst]);

  // Pressing Add disables the button, so focus leaves the panel. When the write is refused the
  // button comes back and takes focus again, so Enter tries once more.
  const wasAdding = useRef(false);
  useEffect(() => {
    const was = wasAdding.current;
    wasAdding.current = adding;
    if (!autoFocus || !was || adding) return;
    const frame = requestAnimationFrame(focusFirst);
    return () => cancelAnimationFrame(frame);
  }, [adding, autoFocus, focusFirst]);

  return (
    <DigitSlot value={flow.digits}>
      <div
        ref={root}
        data-wf="AddLibraryPanel"
        tabIndex={-1}
        onKeyDown={flow.onKeyDown}
        className="flex min-h-0 flex-1 flex-col outline-none"
      >
        <div
          ref={scroller}
          className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-6 pt-3 pb-5 max-md:px-4"
        >
          <div key={state.screen}>
            <LibraryScreen flow={flow} />
          </div>
        </div>
        <footer
          data-wf="AddLibraryFooter"
          className="flex shrink-0 flex-wrap items-center gap-x-2 gap-y-1 border-border border-t px-4 py-3 max-md:px-3"
        >
          {/* On a phone the dots take their own row, so a long button label never meets them. */}
          <div className="order-first flex w-full min-w-0 justify-center md:order-none md:mx-auto md:w-auto md:flex-1">
            <ScreenDots
              screens={flow.screens}
              index={flow.index}
              onGo={flow.goTo}
              disabled={adding}
            />
          </div>
          <Button
            variant="ghost"
            aria-label="Back"
            aria-keyshortcuts="Backspace ArrowLeft"
            disabled={flow.index === 0 || state.busy === "adding" || state.busy === "looking"}
            onClick={() => flow.controller.back()}
            className="max-md:order-1 md:order-first"
          >
            <ArrowLeft size={14} strokeWidth={1.75} />
            Back
          </Button>
          <Button
            variant="primary"
            data-autofocus={state.screen === "preview" ? "" : undefined}
            disabled={!flow.ready}
            onClick={() => flow.controller.advance()}
            className="min-w-0 max-w-[70%] max-md:order-2 max-md:ml-auto md:max-w-[55%]"
          >
            {adding ? (
              <>
                <LoaderCircle
                  aria-hidden
                  size={14}
                  strokeWidth={1.75}
                  className="motion-safe:animate-spin"
                />
                <span className="truncate tabular">
                  Adding…
                  {state.progress && state.progress.total > 0
                    ? ` ${state.progress.done} of ${state.progress.total}`
                    : ""}
                </span>
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
