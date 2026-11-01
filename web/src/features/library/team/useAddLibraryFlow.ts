// Add team library: the flow as a hook. The controller holds the answers (`controller.ts`); this
// gives it GitHub, the library list and the router, and hands the panel what it shows.
import type { KeyboardEvent, RefObject } from "react";
import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { toast } from "sonner";
import { isTypingTarget } from "@/features/add-work/parts";
import { useLibraries } from "@/lib/api";
import { addLibrary } from "@/lib/api/library";
import { useOpenPage } from "@/lib/nav";
import { type Controller, createController, type Deps, type State } from "./controller";
import {
  aliasProblem,
  keyAction,
  pagesLabel,
  repoName,
  type Screen,
  type Suggestion,
  screensFor,
  suggestionsFor,
} from "./flow";
import { addedFromSettings } from "./from-settings";

/** The GitHub reader is its own chunk: it loads when the flow first asks it something. */
const github = () => import("@mock/libraries/github");

export interface AddLibraryFlow {
  state: State;
  controller: Controller;
  screens: Screen[];
  index: number;
  suggestions: Suggestion[];
  /** The alias of a library already added from this repo and folder, if any. */
  already?: string;
  /** The screen's answer is complete: the primary button can go on. */
  ready: boolean;
  /** Back to an earlier screen (a dot). */
  goTo: (index: number) => void;
  /** Esc, the × and a click on the scrim: close, unless a library is being added. */
  requestClose: () => void;
  /** Number keys, Backspace, ← and Enter, for the element that holds the flow. */
  onKeyDown: (e: KeyboardEvent) => void;
  /** The folder screen puts its number-key handler here. */
  digits: RefObject<((n: number) => void) | undefined>;
}

export function useAddLibraryFlow({
  onClose,
  stay = false,
  deps: override,
}: {
  onClose: () => void;
  /** Opened from Settings: the add stays on that page and says it there (no jump, no toast). */
  stay?: boolean;
  /** Replace parts of what the flow talks to (the component kit adds nothing for real). */
  deps?: Partial<Deps>;
}): AddLibraryFlow {
  const libraries = useLibraries().data;
  const open = useOpenPage();
  const digits = useRef<((n: number) => void) | undefined>(undefined);

  // The controller is made once; what it reads from the render goes through a ref.
  const latest = useRef({ taken: [] as string[], open, onClose, stay });
  latest.current = { taken: libraries?.map((l) => l.alias) ?? [], open, onClose, stay };

  const [controller] = useState(() => {
    const deps: Deps = {
      find: async (raw) => (await github()).findLibrary(raw),
      preview: async (found, choice) => (await github()).previewLibrary(found, choice),
      read: async (found, choice, alias, progress) =>
        (await github()).readLibrary(found, choice, alias, progress),
      register: addLibrary,
      taken: () => latest.current.taken,
      added: (info, { page, skipped }) => {
        const description = `${pagesLabel(info.pages)} from ${info.url ? repoName(info.url) : info.alias}${
          skipped > 0 ? `. ${pagesLabel(skipped)} not read.` : ""
        }`;
        // From Settings the page stays where it is and says the add itself: one confirmation.
        if (latest.current.stay) return addedFromSettings({ name: info.name, description });
        void latest.current.open({ alias: info.alias, ...(page ? { path: page } : {}) });
        toast.success(`Added ${info.name}`, { description });
      },
      close: () => latest.current.onClose(),
    };
    return createController({ ...deps, ...override });
  });
  useEffect(() => () => controller.dispose(), [controller]);

  const state = useSyncExternalStore(controller.subscribe, controller.getState);

  const suggestions = useMemo(() => suggestionsFor(libraries), [libraries]);

  const { found, choice } = state;
  const already =
    found && choice
      ? libraries?.find((l) => l.url === found.repo.url && (l.root ?? "") === choice.root)?.alias
      : undefined;

  const screens = screensFor(state.found);
  const index = Math.max(0, screens.indexOf(state.screen));
  const idle = state.busy === "idle";

  const ready =
    state.screen === "link"
      ? state.raw.trim() !== "" && idle
      : state.screen === "root"
        ? state.picked !== undefined && idle
        : state.preview !== undefined && idle && !aliasProblem(state.alias, latest.current.taken);

  return {
    state,
    controller,
    screens,
    index,
    suggestions,
    ...(already ? { already } : {}),
    ready,
    goTo(i) {
      if (i < 0 || i >= index) return;
      for (let n = index; n > i; n--) controller.back();
    },
    requestClose: () => controller.close(),
    digits,
    onKeyDown(e) {
      if (e.defaultPrevented) return;
      const act = keyAction(
        {
          key: e.key,
          typing: isTypingTarget(e.target),
          onControl: !!(e.target as HTMLElement).closest("button, a, [role='radio']"),
          modified: e.metaKey || e.ctrlKey || e.altKey,
          composing: e.nativeEvent.isComposing,
        },
        state.screen,
      );
      if (!act) return;
      e.preventDefault();
      if (act.do === "digit") digits.current?.(act.n);
      else if (act.do === "back") controller.back();
      else controller.advance();
    },
  };
}
