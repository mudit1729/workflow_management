// The browser tab title: the view, then the workspace. Pure, so it can be tested without a router.
import { SUBVIEWS, subViewForPath, VIEWS } from "@/components/common";

/**
 * "(3) Workflow · wf": the view, then the workspace. 3 = my open needs-you requests, no count at
 * zero. A sub-view that is not its view's home says so: "Workdatabase · Glossary · wf".
 */
export function tabTitle(path: string, workspace: string | undefined, count: number): string {
  const parts: string[] = [];
  const sub = subViewForPath(path);
  if (sub) {
    const def = SUBVIEWS[sub];
    parts.push(VIEWS[def.view].label);
    if (VIEWS[def.view].home !== sub) parts.push(def.label);
  } else if (path === "/kit" || path.startsWith("/kit/")) {
    parts.push("Kit");
  }
  parts.push(workspace ?? "wf");
  const title = parts.join(" · ");
  return count > 0 ? `(${count}) ${title}` : title;
}
