// Views that are large and not needed for the first paint load as chunks of their own: the issue
// drawer and page (the whole issue feature), Add work and Workdatabase · Skills. The board, the
// nav and the palette are what a first load shows. After the first paint the browser is idle and
// fetches the rest, so the first click on a card or on + Add work finds its chunk already there.
import { lazy } from "react";

const loadIssue = () => import("@/features/issue");
const loadAddWork = () => import("@/features/add-work/AddWorkDialog");
const loadSkills = () => import("@/features/skills/SkillsView");

export const IssueDrawer = lazy(() => loadIssue().then((m) => ({ default: m.IssueDrawer })));
export const IssuePage = lazy(() => loadIssue().then((m) => ({ default: m.IssuePage })));
export const AddWorkDialog = lazy(() => loadAddWork().then((m) => ({ default: m.AddWorkDialog })));
export const SkillsView = lazy(() => loadSkills().then((m) => ({ default: m.SkillsView })));

/** Fetch every lazy view now. Failures are ignored: the view loads again when it is opened. */
export function preloadViews(): void {
  for (const load of [loadIssue, loadAddWork, loadSkills]) void load().catch(() => {});
}

/** Run `fn` when the browser is idle (or after a short wait where it has no idle callback). */
export function whenIdle(fn: () => void): () => void {
  if (typeof requestIdleCallback === "function") {
    const id = requestIdleCallback(fn, { timeout: 3000 });
    return () => cancelIdleCallback(id);
  }
  const id = setTimeout(fn, 1500);
  return () => clearTimeout(id);
}
