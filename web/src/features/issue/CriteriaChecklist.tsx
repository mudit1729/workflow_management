// Success criteria checklist (goal.md `## Success criteria`). Verified versus
// claimed is the honest progress signal: a UI tick only claims a criterion,
// evidence from `wf check` verifies it.
import {
  ArrowUpRight,
  Check,
  ChevronDown,
  Hand,
  ListChecks,
  Paperclip,
  Terminal,
} from "lucide-react";
import {
  Fragment,
  type MouseEvent,
  type ReactNode,
  useEffect,
  useId,
  useMemo,
  useState,
} from "react";
import {
  AuthorChip,
  CopyButton,
  copyText,
  EmptyState,
  ProgressRing,
  RefLink,
} from "@/components/common";
import {
  Button,
  Checkbox,
  Chip,
  Popover,
  PopoverAnchor,
  PopoverContent,
  Tooltip,
} from "@/components/ui";
import type { Criterion, CriterionState, DocFile, EarsInfo, Plan, Task } from "@/gen/types";
import { useIssue, useToggleCriterion } from "@/lib/api";
import { cn } from "@/lib/cn";
import { TaskPill } from "./TaskPill";

// ---------------------------------------------------------------- inline text

type Segment =
  | { kind: "text"; text: string; code: boolean; bold: boolean; keyword: boolean }
  | { kind: "ref"; target: string }
  | { kind: "handle"; handle: string };

const HANDLE = /^@([a-z0-9][a-z0-9._-]*)/;

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Index of the whole-word match of `word` closest to `around`, or -1. */
function nearestWord(lower: string, word: string, around: number): number {
  let best = -1;
  let distance = Number.POSITIVE_INFINITY;
  for (const m of lower.matchAll(new RegExp(`\\b${escapeRegExp(word)}\\b`, "g"))) {
    const d = Math.abs(m.index - around);
    if (d < distance) {
      best = m.index;
      distance = d;
    }
  }
  return best;
}

/** Marks the characters of each EARS keyword. Tolerates offsets that drifted (bytes, backticks). */
function keywordMask(text: string, keywords: EarsInfo["keywords"] | undefined): boolean[] {
  const mask = new Array<boolean>(text.length).fill(false);
  if (!keywords?.length) return mask;
  const lower = text.toLowerCase();
  for (const k of keywords) {
    const word = k.word.toLowerCase();
    const start =
      lower.slice(k.start, k.start + word.length) === word
        ? k.start
        : nearestWord(lower, word, k.start);
    if (start < 0) continue;
    for (let i = start; i < start + word.length; i++) mask[i] = true;
  }
  return mask;
}

/** A tiny inline-markdown pass: `code`, **bold**, [[refs]], @handles and keyword spans. */
function segment(text: string, mask: boolean[]): Segment[] {
  const out: Segment[] = [];
  let code = false;
  let bold = false;
  let keyword = false;
  let buf = "";
  const flush = () => {
    if (buf) out.push({ kind: "text", text: buf, code, bold, keyword });
    buf = "";
  };
  let i = 0;
  while (i < text.length) {
    if (!code && text.startsWith("[[", i)) {
      const end = text.indexOf("]]", i + 2);
      if (end > i + 2) {
        flush();
        out.push({ kind: "ref", target: text.slice(i + 2, end) });
        i = end + 2;
        continue;
      }
    }
    if (!code && text[i] === "@" && (i === 0 || /[\s(]/.test(text[i - 1]))) {
      const m = text.slice(i).match(HANDLE);
      if (m) {
        const handle = m[1].replace(/[._-]+$/, "");
        flush();
        out.push({ kind: "handle", handle });
        i += handle.length + 1;
        continue;
      }
    }
    if (text[i] === "`" && (code || text.indexOf("`", i + 1) > i)) {
      flush();
      code = !code;
      i += 1;
      continue;
    }
    if (!code && text.startsWith("**", i) && (bold || text.indexOf("**", i + 2) > i + 1)) {
      flush();
      bold = !bold;
      i += 2;
      continue;
    }
    const kw = !code && mask[i] === true;
    if (kw !== keyword) {
      flush();
      keyword = kw;
    }
    buf += text[i];
    i += 1;
  }
  flush();
  return out;
}

export interface InlineTextProps {
  text: string;
  /** EARS keyword spans, rendered in faint small caps. */
  keywords?: EarsInfo["keywords"];
  issueId?: string;
  /** Extra classes for `code` spans (Failed attempts tint them danger). */
  codeClassName?: string;
  className?: string;
}

/** One line of inline markdown, without paragraph spacing. */
export function InlineText({ text, keywords, issueId, codeClassName, className }: InlineTextProps) {
  const segments = useMemo(() => segment(text, keywordMask(text, keywords)), [text, keywords]);
  return (
    <span className={className}>
      {segments.map((s, i) => {
        if (s.kind === "ref") return <RefLink key={i} target={s.target} issueId={issueId} />;
        if (s.kind === "handle")
          return <AuthorChip key={i} handle={s.handle} size="xs" variant="text" />;
        if (s.code)
          return (
            <code
              key={i}
              className={cn(
                "rounded-sm bg-muted px-1 py-px font-mono text-[0.9em] text-fg",
                codeClassName,
              )}
            >
              {s.text}
            </code>
          );
        if (s.bold || s.keyword)
          return (
            <span
              key={i}
              className={cn(s.bold && "font-semibold", s.keyword && "small-caps text-fg-faint")}
            >
              {s.text}
            </span>
          );
        return <Fragment key={i}>{s.text}</Fragment>;
      })}
    </span>
  );
}

// ---------------------------------------------------------------- checklist

/** Amber used for text: darkened toward the text color so it stays readable (as Chip does). */
export const STALE_TEXT = "text-[color-mix(in_srgb,var(--wf-signal-stale)_78%,var(--wf-text))]";

export interface CriteriaChecklistProps {
  criteria: Criterion[];
  issueId: string;
}

type PopoverMode = "claimed" | "confirm";

// The "claimed" hint shows once per page load: it teaches, then gets out of the way.
let claimedHintShown = false;

// Same hatch as the criterion checkbox, so the legend reads as a key for it.
const SWATCH_HATCH = {
  backgroundImage:
    "repeating-linear-gradient(45deg, color-mix(in srgb, var(--wf-status-done) 45%, transparent) 0 2px, transparent 2px 4px)",
};

const STATE_TITLE: Record<CriterionState, string> = {
  open: "Open",
  claimed: "Claimed: ticked without evidence (Q010)",
  verified: "Verified: evidence recorded",
};

function stripTicks(s: string): string {
  return s.replace(/`/g, "").trim();
}

function taskIndex(plan: Plan | null | undefined): Map<string, Task> {
  const map = new Map<string, Task>();
  for (const phase of plan?.phases ?? []) for (const t of phase.tasks) map.set(t.id, t);
  return map;
}

function effective(
  c: Criterion,
  pending: boolean | undefined,
): {
  checked: boolean;
  state: CriterionState;
} {
  if (pending === undefined || pending === c.checked) return { checked: c.checked, state: c.state };
  if (!pending) return { checked: false, state: "open" };
  return { checked: true, state: c.evidence ? "verified" : "claimed" };
}

export function CriteriaChecklist({ criteria, issueId }: CriteriaChecklistProps) {
  const toggle = useToggleCriterion(issueId);
  const { data: detail } = useIssue(issueId);
  const tasks = useMemo(() => taskIndex(detail?.plan), [detail?.plan]);
  const docs = detail?.docs ?? [];

  // Optimistic ticks, kept until the data shows the same value or the write fails.
  const [pending, setPending] = useState<Record<string, boolean>>({});
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(() => new Set());
  const [popover, setPopover] = useState<{ id: string; mode: PopoverMode } | null>(null);

  useEffect(() => {
    setPending((prev) => {
      let changed = false;
      const next = { ...prev };
      for (const c of criteria) {
        if (next[c.id] !== undefined && next[c.id] === c.checked) {
          delete next[c.id];
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, [criteria]);

  const rows = criteria.map((c) => ({ c, ...effective(c, pending[c.id]) }));
  const verified = rows.filter((r) => r.state === "verified").length;
  const claimed = rows.filter((r) => r.state === "claimed").length;
  const open = rows.length - verified - claimed;

  const commit = async (c: Criterion, checked: boolean) => {
    setPending((p) => ({ ...p, [c.id]: checked }));
    const result = await toggle({ id: c.id, checked, base_rev: c.edit.rev }).catch(() => undefined);
    if (!result) {
      // The write failed (409 conflict, 422): roll the tick back and say nothing more.
      setPending((p) => {
        const { [c.id]: _dropped, ...rest } = p;
        return rest;
      });
      return;
    }
    // Teach the claimed state only once the tick has actually been saved, and only once.
    if (checked && !c.evidence && !claimedHintShown) {
      claimedHintShown = true;
      setPopover({ id: c.id, mode: "claimed" });
    }
  };

  const onToggle = (c: Criterion, state: CriterionState, checked: boolean) => {
    // Unticking a verified criterion drops its evidence: ask first.
    if (!checked && state === "verified") {
      setPopover({ id: c.id, mode: "confirm" });
      return;
    }
    void commit(c, checked);
  };

  const toggleExpanded = (id: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  if (criteria.length === 0) {
    return (
      <div data-wf="CriteriaChecklist">
        <EmptyState
          compact
          icon={<ListChecks strokeWidth={1.75} />}
          title="No success criteria"
          hint="Each criterion is one testable sentence. Evidence turns a tick into a verified result."
          skill="write-goal"
        />
      </div>
    );
  }

  return (
    <div data-wf="CriteriaChecklist" className="flex flex-col">
      <div className="flex items-center gap-3 pb-2">
        <ProgressRing
          verified={verified}
          claimed={claimed}
          total={criteria.length}
          size={28}
          label
        />
        <p
          data-wf="CriteriaLegend"
          className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-fg-muted"
        >
          <LegendItem count={verified} label="verified">
            <span aria-hidden className="size-2 rounded-[2px] bg-status-done" />
          </LegendItem>
          <LegendItem count={claimed} label="claimed">
            <span
              aria-hidden
              className="size-2 rounded-[2px] border border-status-done"
              style={SWATCH_HATCH}
            />
          </LegendItem>
          <LegendItem count={open} label="open">
            <span aria-hidden className="size-2 rounded-[2px] border border-border-strong" />
          </LegendItem>
        </p>
      </div>

      <ul aria-label="Success criteria" className="-mx-2 flex flex-col">
        {rows.map(({ c, checked, state }) => (
          <CriterionRow
            key={c.id}
            criterion={c}
            checked={checked}
            state={state}
            issueId={issueId}
            tasks={tasks}
            docs={docs}
            expanded={expanded.has(c.id)}
            onExpand={() => toggleExpanded(c.id)}
            onToggle={(next) => onToggle(c, state, next)}
            popover={popover?.id === c.id ? popover.mode : null}
            onPopoverClose={() => setPopover(null)}
            onConfirmUntick={() => {
              setPopover(null);
              void commit(c, false);
            }}
          />
        ))}
      </ul>
    </div>
  );
}

function LegendItem({
  count,
  label,
  children,
}: {
  count: number;
  label: string;
  children: ReactNode;
}) {
  return (
    <span className="inline-flex items-center gap-1.5">
      {children}
      <span>
        <span className="tabular font-medium text-fg">{count}</span> {label}
      </span>
    </span>
  );
}

// ---------------------------------------------------------------- row

interface CriterionRowProps {
  criterion: Criterion;
  checked: boolean;
  state: CriterionState;
  issueId: string;
  tasks: Map<string, Task>;
  docs: DocFile[];
  expanded: boolean;
  onExpand: () => void;
  onToggle: (checked: boolean) => void;
  popover: PopoverMode | null;
  onPopoverClose: () => void;
  onConfirmUntick: () => void;
}

function CriterionRow({
  criterion: c,
  checked,
  state,
  issueId,
  tasks,
  docs,
  expanded,
  onExpand,
  onToggle,
  popover,
  onPopoverClose,
  onConfirmUntick,
}: CriterionRowProps) {
  const detailId = useId();

  const onRowClick = (e: MouseEvent<HTMLDivElement>) => {
    const target = e.target as HTMLElement;
    if (target.closest("button, a, input, textarea, [role='checkbox'], [data-no-expand]")) return;
    if (window.getSelection()?.toString()) return; // selecting text, not expanding
    onExpand();
  };

  return (
    <li data-wf="CriterionRow" data-state={state}>
      <div
        onClick={onRowClick}
        className={cn(
          "group/row flex cursor-pointer items-start gap-2.5 rounded-md px-2 py-2 transition-colors duration-100 ease-wf",
          expanded ? "bg-subtle" : "hover:bg-subtle",
        )}
      >
        <Popover
          open={popover !== null}
          onOpenChange={(o: boolean) => {
            if (!o) onPopoverClose();
          }}
        >
          <PopoverAnchor asChild>
            <span className="mt-0.5 inline-flex shrink-0">
              <Checkbox
                variant="criterion"
                state={state}
                checked={checked}
                onCheckedChange={(v: boolean) => onToggle(v)}
                title={STATE_TITLE[state]}
                aria-label={`${c.id}: ${checked ? "untick" : "tick"} criterion`}
              />
            </span>
          </PopoverAnchor>
          <PopoverContent
            side="bottom"
            align="start"
            onOpenAutoFocus={(e: Event) => {
              if (popover === "claimed") e.preventDefault();
            }}
            className="text-sm"
          >
            {popover === "confirm" ? (
              <UntickConfirm criterion={c} onCancel={onPopoverClose} onConfirm={onConfirmUntick} />
            ) : (
              <ClaimedHint criterion={c} issueId={issueId} onDone={onPopoverClose} />
            )}
          </PopoverContent>
        </Popover>

        <span className="mt-px w-10 shrink-0 font-mono text-xs leading-5 text-fg-faint tabular">
          {c.id}
        </span>

        <div className="min-w-0 flex-1">
          <p className="text-base text-fg">
            <InlineText text={c.text} keywords={c.ears.keywords} issueId={issueId} />
          </p>
          <CriterionChips criterion={c} state={state} docs={docs} issueId={issueId} />
          {expanded && <CriterionDetail id={detailId} criterion={c} tasks={tasks} />}
        </div>

        <button
          type="button"
          onClick={onExpand}
          aria-expanded={expanded}
          aria-controls={expanded ? detailId : undefined}
          aria-label={`${expanded ? "Hide" : "Show"} details for ${c.id}`}
          className={cn(
            "mt-px flex size-5 shrink-0 items-center justify-center rounded-sm text-fg-faint transition-opacity duration-100 ease-wf hover:bg-muted hover:text-fg-muted focus-visible:opacity-100",
            expanded ? "opacity-100" : "opacity-0 group-hover/row:opacity-100",
          )}
        >
          <ChevronDown
            size={14}
            strokeWidth={1.75}
            className={cn("transition-transform duration-150 ease-wf", expanded && "rotate-180")}
          />
        </button>
      </div>
    </li>
  );
}

// ---------------------------------------------------------------- chips

function CriterionChips({
  criterion: c,
  state,
  docs,
  issueId,
}: {
  criterion: Criterion;
  state: CriterionState;
  docs: DocFile[];
  issueId: string;
}) {
  const verify = c.verify ? stripTicks(c.verify) : undefined;
  const manual = verify?.toLowerCase() === "manual";
  const freeform = c.ears.pattern === "freeform";
  const notMeasurable = !c.ears.measurable;
  const showVerifiedBy = state === "verified" && c.verified_by;
  if (!verify && !c.evidence && !showVerifiedBy && !freeform && !notMeasurable) return null;

  return (
    <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
      {verify &&
        (manual ? (
          <Chip
            data-wf="ManualCheckChip"
            size="sm"
            tone="neutral"
            icon={<Hand size={12} strokeWidth={1.75} />}
            title="A person checks this one by hand"
          >
            Manual check
          </Chip>
        ) : (
          <VerifyCommand command={verify} />
        ))}
      {c.evidence && <EvidenceChip evidence={c.evidence} docs={docs} issueId={issueId} />}
      {showVerifiedBy && c.verified_by && (
        <span data-wf="VerifiedBy" className="inline-flex items-center gap-1 text-xs text-fg-faint">
          Verified by <AuthorChip handle={c.verified_by} size="xs" />
        </span>
      )}
      {freeform && (
        <Chip
          data-wf="NotEarsChip"
          size="sm"
          tone="outline"
          className="font-normal text-fg-faint"
          title="S08 · This sentence does not follow an EARS pattern. Start with When, While, If, Where or “The system shall”."
        >
          Not EARS (S08)
        </Chip>
      )}
      {notMeasurable && (
        <Chip
          data-wf="NotMeasurableChip"
          size="sm"
          tone="outline"
          className="font-normal text-fg-faint"
          title="S07 · Nothing here can be measured. Add a number with a unit, a date, a literal in backticks, or a verify command."
        >
          Not measurable (S07)
        </Chip>
      )}
    </div>
  );
}

const CHIP_BUTTON =
  "inline-flex h-5 max-w-full items-center gap-1 rounded-sm border border-border bg-bg px-1.5 text-xs text-fg-muted transition-colors duration-100 ease-wf hover:bg-muted hover:text-fg";

function VerifyCommand({ command }: { command: string }) {
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    if (!copied) return;
    const t = setTimeout(() => setCopied(false), 1400);
    return () => clearTimeout(t);
  }, [copied]);

  const copy = async () => {
    if (await copyText(command)) setCopied(true);
  };

  return (
    <Tooltip content={copied ? "Copied" : "Copy the verify command"}>
      <button
        type="button"
        data-wf="VerifyChip"
        onClick={() => void copy()}
        aria-label={`Copy verify command: ${command}`}
        className={cn(CHIP_BUTTON, "max-w-[min(100%,320px)] font-mono")}
      >
        {copied ? (
          <Check size={12} strokeWidth={1.75} className="shrink-0 text-status-done" />
        ) : (
          <Terminal size={12} strokeWidth={1.75} className="shrink-0 text-fg-faint" />
        )}
        <span className="truncate">{command}</span>
        <span className="sr-only" aria-live="polite">
          {copied ? "Copied" : ""}
        </span>
      </button>
    </Tooltip>
  );
}

function EvidenceChip({
  evidence,
  docs,
  issueId,
}: {
  evidence: string;
  docs: DocFile[];
  issueId: string;
}) {
  const doc = docs.find((d) => evidence.includes(d.path));
  return (
    <span
      data-wf="EvidenceChip"
      title={`Evidence: ${evidence.replace(/`|\[\[|\]\]/g, "")}`}
      className="inline-flex h-5 max-w-[min(100%,360px)] items-center gap-1 rounded-sm border border-border px-1.5 text-xs text-fg-muted"
    >
      <Paperclip size={12} strokeWidth={1.75} aria-hidden className="shrink-0 text-fg-faint" />
      <span className="sr-only">Evidence: </span>
      <InlineText text={evidence} issueId={issueId} className="min-w-0 truncate" />
      {doc && (
        <a
          href={doc.url}
          target="_blank"
          rel="noreferrer"
          aria-label={`Open ${doc.path}`}
          title={`Open ${doc.path}`}
          className="-mr-1 flex size-4 shrink-0 items-center justify-center rounded-sm text-fg-faint hover:bg-muted hover:text-fg"
        >
          <ArrowUpRight size={12} strokeWidth={1.75} />
        </a>
      )}
    </span>
  );
}

// ---------------------------------------------------------------- expanded detail

function CriterionDetail({
  id,
  criterion: c,
  tasks,
}: {
  id: string;
  criterion: Criterion;
  tasks: Map<string, Task>;
}) {
  const file = c.edit.file.split("/").pop() ?? "goal.md";
  return (
    <div id={id} data-no-expand className="mt-3 flex cursor-auto flex-col gap-3 pb-1">
      {c.scenario && (
        <div>
          <DetailLabel>Scenario</DetailLabel>
          <Scenario text={c.scenario} />
        </div>
      )}
      <div>
        <DetailLabel>Satisfied by</DetailLabel>
        {c.satisfied_by.length > 0 ? (
          <ul className="flex flex-wrap gap-1.5">
            {c.satisfied_by.map((tid) => {
              const task = tasks.get(tid);
              return (
                <li key={tid} className="min-w-0 max-w-full">
                  {task ? (
                    <TaskPill task={task} size="sm" />
                  ) : (
                    <span className="font-mono text-xs text-fg-faint">{tid}</span>
                  )}
                </li>
              );
            })}
          </ul>
        ) : (
          <p className={cn("text-sm", STALE_TEXT)}>No task covers this (Q006).</p>
        )}
      </div>
      <p className="flex items-center gap-1.5 font-mono text-xs text-fg-faint">
        <span title={c.edit.file}>{file}</span>
        <span aria-hidden>·</span>
        <span>{c.edit.anchor || c.id}</span>
        <span className="ml-1 font-sans">
          <CopyButton text={`${c.edit.file}#${c.edit.anchor || c.id}`} label="Copy location" />
        </span>
      </p>
    </div>
  );
}

function DetailLabel({ children }: { children: ReactNode }) {
  return <p className="mb-1 text-xs font-medium text-fg-faint">{children}</p>;
}

const SCENARIO_KEYWORD = /^(given|when|then|and|but)\b\s*(.*)$/i;

function Scenario({ text }: { text: string }) {
  const lines = text
    .split(/\s+\/\s+|\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  return (
    <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-2.5 gap-y-0.5 text-sm">
      {lines.map((line, i) => {
        const m = line.match(SCENARIO_KEYWORD);
        return (
          <Fragment key={i}>
            <dt className="small-caps text-fg-faint">{m ? m[1] : ""}</dt>
            <dd className="text-fg-muted">
              <InlineText text={m ? m[2] : line} />
            </dd>
          </Fragment>
        );
      })}
    </dl>
  );
}

// ---------------------------------------------------------------- popovers

function ClaimedHint({
  criterion: c,
  issueId,
  onDone,
}: {
  criterion: Criterion;
  issueId: string;
  onDone: () => void;
}) {
  const command = `wf check ${issueId} ${c.id} --evidence "…"`;
  return (
    <div data-wf="ClaimedHint" className="flex flex-col gap-2">
      <p className="font-medium text-fg">Claimed, not verified yet</p>
      <p className="text-fg-muted">
        A tick from the board is a claim. Add evidence with{" "}
        <code className="font-mono text-[0.9em] text-fg">wf check --evidence</code> to verify it.
      </p>
      <div className="flex items-center gap-1 rounded-sm border border-border bg-subtle py-1 pr-1 pl-2">
        <code className="min-w-0 flex-1 truncate font-mono text-xs text-fg">{command}</code>
        <CopyButton text={command} label="Copy command" />
      </div>
      <div className="flex justify-end">
        <Button size="sm" variant="ghost" onClick={onDone}>
          Got it
        </Button>
      </div>
    </div>
  );
}

function UntickConfirm({
  criterion: c,
  onCancel,
  onConfirm,
}: {
  criterion: Criterion;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <div data-wf="UntickConfirm" className="flex flex-col gap-2">
      <p className="font-medium text-fg">Untick {c.id}?</p>
      <p className="text-fg-muted">
        It goes back to open. Its evidence
        {c.evidence ? (
          <>
            {" "}
            (<span className="text-fg">{stripTicks(c.evidence)}</span>)
          </>
        ) : null}{" "}
        no longer counts.
      </p>
      <div className="mt-1 flex justify-end gap-1.5">
        <Button size="sm" variant="secondary" onClick={onCancel}>
          Cancel
        </Button>
        <Button size="sm" variant="danger" onClick={onConfirm}>
          Untick
        </Button>
      </div>
    </div>
  );
}
