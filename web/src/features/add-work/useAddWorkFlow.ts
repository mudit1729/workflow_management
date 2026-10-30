// + Add work: the flow's state and its keys. One hook holds the answers, the screen on show, the
// "discard?" question and the write, so the dialog and the gallery's frame run the same flow.
import { type KeyboardEvent, type RefObject, useCallback, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import type { AddWorkStart } from "@/app/shell-store";
import type { GroupNode } from "@/gen/types";
import { useCreateWork, useGroupIndex, useGroupTree } from "@/lib/api";
import { revealBacklog } from "@/lib/board-folds";
import { useBoardSearch, useGo, useOpenIssue } from "@/lib/nav";
import {
  canContinue,
  countIssues,
  createArgs,
  type Draft,
  emptyDraft,
  isDirty,
  pickWhere,
  type StepId,
  stepsFor,
  type WhereOption,
  type WorkKind,
  whereOptions,
} from "./flow";
import { isTypingTarget } from "./parts";

export interface FlowSeed {
  /** Answers to start with (the gallery shows a screen with its answers in). */
  draft?: Partial<Draft>;
  /** The screen to start on. */
  step?: StepId;
}

export interface AddWorkFlow {
  draft: Draft;
  patch: (patch: Partial<Draft>) => void;
  step: StepId;
  steps: StepId[];
  index: number;
  /** The top-level group, once the workspace has loaded. */
  root: GroupNode | undefined;
  /** The group the answer to "Where?" names. */
  parent: GroupNode | undefined;
  places: WhereOption[];
  /** The screen's answers are complete: the person can go on. */
  ready: boolean;
  isLast: boolean;
  /** Go on, first applying `patch` to the answers (a click on an answer button). */
  advance: (patch?: Partial<Draft>) => void;
  back: () => void;
  goTo: (index: number) => void;
  submitting: boolean;
  /** Esc, the × and a click on the scrim: close, or ask first when there is something to lose. */
  requestClose: () => void;
  confirming: boolean;
  keepEditing: () => void;
  discard: () => void;
  /** Number keys, Backspace, ← and Enter, for the element that holds the flow. */
  onKeyDown: (e: KeyboardEvent) => void;
  /** Screens put their number-key handler here. */
  digits: RefObject<((n: number) => void) | undefined>;
}

export function useAddWorkFlow({
  start,
  onClose,
  seed,
}: {
  start?: AddWorkStart;
  onClose: () => void;
  seed?: FlowSeed;
}): AddWorkFlow {
  const skipKind = !!start?.kind;
  const [raw, setRaw] = useState<Draft>(() => emptyDraft({ kind: start?.kind, ...seed?.draft }));
  const [step, setStep] = useState<StepId>(
    () => seed?.step ?? stepsFor(seed?.draft?.kind ?? start?.kind, skipKind)[0],
  );
  const [confirming, setConfirming] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const digits = useRef<((n: number) => void) | undefined>(undefined);

  const root = useGroupTree();
  const index = useGroupIndex();
  const [board] = useBoardSearch();
  const createWork = useCreateWork();
  const go = useGo();
  const openIssue = useOpenIssue();

  const kind: WorkKind = raw.kind ?? "group";
  const places = useMemo(() => (root ? whereOptions(root, kind) : []), [root, kind]);

  // The place starts at the group the caller named, then the group the board shows. A new group
  // with neither goes to the top level; an issue has to be told.
  const draft = useMemo(() => {
    if (raw.where) return raw;
    const where =
      pickWhere(places, [start?.group, board.group]) ?? (kind === "group" ? root?.id : undefined);
    return where ? { ...raw, where } : raw;
  }, [raw, places, start?.group, board.group, kind, root?.id]);

  const steps = useMemo(() => stepsFor(draft.kind, skipKind), [draft.kind, skipKind]);
  const at = Math.max(0, steps.indexOf(step));
  const parentOf = useCallback((d: Draft) => (d.where ? index.get(d.where) : undefined), [index]);
  const parent = parentOf(draft);
  const ready = canContinue(draft, step, parent);

  const patch = useCallback((p: Partial<Draft>) => setRaw((d) => ({ ...d, ...p })), []);

  const submit = useCallback(
    async (d: Draft) => {
      // A lone issue's context names its group; the top level has none to name.
      const place = places.find((o) => o.id === d.where);
      const args = createArgs(d, place && !place.root ? place.titles.join(" / ") : undefined);
      if (!args || submitting) return;
      setSubmitting(true);
      const res = await createWork(args);
      setSubmitting(false);
      if (!res) return; // the data layer explained the failure; the answers stay
      const target = res.groupId && res.groupId !== root?.id ? { group: res.groupId } : {};
      if (d.status === "backlog") revealBacklog();
      onClose();
      void go.board(target);
      if (d.kind === "issue") {
        const id = res.issueIds[0];
        toast.success(`Added “${d.title.trim()}”`, {
          description: parentOf(d)?.title ? `In ${parentOf(d)?.title}` : "At the top level",
          ...(id ? { action: { label: "Open", onClick: () => void openIssue(id) } } : {}),
        });
      } else {
        toast.success(`Added ${d.name.trim()} with ${countIssues(res.issueIds.length)}`);
      }
    },
    [submitting, createWork, places, root?.id, onClose, go, openIssue, parentOf],
  );

  const advance = useCallback(
    (p?: Partial<Draft>) => {
      const d = p ? { ...draft, ...p } : draft;
      if (!canContinue(d, step, parentOf(d))) return;
      if (p) setRaw((prev) => ({ ...prev, ...p }));
      const list = stepsFor(d.kind, skipKind);
      const i = list.indexOf(step);
      if (i >= 0 && i < list.length - 1) setStep(list[i + 1]);
      else if (i === list.length - 1) void submit(d);
    },
    [draft, step, skipKind, parentOf, submit],
  );

  const back = useCallback(() => {
    if (submitting || at === 0) return;
    setStep(steps[at - 1]);
  }, [submitting, at, steps]);

  const goTo = useCallback(
    (i: number) => {
      if (!submitting && i >= 0 && i < at) setStep(steps[i]);
    },
    [submitting, at, steps],
  );

  const requestClose = useCallback(() => {
    if (submitting) return;
    if (isDirty(draft)) setConfirming(true);
    else onClose();
  }, [submitting, draft, onClose]);

  const onKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.nativeEvent.isComposing) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (isTypingTarget(e.target)) return;
      if (/^[1-9]$/.test(e.key)) {
        if (digits.current) {
          e.preventDefault();
          digits.current(Number(e.key));
        }
      } else if (e.key === "Backspace" || e.key === "ArrowLeft") {
        e.preventDefault();
        back();
      } else if (e.key === "Enter") {
        // A focused button or answer handles Enter itself.
        if ((e.target as HTMLElement).closest("button, a, [role='radio']")) return;
        e.preventDefault();
        advance();
      }
    },
    [back, advance],
  );

  return {
    draft,
    patch,
    step: steps[at],
    steps,
    index: at,
    root,
    parent,
    places,
    ready,
    isLast: at === steps.length - 1,
    advance,
    back,
    goTo,
    submitting,
    requestClose,
    confirming,
    keepEditing: () => setConfirming(false),
    discard: () => {
      setConfirming(false);
      onClose();
    },
    onKeyDown,
    digits,
  };
}
