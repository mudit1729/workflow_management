// Handing an issue to someone is handing over its content, not a command (goal 2). The context
// bundle is the markdown the `handing-off` skill prints: the goal, the criteria with status, the
// current state, ready tasks, last changes, decisions, learnings, linked library items and the
// git, PR and CI facts, inside the workspace token budget. The header's Hand off button, the
// palette and the Kit all copy that markdown through `copyContext`, so they say the same thing.
import { toast } from "sonner";
import { create } from "zustand";
import { copyText } from "@/components/common";
import { api, qk, queryClient } from "@/lib/api";

/** `[context] budget_tokens` of the prototype workspace. */
export const HANDOFF_BUDGET = 6000;

/** The prompt that asks Codex or Claude to do the same hand-off headlessly. */
export function handoffPrompt(id: string): string {
  return `Hand ${id} over: use the handing-off skill.`;
}

/** The rule of thumb the bundle itself uses: four characters per token. */
export function approxTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

/** "~1.5k", "~800". */
export function tokenCount(tokens: number): string {
  if (tokens < 1000) return `~${Math.max(1, Math.round(tokens / 10) * 10)}`;
  return `~${(tokens / 1000).toFixed(1).replace(/\.0$/, "")}k`;
}

/** "~1.5k tokens", "~800 tokens". */
export function tokenLabel(tokens: number): string {
  return `${tokenCount(tokens)} tokens`;
}

export interface ContextFacts {
  tokens: number;
  budget: number;
  /** Sections the budget cut, from the bundle's footer. Empty when nothing was left out. */
  leftOut: string[];
}

/**
 * Tokens, budget and left-out sections of a bundle. The footer comment of the bundle
 * (`<!-- wf context <id> · ~1,909 of 6,000 tokens · left out: none -->`) is the source; a bundle
 * without one is estimated from its length.
 */
export function contextFacts(markdown: string): ContextFacts {
  const footer = markdown.match(
    /<!--\s*wf context[^>]*?~\s*([\d,.]+)\s+of\s+([\d,.]+)\s+tokens(?:\s*·\s*left out:\s*([^>]*?))?\s*-->/,
  );
  const number = (text: string | undefined) => Number((text ?? "").replace(/[,.]/g, ""));
  const used = footer ? number(footer[1]) : 0;
  const budget = footer ? number(footer[2]) : 0;
  const out = footer?.[3]?.trim() ?? "";
  const leftOut = !out || /^none\.?$/i.test(out) ? [] : out.split(/\s*,\s*/).filter(Boolean);
  return {
    tokens: used > 0 ? used : approxTokens(markdown),
    budget: budget > 0 ? budget : HANDOFF_BUDGET,
    leftOut,
  };
}

export interface CopiedContext extends ContextFacts {
  /** True when the clipboard took it. */
  ok: boolean;
  markdown: string;
}

/**
 * Read the bundle of an issue right now and put it on the clipboard. Resolves to `undefined` when
 * the bundle could not be read (the issue is gone, the server is down). It does not toast: the
 * header says it in its popover, the palette in `copyContextWithToast`, so each event is confirmed once.
 */
export async function copyContext(
  id: string,
  budget = HANDOFF_BUDGET,
): Promise<CopiedContext | undefined> {
  let markdown: string;
  try {
    markdown = await queryClient.fetchQuery({
      queryKey: qk.context(id, budget),
      queryFn: () => api.context(id, budget),
      staleTime: 0,
    });
  } catch {
    return undefined;
  }
  const ok = await copyText(markdown);
  return { ok, markdown, ...contextFacts(markdown) };
}

// ---------------------------------------------------------------- a view of the bundle

interface ViewState {
  /** The issue whose bundle is open in the dialog, if any. */
  issue: string | undefined;
  /** The mounted hosts, oldest first. Only the oldest draws the dialog (the kit mounts several views). */
  hosts: string[];
  open: (issue: string) => void;
  close: () => void;
  mount: (host: string) => void;
  unmount: (host: string) => void;
}

/** Which bundle the dialog shows. `HandoffViewHost` (mounted by the issue view) reads it. */
export const useContextView = create<ViewState>((set) => ({
  issue: undefined,
  hosts: [],
  open: (issue) => set({ issue }),
  close: () => set({ issue: undefined }),
  mount: (host) => set((s) => ({ hosts: [...s.hosts, host] })),
  unmount: (host) => set((s) => ({ hosts: s.hosts.filter((h) => h !== host) })),
}));

/** Open the full bundle of an issue in a dialog. The issue view must be open to show it. */
export function showContext(id: string): void {
  useContextView.getState().open(id);
}

/**
 * Copy the bundle and say so in one toast with a "View" action. For places without a popover of
 * their own (the command palette). The header uses its popover line instead and does not toast.
 */
export async function copyContextWithToast(id: string): Promise<boolean> {
  const copied = await copyContext(id);
  if (!copied) {
    toast.error(`Could not read the context of ${id}`);
    return false;
  }
  if (!copied.ok) {
    toast.error("Could not copy to the clipboard", {
      description: "The browser blocked clipboard access.",
    });
    return false;
  }
  toast(`Copied context for ${id} (${tokenLabel(copied.tokens)})`, {
    description: "Paste it into a chat, a ticket or a message.",
    action: { label: "View", onClick: () => showContext(id) },
  });
  return true;
}
