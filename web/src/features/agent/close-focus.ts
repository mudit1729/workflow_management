// Where focus goes when an agent dialog closes. Radix gives it back to the control that opened the
// dialog, and for the connect flow that control is often gone: Do next step is replaced by the run
// strip once the run it asked for starts, a menu item is closed, the palette is dismissed. Focus
// then drops to <body> and a keyboard user loses their place. The order here: the strip of the run
// the dialog just started, the control that opened it, the open issue drawer, the nav's agent row.
import { focusRunStrip } from "@/features/codex";
import type { CodexRun } from "@/lib/api";

/** What focus can land on inside a docked drawer, which is not a tab stop itself. */
const FOCUSABLE =
  "button:not(:disabled), [href], input:not(:disabled), [tabindex]:not([tabindex='-1'])";

function focus(el: Element | null | undefined): boolean {
  if (!(el instanceof HTMLElement) || !el.isConnected || el === document.body) return false;
  el.focus({ preventScroll: true });
  return document.activeElement === el;
}

/** The opener is gone: the issue the person had open, else the nav's agent row. */
function fallback(): void {
  const drawer = document.querySelector<HTMLElement>('[data-wf="IssueDrawer"]');
  if (focus(drawer) || focus(drawer?.querySelector(FOCUSABLE))) return;
  focus(document.querySelector('[data-wf="AgentStatus"]'));
}

/**
 * Put focus somewhere sensible after an agent dialog closed. `started` is the run the dialog asked
 * for as it closed (Done, Check again): its strip comes first. `opener` is what had focus when the
 * dialog opened.
 */
export async function settleFocus(
  opener: Element | null,
  started?: Promise<CodexRun | undefined>,
): Promise<void> {
  if (started) {
    const run = await started;
    if (run?.status === "running" && (await focusRunStrip(run.issue))) return;
  }
  if (!focus(opener)) fallback();
}
