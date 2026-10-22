// Shared helpers of the diagram feature: type vocabulary, card state, the text agents
// receive, and the iframe plumbing (theme, src) used by the card and the dialog.
import {
  ArrowRightLeft,
  type LucideIcon,
  Network,
  RefreshCw,
  Waypoints,
  Workflow,
} from "lucide-react";
import { type RefObject, useEffect } from "react";
import type { Diagram, DiagramType } from "@/gen/types";
import { useMediaQuery } from "@/lib/hooks";
import { resolveTheme, usePrefs } from "@/lib/prefs";

export const TYPE_ICON: Record<DiagramType, LucideIcon> = {
  architecture: Network,
  workflow: Workflow,
  sequence: ArrowRightLeft,
  dataflow: Waypoints,
  lifecycle: RefreshCw,
};

export const TYPE_LABEL: Record<DiagramType, string> = {
  architecture: "Architecture",
  workflow: "Workflow",
  sequence: "Sequence",
  dataflow: "Data flow",
  lifecycle: "Lifecycle",
};

export type ResolvedTheme = "light" | "dark";

/** What the card shows. `invalid` and `unavailable` never load the iframe. */
export type DiagramState = "rendering" | "ready" | "invalid" | "unavailable";

export function diagramState(
  diagram: Diagram,
  archify: "available" | "unavailable" | undefined,
): DiagramState {
  if (diagram.status === "invalid" || diagram.errors.length > 0) return "invalid";
  if (diagram.status === "unavailable" || archify === "unavailable") return "unavailable";
  // Nothing to load without a URL, whatever the status says.
  if (!diagram.url) return "unavailable";
  return diagram.status === "rendering" ? "rendering" : "ready";
}

export function plural(n: number, one: string, many = `${one}s`): string {
  return `${n} ${n === 1 ? one : many}`;
}

export function sourceLocation(diagram: Diagram): string {
  return `${diagram.file}:${diagram.line}`;
}

export function lineCount(text: string): number {
  return text.split("\n").length;
}

/** The text of "Copy for agent": what failed, where, why, and the block itself. */
export function agentReport(diagram: Diagram): string {
  const errors = diagram.errors.map((e) => `${e.path}: ${e.msg}`).join("\n");
  return `archify finalize failed for ${diagram.id} (${sourceLocation(diagram)})\n${errors}\n\n${diagram.source}`;
}

/** `?embed=1` hides the page's own header (the card has one). The dialog shows it. */
export function frameSrc(diagram: Diagram, theme: ResolvedTheme, embed: boolean): string {
  const join = diagram.url.includes("?") ? "&" : "?";
  return `${diagram.url}${join}${embed ? "embed=1&" : ""}theme=${theme}`;
}

/** The theme the app shows now. Re-renders when the OS theme flips under the "system" pref. */
export function useDiagramTheme(): ResolvedTheme {
  const pref = usePrefs((s) => s.theme);
  useMediaQuery("(prefers-color-scheme: dark)");
  return resolveTheme(pref);
}

/** Tell a loaded diagram page to switch theme without reloading it. */
export function usePostTheme(
  frame: RefObject<HTMLIFrameElement | null>,
  theme: ResolvedTheme,
  active: boolean,
) {
  useEffect(() => {
    if (!active) return;
    // The frame is sandboxed without allow-same-origin, so its origin is opaque.
    frame.current?.contentWindow?.postMessage({ type: "wf:theme", theme }, "*");
  }, [frame, theme, active]);
}
