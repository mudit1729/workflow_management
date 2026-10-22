// Where focus lands when a dialog or sheet opens. Radix focuses the first tabbable element,
// which is the header's × button: a focus ring and a tooltip appear before anyone asked.
// Prefer the first control in the body (a field with autoFocus keeps winning); with no
// control there, focus the panel itself, so Esc works and Tab reaches × next.

const TABBABLE =
  'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), textarea:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

export function focusInitial(event: Event, panel: HTMLElement, body: HTMLElement | null) {
  if (event.defaultPrevented) return;
  const active = document.activeElement;
  // A field with `autoFocus` already took focus inside the panel: leave it alone.
  if (active && active !== panel && panel.contains(active)) {
    event.preventDefault();
    return;
  }
  event.preventDefault();
  const first = body?.querySelector<HTMLElement>(TABBABLE);
  (first ?? panel).focus({ preventScroll: true });
}
