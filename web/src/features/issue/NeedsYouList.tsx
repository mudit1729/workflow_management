// Needs-you requests from current_state.md, with inline answers. This is the one
// place where a human unblocks agents, so answering never leaves the row.
import {
  CircleCheck,
  Link2,
  type LucideIcon,
  MessageCircleQuestionMark,
  PenLine,
  ShieldCheck,
  TextCursorInput,
} from "lucide-react";
import {
  type ChangeEvent,
  type KeyboardEvent,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { AuthorChip, RefLink, useNow } from "@/components/common";
import { Button, Chip, Kbd, Textarea, Tooltip } from "@/components/ui";
import type { NeedsYouItem, RequestKind, Ts } from "@/gen/types";
import { useAnswerRequest, useMe } from "@/lib/api";
import { cn } from "@/lib/cn";
import { absolute, hoursSince, parseTs, relativeShort } from "@/lib/format";
import { InlineText } from "./CriteriaChecklist";
import { MetaLine } from "./MetaLine";
import { SkillLink } from "./skill-hint";

// ---------------------------------------------------------------- time

/** "just now", "12m ago", "3h ago", "on Oct 9", "in 5m". */
function agoLabel(ts: Ts, now = Date.now()): string {
  const s = relativeShort(ts, now);
  if (s === "now") return "just now";
  if (s.startsWith("in ")) return s;
  if (/^\d+[mhd]$/.test(s)) return `${s} ago`;
  return `on ${s}`;
}

/** Relative time that reads as part of a sentence ("asked 12m ago"); absolute time on hover. */
export function TimeAgo({ ts, className }: { ts: Ts; className?: string }) {
  const now = useNow();
  return (
    <Tooltip content={absolute(ts)}>
      <time data-wf="TimeAgo" dateTime={ts} className={cn("tabular", className)}>
        {agoLabel(ts, now)}
      </time>
    </Tooltip>
  );
}

// ---------------------------------------------------------------- list

const KIND: Record<RequestKind, { icon: LucideIcon; label: string }> = {
  question: { icon: MessageCircleQuestionMark, label: "Question" },
  approval: { icon: ShieldCheck, label: "Approval" },
  input: { icon: TextCursorInput, label: "Input" },
};

/** A blocking request older than this turns its age amber. */
const BLOCKING_AGE_HOURS = 4;

// Drafts survive refetches, tab switches and live updates, keyed by request.
const drafts = new Map<string, string>();

export interface NeedsYouListProps {
  items: NeedsYouItem[];
  issueId: string;
  /** Tighter rows for side panels. */
  compact?: boolean;
}

export function NeedsYouList({ items, issueId, compact = false }: NeedsYouListProps) {
  const listRef = useRef<HTMLUListElement>(null);
  // Blocking first, then oldest first. Answering never reorders a row.
  const sorted = useMemo(
    () =>
      [...items].sort(
        (a, b) =>
          Number(b.urgency === "blocking") - Number(a.urgency === "blocking") ||
          parseTs(a.asked) - parseTs(b.asked),
      ),
    [items],
  );

  if (items.length === 0) {
    return (
      <p data-wf="NeedsYouList" data-empty className="px-3 py-2 text-fg-faint text-sm">
        Nothing needs you here. Agents add requests to current_state.md under Needs you.
      </p>
    );
  }

  return (
    <ul ref={listRef} data-wf="NeedsYouList" aria-label="Needs you" className="flex flex-col">
      {sorted.map((item, i) => (
        <NeedsYouRow
          key={item.id}
          item={item}
          issueId={issueId || item.issue}
          compact={compact}
          first={i === 0}
          onAnswered={() => moveFocusOn(listRef.current)}
        />
      ))}
    </ul>
  );
}

// ---------------------------------------------------------------- focus

/**
 * After an answer the button that sent it is gone and focus would fall to the page. Take it to
 * the next open request's main button (or its text box), and when that was the last request, to
 * the panel that holds the list (the Now tab or the Now section), so the next key starts there.
 */
function moveFocusOn(list: HTMLElement | null) {
  if (!list) return;
  // Twice: the answered state is committed on the next frame, the old button leaves with it.
  window.requestAnimationFrame(() =>
    window.requestAnimationFrame(() => {
      if (document.activeElement && document.activeElement !== document.body) return;
      const open = list.querySelectorAll<HTMLElement>(
        '[data-wf="NeedsYouItem"]:not([data-answered])',
      );
      const next = open[0];
      const target =
        next?.querySelector<HTMLElement>("[data-primary]:not(:disabled)") ??
        next?.querySelector<HTMLElement>("button:not(:disabled), textarea:not(:disabled)");
      if (target) {
        target.focus({ preventScroll: false });
        return;
      }
      const panel = list.closest<HTMLElement>('[role="tabpanel"], [data-section]');
      if (panel) {
        if (!panel.hasAttribute("tabindex")) panel.setAttribute("tabindex", "-1");
        panel.focus({ preventScroll: true });
      }
    }),
  );
}

// ---------------------------------------------------------------- row

interface LocalAnswer {
  answer: string;
  by: string;
  at: Ts;
}

function NeedsYouRow({
  item,
  issueId,
  compact,
  first,
  onAnswered,
}: {
  item: NeedsYouItem;
  issueId: string;
  compact: boolean;
  first: boolean;
  /** Called after the answer was written, when focus was inside this row (a key or a click). */
  onAnswered: () => void;
}) {
  const rowRef = useRef<HTMLLIElement>(null);
  const me = useMe();
  const answerRequest = useAnswerRequest();
  const now = useNow();
  const [local, setLocal] = useState<LocalAnswer | null>(null);
  const [busy, setBusy] = useState(false);
  const [answerAnyway, setAnswerAnyway] = useState(false);
  const questionId = useId();

  const draftKey = `${issueId}/${item.id}`;
  const answered: LocalAnswer | null = item.answered
    ? {
        answer: item.answer ?? local?.answer ?? "",
        by: item.answered_by ?? local?.by ?? item.to,
        at: item.answered_at ?? local?.at ?? item.asked,
      }
    : local;

  const { icon: Icon, label: kindLabel } = KIND[item.kind];
  const blocking = item.urgency === "blocking";
  const overdue = blocking && !answered && hoursSince(item.asked, now) > BLOCKING_AGE_HOURS;
  const forSomeoneElse = Boolean(me) && item.to !== me;
  const refTarget = item.ref?.replace(/^\[\[|\]\]$/g, "");

  const submit = async (text: string) => {
    const answer = text.trim();
    if (!answer || busy) return;
    // The button that sent the answer goes away with the box: remember whether focus was here.
    const hadFocus = rowRef.current?.contains(document.activeElement) ?? false;
    setBusy(true);
    setLocal({ answer, by: me || item.to, at: new Date().toISOString() });
    try {
      const result = await answerRequest({
        issue: issueId,
        id: item.id,
        answer,
        base_rev: item.edit.rev,
      });
      if (result) {
        drafts.delete(draftKey);
        if (hadFocus) onAnswered();
      } else setLocal(null);
    } catch {
      setLocal(null);
    } finally {
      setBusy(false);
    }
  };

  return (
    <li
      ref={rowRef}
      data-wf="NeedsYouItem"
      data-answered={answered ? "" : undefined}
      aria-labelledby={questionId}
      className={cn(
        "flex gap-2.5 px-3",
        compact ? "py-2" : "py-2.5",
        !first && "border-t border-accent/15",
      )}
    >
      <span
        className={cn(
          "mt-px flex size-5 shrink-0 items-center justify-center rounded-sm",
          answered
            ? "text-status-done"
            : blocking
              ? "bg-accent/10 text-accent"
              : "bg-muted text-fg-muted",
        )}
      >
        {answered ? (
          <CircleCheck size={14} strokeWidth={1.75} aria-label="Answered" />
        ) : (
          <Icon size={14} strokeWidth={1.75} aria-label={kindLabel} />
        )}
      </span>

      <div className="min-w-0 flex-1">
        <div className="flex items-start gap-2">
          <p
            id={questionId}
            className={cn(
              "min-w-0 flex-1 text-base font-medium leading-5",
              compact ? "line-clamp-1" : "line-clamp-2",
              answered ? "text-fg-muted" : "text-fg",
            )}
          >
            <InlineText text={item.question} issueId={issueId} />
          </p>
          {!answered && (
            <span className="shrink-0">
              {blocking ? (
                <Chip
                  data-wf="UrgencyChip"
                  tone="accent"
                  size="sm"
                  icon={<span aria-hidden className="size-1.5 rounded-full bg-accent" />}
                  title="The agent is waiting for this answer"
                >
                  Blocking
                </Chip>
              ) : (
                <Chip
                  data-wf="UrgencyChip"
                  tone="neutral"
                  size="sm"
                  title="For your information; work continues"
                >
                  FYI
                </Chip>
              )}
            </span>
          )}
        </div>

        <MetaLine className="mt-1 text-fg-faint text-sm">
          <span className="inline-flex items-center gap-1.5">
            <AuthorChip handle={item.from} size="xs" variant="text" />
            <span aria-hidden>→</span>
            <span className="sr-only">to</span>
            <AuthorChip handle={item.to} size="xs" variant="text" />
          </span>
          <span className={cn(overdue && "text-stale-text")}>
            asked <TimeAgo ts={item.asked} />
          </span>
          {!compact && <span className="font-mono text-xs">{item.id}</span>}
          {refTarget && (
            <span className="inline-flex min-w-0 items-center gap-1">
              <Link2 size={14} strokeWidth={1.75} aria-hidden className="shrink-0" />
              <span className="sr-only">Related:</span>
              <RefLink target={refTarget} issueId={issueId} />
            </span>
          )}
        </MetaLine>

        {answered ? (
          <AnsweredState answer={answered} />
        ) : forSomeoneElse && !answerAnyway ? (
          <p className="mt-2 flex flex-wrap items-center gap-x-1.5 text-sm text-fg-faint">
            <span className="inline-flex items-center gap-1">
              For <AuthorChip handle={item.to} size="xs" />
            </span>
            <Sep />
            <button
              type="button"
              onClick={() => setAnswerAnyway(true)}
              className="rounded-sm text-fg-muted underline-offset-2 hover:text-fg hover:underline"
            >
              Answer anyway
            </button>
          </p>
        ) : (
          <AnswerBox
            item={item}
            draftKey={draftKey}
            busy={busy}
            onSubmit={submit}
            autoFocus={answerAnyway}
          />
        )}
      </div>
    </li>
  );
}

function Sep() {
  return (
    <span aria-hidden className="text-fg-faint/70">
      ·
    </span>
  );
}

function AnsweredState({ answer }: { answer: LocalAnswer }) {
  return (
    <div data-wf="NeedsYouAnswered" role="status" className="mt-2 flex flex-col gap-1.5">
      <blockquote className="border-l-2 border-border-strong pl-2.5 text-base whitespace-pre-wrap text-fg">
        {answer.answer}
      </blockquote>
      <p className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-sm text-fg-faint">
        <span className="font-medium text-status-done">Answered</span>
        <span>by</span>
        <AuthorChip handle={answer.by} size="xs" />
        <Sep />
        <TimeAgo ts={answer.at} />
      </p>
      <p className="text-sm text-fg-faint">
        Waiting for the agent to pick the answer up. <SkillLink skill="doing-next-step" /> resolves
        it first.
      </p>
    </div>
  );
}

// ---------------------------------------------------------------- answer box

function capitalize(s: string): string {
  return s ? s[0].toUpperCase() + s.slice(1) : s;
}

const PRIMARY_OPTION = /^(approve|approved|yes|accept|keep|ok|go)\b/i;

function primaryOption(item: NeedsYouItem): number {
  const i = item.options.findIndex((o) => PRIMARY_OPTION.test(o.trim()));
  if (i >= 0) return i;
  return item.kind === "approval" ? 0 : -1;
}

function AnswerBox({
  item,
  draftKey,
  busy,
  onSubmit,
  autoFocus,
}: {
  item: NeedsYouItem;
  draftKey: string;
  busy: boolean;
  onSubmit: (answer: string) => void;
  autoFocus: boolean;
}) {
  const [text, setText] = useState(() => drafts.get(draftKey) ?? "");
  const hasOptions = item.options.length > 0;
  const [noteOpen, setNoteOpen] = useState(() => hasOptions && text !== "");
  const primary = primaryOption(item);

  const update = (v: string) => {
    setText(v);
    if (v) drafts.set(draftKey, v);
    else drafts.delete(draftKey);
  };

  if (hasOptions) {
    const note = text.trim();
    return (
      <div data-wf="AnswerBox" className="mt-2 flex flex-col gap-2">
        <div className="flex flex-wrap items-center gap-1.5">
          {item.options.map((option, i) => (
            <Button
              key={option}
              size="sm"
              data-primary={i === primary ? "" : undefined}
              variant={i === primary ? "primary" : "secondary"}
              disabled={busy}
              onClick={() => onSubmit(note ? `${option} — ${note}` : option)}
            >
              {capitalize(option)}
            </Button>
          ))}
          {!noteOpen && (
            <Button size="sm" variant="ghost" disabled={busy} onClick={() => setNoteOpen(true)}>
              <PenLine size={14} strokeWidth={1.75} aria-hidden />
              Add a note
            </Button>
          )}
        </div>
        {noteOpen && (
          <AutoGrowTextarea
            value={text}
            onChange={update}
            placeholder="Add a note for the agent (optional)"
            ariaLabel={`Note for ${item.id}`}
            autoFocus
            disabled={busy}
          />
        )}
      </div>
    );
  }

  const canSend = text.trim() !== "" && !busy;
  const send = () => {
    if (canSend) onSubmit(text);
  };
  return (
    <div
      data-wf="AnswerBox"
      className="mt-2 rounded-md border border-border bg-bg transition-[border-color,box-shadow] duration-100 ease-wf hover:border-border-strong focus-within:border-accent focus-within:ring-2 focus-within:ring-focus"
    >
      <AutoGrowTextarea
        value={text}
        onChange={update}
        onSubmit={send}
        placeholder={item.kind === "input" ? "Type the value the agent needs" : "Write an answer"}
        ariaLabel={`Answer for ${item.id}`}
        autoFocus={autoFocus}
        disabled={busy}
        bare
      />
      <div className="flex items-center justify-end gap-2 px-2 pb-2">
        <span className="inline-flex items-center gap-1 text-xs text-fg-faint">
          <Kbd combo="mod+Enter" /> to send
        </span>
        <Button size="sm" variant="primary" disabled={!canSend} onClick={send}>
          {busy ? "Sending…" : "Send"}
        </Button>
      </div>
    </div>
  );
}

const MAX_TEXTAREA_PX = 200;

function AutoGrowTextarea({
  value,
  onChange,
  onSubmit,
  placeholder,
  ariaLabel,
  autoFocus,
  disabled,
  bare = false,
}: {
  value: string;
  onChange: (v: string) => void;
  onSubmit?: () => void;
  placeholder: string;
  ariaLabel: string;
  autoFocus?: boolean;
  disabled?: boolean;
  bare?: boolean;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);

  // biome-ignore lint/correctness/useExhaustiveDependencies: re-measure when the text changes
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    const h = Math.min(el.scrollHeight, MAX_TEXTAREA_PX);
    el.style.height = `${h}px`;
    el.style.overflowY = el.scrollHeight > MAX_TEXTAREA_PX ? "auto" : "hidden";
  }, [value]);

  useEffect(() => {
    if (autoFocus) ref.current?.focus();
  }, [autoFocus]);

  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey) && onSubmit) {
      e.preventDefault();
      onSubmit();
    }
  };

  return (
    <Textarea
      ref={ref}
      rows={2}
      value={value}
      disabled={disabled}
      placeholder={placeholder}
      aria-label={ariaLabel}
      onChange={(e: ChangeEvent<HTMLTextAreaElement>) => onChange(e.target.value)}
      onKeyDown={onKeyDown}
      className={cn(
        "block min-h-0 w-full resize-none text-base",
        bare &&
          "rounded-none border-0 bg-transparent px-2.5 pt-2 pb-1 hover:border-0 focus-visible:ring-0",
      )}
    />
  );
}
