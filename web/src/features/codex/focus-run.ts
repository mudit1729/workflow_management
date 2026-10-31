// Where a keyboard user lands after a dialog started a run for them. The connect flow's Done and
// the Agent panel's Check again close and start the run that Do next step asked for; the button
// that opened the dialog is replaced by the run strip, so focus has nowhere to return to. The strip
// of that issue (`data-run-focus`, in the `CodexActions` of `data-issue`) is the next place.
import type { IssueId } from "@/gen/types";

/** How long to wait for the strip to be drawn once the run exists (ms). */
const WAIT_MS = 1500;

const header = (issue: IssueId): Element | null =>
  document.querySelector(`[data-wf="CodexActions"][data-issue="${CSS.escape(issue)}"]`);

/**
 * Focus the run strip of `issue`, waiting a moment for it to appear. Resolves to false at once when
 * no header of the issue is on screen (the run started from the board or the palette), and after
 * `WAIT_MS` when the strip never came; the caller then looks for another place.
 */
export function focusRunStrip(issue: IssueId): Promise<boolean> {
  if (!header(issue)) return Promise.resolve(false);
  return new Promise((resolve) => {
    const until = performance.now() + WAIT_MS;
    const look = () => {
      const strip = header(issue)?.querySelector<HTMLElement>("[data-run-focus]");
      if (strip) {
        strip.focus({ preventScroll: true });
        resolve(document.activeElement === strip);
      } else if (performance.now() < until && header(issue)) requestAnimationFrame(look);
      else resolve(false);
    };
    look();
  });
}
