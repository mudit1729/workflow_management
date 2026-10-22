// A request to open a file in the editor, handed from wherever the user asked for it (the
// palette, the New file dialog, an issue's Files tab) to the SourceView that shows that file.
// It lives for a few seconds and is consumed once. Ephemeral UI state, never a workspace fact.
import { create } from "zustand";

export interface EditIntent {
  path: string;
  /** Text to start the editor with: a template for a file that does not exist yet. */
  draft?: string;
  /** An entry to add at the bottom of the file's current text (a new change entry). */
  append?: string;
  /** The H1 a missing log file starts with when `append` creates it. */
  h1?: string;
  /** Text to select once the editor opens, so a title placeholder is ready to overtype. */
  select?: string;
}

interface IntentState {
  intent: (EditIntent & { at: number }) | null;
  request: (intent: EditIntent) => void;
  clear: () => void;
}

const TTL_MS = 15_000;

export const useEditIntent = create<IntentState>()((set) => ({
  intent: null,
  request: (intent) => set({ intent: { ...intent, at: Date.now() } }),
  clear: () => set({ intent: null }),
}));

/** Ask the SourceView for `intent.path` to open its editor. */
export function requestFileEdit(intent: EditIntent) {
  useEditIntent.getState().request(intent);
}

/** The pending intent for `path`, unless it has gone stale. */
export function pendingIntentFor(
  intent: IntentState["intent"],
  path: string,
  now = Date.now(),
): EditIntent | undefined {
  if (!intent || intent.path !== path || now - intent.at > TTL_MS) return undefined;
  return intent;
}
