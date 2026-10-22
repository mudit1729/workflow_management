// One needs-you request in the inbox, with its answer box inline. Answering never leaves the row.
import {
  CircleCheck,
  Link2,
  type LucideIcon,
  MessageCircleQuestionMark,
  PenLine,
  ShieldCheck,
  TextCursorInput,
} from "lucide-react";
import { Fragment, type KeyboardEvent, useId, useState } from "react";
import { toast } from "sonner";
import { AuthorChip, RefLink, useNow } from "@/components/common";
import { Button, Chip, Kbd, Textarea, Tooltip } from "@/components/ui";
import type { NeedsYouItem, RequestKind } from "@/gen/types";
import { useAnswerRequest, useMe } from "@/lib/api";
import { cn } from "@/lib/cn";
import { absolute, hoursSince, relativeShort } from "@/lib/format";
import { useOpenIssue } from "@/lib/nav";

const KIND: Record<RequestKind, { icon: LucideIcon; label: string }> = {
  question: { icon: MessageCircleQuestionMark, label: "Question" },
  approval: { icon: ShieldCheck, label: "Approval" },
  input: { icon: TextCursorInput, label: "Input" },
};

/** A blocking request that waits longer than this shows its age in amber. */
const BLOCKING_AGE_HOURS = 4;

// Unsent answers survive tab switches and live updates, keyed by request.
const drafts = new Map<string, string>();

export interface InboxRowProps {
  item: NeedsYouItem;
}

export function InboxRow({ item }: InboxRowProps) {
  const me = useMe();
  const answerRequest = useAnswerRequest();
  const openIssue = useOpenIssue();
  const now = useNow();
  const questionId = useId();
  const [local, setLocal] = useState<Answer | null>(null);
  const [busy, setBusy] = useState(false);
  const [answerAnyway, setAnswerAnyway] = useState(false);

  const draftKey = `${item.issue}/${item.id}`;
  const answer: Answer | null = item.answered
    ? {
        text: item.answer ?? local?.text ?? "",
        by: item.answered_by ?? local?.by ?? item.to,
        at: item.answered_at ?? local?.at ?? item.asked,
      }
    : local;

  const { icon: Icon, label: kindLabel } = KIND[item.kind];
  const blocking = item.urgency === "blocking";
  const waitingLong = blocking && !answer && hoursSince(item.asked, now) > BLOCKING_AGE_HOURS;
  const forSomeoneElse = Boolean(me) && item.to !== me;
  const refTarget = item.ref?.replace(/^\[\[|\]\]$/g, "");

  const submit = async (text: string) => {
    const value = text.trim();
    if (!value || busy) return;
    setBusy(true);
    setLocal({ text: value, by: me || item.to, at: new Date().toISOString() });
    try {
      const result = await answerRequest({
        issue: item.issue,
        id: item.id,
        answer: value,
        base_rev: item.edit.rev,
      });
      if (result) {
        drafts.delete(draftKey);
        toast.success("Answer sent", {
          description: `${item.id} waits for the agent to run wf resolve.`,
        });
      } else {
        setLocal(null);
      }
    } catch {
      setLocal(null);
    } finally {
      setBusy(false);
    }
  };

  return (
    <li
      data-wf="InboxRow"
      data-urgency={item.urgency}
      data-answered={answer ? "" : undefined}
      aria-labelledby={questionId}
      className="flex gap-3 px-4 py-3"
    >
      <span
        className={cn(
          "mt-px flex size-6 shrink-0 items-center justify-center rounded-md",
          answer
            ? "text-status-done"
            : blocking
              ? "bg-accent-subtle text-accent"
              : "bg-muted text-fg-muted",
        )}
      >
        {answer ? (
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
              "line-clamp-2 min-w-0 flex-1 font-medium text-base leading-6",
              answer ? "text-fg-muted" : "text-fg",
            )}
          >
            <InlineCode text={item.question} />
          </p>
          {!answer && (
            <span className="mt-0.5 shrink-0">
              {blocking ? (
                <Chip
                  tone="accent"
                  icon={<span aria-hidden className="size-1.5 rounded-full bg-accent" />}
                  title="The agent is waiting for this answer"
                >
                  Blocking
                </Chip>
              ) : (
                <Chip title="For your information. Work continues.">FYI</Chip>
              )}
            </span>
          )}
        </div>

        <p className="mt-0.5 flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-fg-faint text-sm">
          <button
            type="button"
            onClick={() => void openIssue(item.issue, { tab: "now" })}
            title={`Open ${item.issue}`}
            className="max-w-[34ch] cursor-default truncate rounded-sm text-fg-muted underline-offset-2 hover:text-fg hover:underline"
          >
            {item.issue_title}
          </button>
          <Sep />
          <span className="inline-flex items-center gap-1">
            <AuthorChip handle={item.from} size="xs" variant="text" />
            <span aria-hidden>→</span>
            <span className="sr-only">to</span>
            <AuthorChip handle={item.to} size="xs" variant="text" />
          </span>
          <Sep />
          <span className={cn(waitingLong && "text-stale-text")}>
            <Ago ts={item.asked} now={now} />
          </span>
          <Sep />
          <span className="font-mono text-xs">{item.id}</span>
          {refTarget && (
            <>
              <Sep />
              <span className="inline-flex min-w-0 items-center gap-1">
                <Link2 size={14} strokeWidth={1.75} aria-hidden className="shrink-0" />
                <span className="sr-only">Related:</span>
                <RefLink target={refTarget} issueId={item.issue} />
              </span>
            </>
          )}
        </p>

        {answer ? (
          <AnsweredState answer={answer} now={now} />
        ) : forSomeoneElse && !answerAnyway ? (
          <p className="mt-2 flex flex-wrap items-center gap-x-1.5 text-fg-faint text-sm">
            <span className="inline-flex items-center gap-1">
              For <AuthorChip handle={item.to} size="xs" />
            </span>
            <Sep />
            <button
              type="button"
              onClick={() => setAnswerAnyway(true)}
              className="cursor-default rounded-sm text-fg-muted underline-offset-2 hover:text-fg hover:underline"
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

interface Answer {
  text: string;
  by: string;
  at: string;
}

function Sep() {
  return (
    <span aria-hidden className="text-fg-faint/70">
      ·
    </span>
  );
}

/** "12m ago", "just now", "on Oct 9". The exact time is in the tooltip. */
function Ago({ ts, now }: { ts: string; now: number }) {
  const short = relativeShort(ts, now);
  const text =
    short === "now"
      ? "just now"
      : short.startsWith("in ")
        ? short
        : /^\d+[mhd]$/.test(short)
          ? `${short} ago`
          : `on ${short}`;
  return (
    <Tooltip content={absolute(ts)}>
      <time dateTime={ts} className="tabular">
        {text}
      </time>
    </Tooltip>
  );
}

/** Text with `inline code` spans. */
function InlineCode({ text }: { text: string }) {
  return (
    <>
      {text.split("`").map((part, i) =>
        i % 2 === 1 ? (
          <code key={i} className="rounded-sm bg-muted px-1 py-px font-mono text-fg text-sm">
            {part}
          </code>
        ) : (
          <Fragment key={i}>{part}</Fragment>
        ),
      )}
    </>
  );
}

// ---------------------------------------------------------------- answered

function AnsweredState({ answer, now }: { answer: Answer; now: number }) {
  return (
    <div data-wf="InboxAnswered" className="mt-2 flex flex-col gap-1.5">
      <blockquote className="whitespace-pre-wrap border-border-strong border-l-2 pl-2.5 text-base text-fg">
        {answer.text}
      </blockquote>
      <p className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-fg-faint text-sm">
        <span className="font-medium text-status-done">Answered</span>
        <span>by</span>
        <AuthorChip handle={answer.by} size="xs" />
        <Sep />
        <Ago ts={answer.at} now={now} />
      </p>
      <p className="text-fg-faint text-sm">
        Waiting for the agent to run{" "}
        <code className="rounded-sm bg-muted px-1 py-px font-mono text-fg-muted text-xs">
          wf resolve
        </code>
        .
      </p>
    </div>
  );
}

// ---------------------------------------------------------------- answer box

const PRIMARY_OPTION = /^(approve|approved|yes|accept|keep|ok|go)\b/i;

function capitalize(s: string): string {
  return s ? s[0].toUpperCase() + s.slice(1) : s;
}

/** The option that gets the primary button: "approve" and friends, else the first of an approval. */
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

  const update = (value: string) => {
    setText(value);
    if (value) drafts.set(draftKey, value);
    else drafts.delete(draftKey);
  };

  if (hasOptions) {
    const note = text.trim();
    return (
      <div data-wf="InboxAnswerBox" className="mt-2.5 flex flex-col gap-2">
        <div className="flex flex-wrap items-center gap-1.5">
          {item.options.map((option, i) => (
            <Button
              key={option}
              size="sm"
              variant={i === primary ? "primary" : "secondary"}
              disabled={busy}
              onClick={() => onSubmit(note ? `${option} — ${note}` : option)}
            >
              {capitalize(option)}
            </Button>
          ))}
          {!noteOpen && (
            <Button size="sm" variant="ghost" disabled={busy} onClick={() => setNoteOpen(true)}>
              <PenLine aria-hidden size={14} strokeWidth={1.75} />
              Add a note
            </Button>
          )}
        </div>
        {noteOpen && (
          <Textarea
            value={text}
            disabled={busy}
            autoFocus
            rows={2}
            placeholder="Add a note for the agent (optional)"
            aria-label={`Note for ${item.id}`}
            onChange={(e) => update(e.target.value)}
            className="min-h-[52px]"
          />
        )}
      </div>
    );
  }

  const canSend = text.trim() !== "" && !busy;
  const send = () => {
    if (canSend) onSubmit(text);
  };
  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      send();
    }
  };
  return (
    <div
      data-wf="InboxAnswerBox"
      className="mt-2.5 rounded-md border border-border bg-bg transition-[border-color,box-shadow] duration-100 ease-wf focus-within:border-accent focus-within:ring-2 focus-within:ring-focus hover:border-border-strong"
    >
      <Textarea
        value={text}
        disabled={busy}
        autoFocus={autoFocus}
        rows={2}
        placeholder={item.kind === "input" ? "Type the value the agent needs" : "Write an answer"}
        aria-label={`Answer for ${item.id}`}
        onChange={(e) => update(e.target.value)}
        onKeyDown={onKeyDown}
        className="min-h-[52px] rounded-none border-0 bg-transparent px-2.5 pt-2 pb-1 hover:border-0 focus-visible:ring-0"
      />
      <div className="flex items-center justify-end gap-2 px-2 pb-2">
        <span className="inline-flex items-center gap-1 text-fg-faint text-xs">
          <Kbd combo="mod+Enter" /> to send
        </span>
        <Button size="sm" variant="primary" disabled={!canSend} onClick={send}>
          {busy ? "Sending…" : "Send"}
        </Button>
      </div>
    </div>
  );
}
