// The change log as a timeline: newest first, grouped by day under sticky headers,
// one rail marker per entry in the author's hue (agents square, humans round).
// Filter chips narrow the list by author and by kind.
import {
  Check,
  FunnelX,
  GitCommitHorizontal,
  GitPullRequest,
  Logs,
  ShieldCheck,
  X,
} from "lucide-react";
import {
  type CSSProperties,
  type ReactNode,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { toast } from "sonner";
import { AuthorChip, EmptyState, KindIcon, MarkdownProse, RelativeTime } from "@/components/common";
import { Button, Chip, chipVariants, Tooltip } from "@/components/ui";
import type { Author, ChangeEntry, ChangeKind } from "@/gen/types";
import { useAuthors, useIssue } from "@/lib/api";
import { cn } from "@/lib/cn";
import { dayLabel, parseTs } from "@/lib/format";
import { useIssueTab } from "@/lib/nav";

const CHANGE_KIND_LABEL: Record<ChangeKind, string> = {
  progress: "Progress",
  fix: "Fix",
  refactor: "Refactor",
  docs: "Docs",
  test: "Test",
  research: "Research",
  review: "Review",
  verify: "Verify",
  failure: "Failure",
  answer: "Answer",
};

const KIND_ORDER = Object.keys(CHANGE_KIND_LABEL) as ChangeKind[];

/** Meta keys the timeline renders in their own slot. Everything else shows as faint `key: value`. */
const SHOWN_KEYS = new Set([
  "kind",
  "task",
  "criteria",
  "result",
  "evidence",
  "commit",
  "pr",
  "files",
]);
/** Known keys with no slot of their own: shown faint, but not flagged as unknown. */
const QUIET_KEYS = new Set(["session", "model"]);

/** Rail geometry, in px. Line 1 of an entry is 20 px tall; the marker sits on its center. */
const LINE1 = 20;
const MARKER = 8;
const FILES_SHOWN = 2;

export interface ChangesTimelineProps {
  changes: ChangeEntry[];
  issueId: string;
  /** Initial author filter (handles without "@"). */
  authorsFilter?: string[];
  className?: string;
}

export function ChangesTimeline({
  changes,
  issueId,
  authorsFilter,
  className,
}: ChangesTimelineProps) {
  const authors = useAuthors();
  const refs = useRefTitles(issueId);
  const { setTab } = useIssueTab();
  const [authorSel, setAuthorSel] = useState<ReadonlySet<string>>(
    () => new Set(authorsFilter ?? []),
  );
  const [kindSel, setKindSel] = useState<ReadonlySet<ChangeKind>>(() => new Set());

  const sorted = useMemo(
    () => [...changes].sort((a, b) => parseTs(b.ts) - parseTs(a.ts)),
    [changes],
  );
  const authorCounts = useMemo(() => countBy(sorted, (e) => e.author), [sorted]);
  const kindCounts = useMemo(() => countBy(sorted, (e) => e.kind), [sorted]);
  const kinds = KIND_ORDER.filter((k) => kindCounts.has(k));

  const filtering = authorSel.size > 0 || kindSel.size > 0;
  const visible = filtering
    ? sorted.filter(
        (e) =>
          (authorSel.size === 0 || authorSel.has(e.author)) &&
          (kindSel.size === 0 || kindSel.has(e.kind)),
      )
    : sorted;
  const days = groupByDay(visible);
  const fresh = useFreshIds(sorted.map((e) => e.id));

  if (changes.length === 0) {
    return (
      <div data-wf="ChangesTimeline" className={className}>
        <EmptyState
          icon={<Logs strokeWidth={1.75} />}
          title="No changes logged"
          hint="Agents append one change after each step of work, with its task, files and commit."
          skill="log-change"
          command={`wf append ${issueId} change --title "…"`}
        />
      </div>
    );
  }

  const clear = () => {
    setAuthorSel(new Set());
    setKindSel(new Set());
  };

  return (
    <div data-wf="ChangesTimeline" className={cn("min-w-0", className)}>
      <div
        data-wf="TimelineFilters"
        role="toolbar"
        aria-label="Filter changes"
        className="flex flex-wrap items-center gap-1 pt-1 pb-3"
      >
        {authorCounts.size > 1 &&
          [...authorCounts.keys()].map((h) => (
            <FilterChip
              key={h}
              pressed={authorSel.has(h)}
              count={authorCounts.get(h) ?? 0}
              icon={<AuthorChip handle={h} size="xs" variant="avatar" />}
              onClick={() => setAuthorSel((s) => toggle(s, h))}
            >
              @{h}
            </FilterChip>
          ))}
        {authorCounts.size > 1 && kinds.length > 1 && (
          <span aria-hidden className="mx-1 h-4 w-px bg-border" />
        )}
        {kinds.length > 1 &&
          kinds.map((k) => (
            <FilterChip
              key={k}
              pressed={kindSel.has(k)}
              count={kindCounts.get(k) ?? 0}
              icon={
                <KindIcon
                  kind={k}
                  size={12}
                  className={k === "failure" ? "text-danger" : "opacity-70"}
                />
              }
              onClick={() => setKindSel((s) => toggle(s, k))}
            >
              {CHANGE_KIND_LABEL[k]}
            </FilterChip>
          ))}
        {filtering && (
          <Button variant="ghost" size="sm" onClick={clear} className="h-5 px-1.5 text-xs">
            <X size={12} strokeWidth={1.75} aria-hidden />
            Clear
          </Button>
        )}
        <span className="ml-auto pl-2 text-xs text-fg-faint tabular" aria-live="polite">
          {filtering
            ? `${visible.length} of ${changes.length}`
            : `${changes.length} ${changes.length === 1 ? "change" : "changes"}`}
        </span>
      </div>

      {days.length === 0 ? (
        <div className="py-2">
          <EmptyState
            compact
            icon={<FunnelX strokeWidth={1.75} />}
            title="No changes match these filters"
            hint="Remove a filter to see more of the log."
            action={
              <Button variant="secondary" size="sm" onClick={clear}>
                Clear filters
              </Button>
            }
          />
        </div>
      ) : (
        days.map((day) => (
          <section key={day.label} aria-label={day.label}>
            <h3 className="sticky top-[var(--wf-log-sticky,0px)] z-10 flex items-baseline gap-2 border-border border-b bg-bg/90 py-1.5 font-medium text-fg-muted text-sm backdrop-blur">
              {day.label}
              <span className="font-normal text-fg-faint text-xs tabular">
                {day.entries.length}
              </span>
            </h3>
            <ol className="pt-3 pb-4">
              {day.entries.map((entry, i) => (
                <ChangeItem
                  key={entry.id}
                  entry={entry}
                  issueId={issueId}
                  author={authors.get(entry.author)}
                  first={i === 0}
                  last={i === day.entries.length - 1}
                  fresh={fresh.has(entry.id)}
                  taskTitle={entry.task ? refs.tasks.get(entry.task) : undefined}
                  criteriaText={refs.criteria}
                  onOpenTask={() => setTab("plan")}
                  onOpenCriterion={() => setTab("goal")}
                />
              ))}
            </ol>
          </section>
        ))
      )}
    </div>
  );
}

// ---------------------------------------------------------------- entry

interface ChangeItemProps {
  entry: ChangeEntry;
  issueId: string;
  author: Author | undefined;
  first: boolean;
  last: boolean;
  fresh: boolean;
  taskTitle: string | undefined;
  criteriaText: Map<string, string>;
  onOpenTask: () => void;
  onOpenCriterion: () => void;
}

function ChangeItem({
  entry,
  issueId,
  author,
  first,
  last,
  fresh,
  taskTitle,
  criteriaText,
  onOpenTask,
  onOpenCriterion,
}: ChangeItemProps) {
  const titleId = useId();
  const danger = entry.kind === "failure" || entry.result === "fail";
  const qa = entry.kind === "answer" ? parseQA(entry) : null;
  const extras = Object.entries(entry.meta).filter(
    ([k]) => !SHOWN_KEYS.has(k) && !(qa?.consumed.has(k) ?? false),
  );
  const body = qa ? qa.rest : entry.body_md.trim();
  const center = LINE1 / 2;

  return (
    <li
      data-wf="ChangeItem"
      className={cn(
        "relative grid grid-cols-[16px_minmax(0,1fr)] gap-x-2.5 rounded-md",
        !last && "pb-3",
        fresh && "wf-flash",
      )}
    >
      {!(first && last) && (
        <span
          aria-hidden
          className="absolute left-[7.5px] w-px bg-border"
          style={{ top: first ? center : 0, bottom: last ? `calc(100% - ${center}px)` : 0 }}
        />
      )}
      <span aria-hidden className="relative flex justify-center">
        <RailMarker author={author} danger={danger} />
      </span>

      <article aria-labelledby={titleId} className="min-w-0">
        <div className="flex min-h-[20px] items-start gap-1.5">
          <KindIcon
            kind={entry.kind}
            size={14}
            className={cn("mt-[3px] shrink-0", danger ? "text-danger" : "text-fg-faint")}
          />
          <h4
            id={titleId}
            className="line-clamp-2 min-w-0 flex-1 font-medium text-base text-fg leading-[20px]"
          >
            <TitleText text={entry.title} />
          </h4>
          <RelativeTime ts={entry.ts} className="shrink-0 text-fg-faint text-xs leading-[20px]" />
        </div>

        <div className="mt-0.5 flex flex-wrap items-center gap-x-1.5 gap-y-1 text-fg-muted text-sm">
          <AuthorChip handle={entry.author} variant="text" size="sm" />
          <Dot />
          <span className={cn(entry.kind === "failure" && "text-danger")}>
            {CHANGE_KIND_LABEL[entry.kind]}
          </span>
          <EntryChips
            entry={entry}
            taskTitle={taskTitle}
            criteriaText={criteriaText}
            onOpenTask={onOpenTask}
            onOpenCriterion={onOpenCriterion}
          />
        </div>

        {qa && <QAPair q={qa.q} a={qa.a} by={qa.by} issueId={issueId} />}
        {body && <ClampedProse className="mt-1.5" md={body} issueId={issueId} />}
        {entry.evidence && (
          <div className="mt-1.5 flex items-start gap-1.5 text-sm">
            <ShieldCheck
              size={14}
              strokeWidth={1.75}
              className="mt-[2.5px] shrink-0 text-fg-faint"
              aria-hidden
            />
            <span className="shrink-0 text-fg-faint leading-[19px]">Evidence</span>
            <MarkdownProse
              md={entry.evidence}
              issueId={issueId}
              compact
              className="min-w-0 text-fg-muted text-sm"
            />
          </div>
        )}
        {extras.length > 0 && (
          <dl className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-fg-faint text-xs">
            {extras.map(([k, v]) => (
              <div
                key={k}
                className="min-w-0 truncate"
                title={QUIET_KEYS.has(k) ? undefined : "Unknown key, kept as written (F006)"}
              >
                <dt className="inline font-mono">{k}:</dt> <dd className="inline">{v}</dd>
              </div>
            ))}
          </dl>
        )}
      </article>
    </li>
  );
}

function RailMarker({ author, danger }: { author: Author | undefined; danger: boolean }) {
  const agent = author?.kind === "agent";
  const color = author ? `var(--wf-hue-${author.color})` : "var(--wf-text-faint)";
  const style: CSSProperties = {
    width: MARKER,
    height: MARKER,
    marginTop: (LINE1 - MARKER) / 2,
    background: color,
    borderRadius: agent ? 2 : 9999,
    // Knock the rail line out around the marker; failures get a danger ring.
    boxShadow: danger
      ? "0 0 0 2px var(--wf-bg), 0 0 0 3.5px var(--wf-signal-danger)"
      : "0 0 0 3px var(--wf-bg)",
  };
  return <span className="block" style={style} />;
}

function EntryChips({
  entry,
  taskTitle,
  criteriaText,
  onOpenTask,
  onOpenCriterion,
}: {
  entry: ChangeEntry;
  taskTitle: string | undefined;
  criteriaText: Map<string, string>;
  onOpenTask: () => void;
  onOpenCriterion: () => void;
}) {
  const chips: ReactNode[] = [];
  if (entry.task) {
    chips.push(
      <MetaChip
        key="task"
        mono
        onClick={onOpenTask}
        tooltip={taskTitle ? `${entry.task}: ${taskTitle} · Open in Plan` : "Open in Plan"}
      >
        {entry.task}
      </MetaChip>,
    );
  }
  for (const sc of entry.criteria) {
    const text = criteriaText.get(sc);
    chips.push(
      <MetaChip
        key={sc}
        mono
        onClick={onOpenCriterion}
        tooltip={text ? `${sc}: ${stripTicks(text)}` : `${sc} · Open in Goal`}
      >
        {sc}
      </MetaChip>,
    );
  }
  if (entry.result) {
    const pass = entry.result === "pass";
    chips.push(
      <MetaChip
        key="result"
        tone={pass ? "success" : "danger"}
        icon={
          pass ? (
            <Check size={12} strokeWidth={2} aria-hidden />
          ) : (
            <X size={12} strokeWidth={2} aria-hidden />
          )
        }
      >
        {pass ? "Pass" : "Fail"}
      </MetaChip>,
    );
  }
  if (entry.commit) {
    const sha = entry.commit;
    chips.push(
      <MetaChip
        key="commit"
        mono
        icon={<GitCommitHorizontal size={12} strokeWidth={1.75} aria-hidden />}
        onClick={() => copyText(sha, `commit ${sha.slice(0, 7)}`)}
        tooltip={`Commit ${sha} · Click to copy`}
      >
        {sha.slice(0, 7)}
      </MetaChip>,
    );
  }
  if (entry.pr) {
    chips.push(<PrChip key="pr" pr={entry.pr} />);
  }
  if (entry.files.length > 0) {
    for (const f of entry.files.slice(0, FILES_SHOWN)) {
      chips.push(
        <MetaChip
          key={`f:${f}`}
          mono
          onClick={() => copyText(f, "path")}
          tooltip={`${f} · Click to copy`}
        >
          {basename(f)}
        </MetaChip>,
      );
    }
    const more = entry.files.slice(FILES_SHOWN);
    if (more.length > 0) {
      chips.push(
        <MetaChip
          key="files-more"
          onClick={() => copyText(more.join("\n"), `${more.length} more paths`)}
          tooltip={
            <span className="flex flex-col gap-0.5 font-mono">
              {more.map((f) => (
                <span key={f}>{f}</span>
              ))}
            </span>
          }
        >
          +{more.length}
        </MetaChip>,
      );
    }
  }
  if (chips.length === 0) return null;
  return (
    <>
      <Dot />
      {chips}
    </>
  );
}

function PrChip({ pr }: { pr: string }) {
  const icon = <GitPullRequest size={12} strokeWidth={1.75} aria-hidden />;
  const isUrl = /^https?:\/\//.test(pr);
  const label = isUrl
    ? `#${pr.replace(/\/+$/, "").split("/").pop() ?? pr}`
    : pr.startsWith("#")
      ? pr
      : `#${pr}`;
  if (!isUrl) return <MetaChip icon={icon}>{label}</MetaChip>;
  return (
    <Tooltip content={`Open ${pr}`}>
      <a
        href={pr}
        target="_blank"
        rel="noreferrer"
        className={cn(metaChipClass(), chipInteractive)}
      >
        {icon}
        <span className="truncate">{label}</span>
      </a>
    </Tooltip>
  );
}

function QAPair({
  q,
  a,
  by,
  issueId,
}: {
  q: string;
  a: string;
  by: string | undefined;
  issueId: string;
}) {
  return (
    <blockquote className="mt-1.5 flex flex-col gap-1 border-border-strong border-l-2 pl-3">
      <div className="grid grid-cols-[18px_minmax(0,1fr)] items-baseline">
        <span className="font-medium font-mono text-fg-faint text-xs">Q:</span>
        <MarkdownProse md={q} issueId={issueId} compact className="text-fg-muted" />
      </div>
      <div className="grid grid-cols-[18px_minmax(0,1fr)] items-baseline">
        <span className="font-medium font-mono text-fg-faint text-xs">A:</span>
        <div className="min-w-0">
          <MarkdownProse md={a} issueId={issueId} compact className="text-fg" />
          {by && (
            <span className="mt-0.5 inline-flex items-center gap-1 text-fg-faint text-xs">
              answered by <AuthorChip handle={by} variant="text" size="xs" />
            </span>
          )}
        </div>
      </div>
    </blockquote>
  );
}

// ---------------------------------------------------------------- shared bits

type MetaTone = "outline" | "success" | "danger";
const chipInteractive = "transition-colors duration-100 ease-wf hover:bg-muted hover:text-fg";

function metaChipClass(tone: MetaTone = "outline", mono = false, className?: string): string {
  return cn(
    chipVariants({ tone, size: "sm" }),
    "max-w-[180px]",
    mono && "font-mono font-normal",
    className,
  );
}

export interface MetaChipProps {
  children: ReactNode;
  icon?: ReactNode;
  tone?: MetaTone;
  mono?: boolean;
  tooltip?: ReactNode;
  onClick?: () => void;
  className?: string;
}

/** Entry metadata chip (task and criterion ids, results, commits, files); a button when clickable. */
export function MetaChip({
  children,
  icon,
  tone = "outline",
  mono = false,
  tooltip,
  onClick,
  className,
}: MetaChipProps) {
  const cls = metaChipClass(tone, mono, className);
  const inner = (
    <>
      {icon}
      <span className="truncate">{children}</span>
    </>
  );
  const el = onClick ? (
    <button type="button" onClick={onClick} className={cn(cls, chipInteractive)}>
      {inner}
    </button>
  ) : (
    <span className={cls}>{inner}</span>
  );
  return tooltip ? <Tooltip content={tooltip}>{el}</Tooltip> : el;
}

/** A toggle chip in the filter row: pressed = accent, with the entry count. */
function FilterChip({
  pressed,
  count,
  icon,
  onClick,
  children,
}: {
  pressed: boolean;
  count: number;
  icon: ReactNode;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <Chip
      tone={pressed ? "accent" : "outline"}
      icon={icon}
      pressed={pressed}
      onClick={onClick}
      className={cn("gap-1.5", !pressed && "hover:bg-muted hover:text-fg")}
    >
      {children}
      <span className="ml-1.5 font-normal text-fg-faint tabular">{count}</span>
    </Chip>
  );
}

const LINE_EM = 1.5;
const FADE = "linear-gradient(to bottom, black 45%, transparent)";

/** Markdown clamped to a few lines, with a "Show more" toggle only when it overflows. */
export function ClampedProse({
  md,
  issueId,
  lines = 3,
  className,
  proseClassName,
}: {
  md: string;
  issueId?: string;
  lines?: number;
  className?: string;
  proseClassName?: string;
}) {
  const outer = useRef<HTMLDivElement>(null);
  const inner = useRef<HTMLDivElement>(null);
  const bodyId = useId();
  const [open, setOpen] = useState(false);
  const [overflows, setOverflows] = useState(false);

  useLayoutEffect(() => {
    const o = outer.current;
    const i = inner.current;
    if (!o || !i) return;
    const measure = () => {
      const fontPx = Number.parseFloat(getComputedStyle(o).fontSize) || 13;
      setOverflows(i.offsetHeight > fontPx * LINE_EM * lines + 2);
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(i);
    return () => ro.disconnect();
  }, [lines]);

  const clamped = !open;
  return (
    <div className={className}>
      <div
        ref={outer}
        id={bodyId}
        className="overflow-hidden"
        style={
          clamped
            ? {
                maxHeight: `${lines * LINE_EM}em`,
                maskImage: overflows ? FADE : undefined,
              }
            : undefined
        }
      >
        <div ref={inner}>
          <MarkdownProse md={md} issueId={issueId} compact className={proseClassName} />
        </div>
      </div>
      {overflows && (
        <button
          type="button"
          aria-expanded={open}
          aria-controls={bodyId}
          onClick={() => setOpen((v) => !v)}
          className="mt-0.5 rounded-sm font-medium text-fg-faint text-xs transition-colors duration-100 ease-wf hover:text-fg"
        >
          {open ? "Show less" : "Show more"}
        </button>
      )}
    </div>
  );
}

/** A one-line title with `backtick` spans rendered as inline code. */
export function TitleText({ text }: { text: string }) {
  const parts = text.split("`");
  if (parts.length < 3) return <>{text}</>;
  return (
    <>
      {parts.map((part, i) =>
        i % 2 === 1 && i < parts.length - 1 ? (
          <code
            key={i}
            className="rounded-sm bg-muted px-1 py-px font-mono text-[0.9em] font-normal"
          >
            {part}
          </code>
        ) : (
          <span key={i}>{part}</span>
        ),
      )}
    </>
  );
}

function Dot() {
  return (
    <span aria-hidden className="text-fg-faint">
      ·
    </span>
  );
}

// ---------------------------------------------------------------- helpers

/** Task and criterion titles of an issue, for chip tooltips. Reads the cached detail. */
function useRefTitles(issueId: string) {
  const { data } = useIssue(issueId);
  return useMemo(() => {
    const criteria = new Map<string, string>();
    const tasks = new Map<string, string>();
    for (const c of data?.criteria ?? []) criteria.set(c.id, c.text);
    for (const p of data?.plan?.phases ?? []) for (const t of p.tasks) tasks.set(t.id, t.title);
    return { criteria, tasks };
  }, [data]);
}

/** Ids that arrived after the first render, for 1.5 s (live appends flash once). */
function useFreshIds(ids: string[]): ReadonlySet<string> {
  const seen = useRef<Set<string> | null>(null);
  const [fresh, setFresh] = useState<ReadonlySet<string>>(() => new Set());
  const key = ids.join("|");

  useEffect(() => {
    const all = key ? key.split("|") : [];
    if (seen.current === null) {
      seen.current = new Set(all);
      return;
    }
    const known = seen.current;
    const added = all.filter((id) => !known.has(id));
    if (added.length === 0) return;
    for (const id of added) known.add(id);
    setFresh(new Set(added));
    const t = window.setTimeout(() => setFresh(new Set()), 1500);
    return () => window.clearTimeout(t);
  }, [key]);

  return fresh;
}

function groupByDay(entries: ChangeEntry[]): { label: string; entries: ChangeEntry[] }[] {
  const out: { label: string; entries: ChangeEntry[] }[] = [];
  const now = Date.now();
  for (const e of entries) {
    const label = dayLabel(e.ts, now);
    const last = out[out.length - 1];
    if (last && last.label === label) last.entries.push(e);
    else out.push({ label, entries: [e] });
  }
  return out;
}

function countBy<T, K>(items: T[], key: (t: T) => K): Map<K, number> {
  const m = new Map<K, number>();
  for (const it of items) {
    const k = key(it);
    m.set(k, (m.get(k) ?? 0) + 1);
  }
  return m;
}

function toggle<T>(set: ReadonlySet<T>, v: T): ReadonlySet<T> {
  const next = new Set(set);
  if (next.has(v)) next.delete(v);
  else next.add(v);
  return next;
}

function basename(path: string): string {
  const clean = path.replace(/\/+$/, "");
  return clean.slice(clean.lastIndexOf("/") + 1) || path;
}

function stripTicks(s: string): string {
  return s.replace(/`/g, "");
}

function copyText(text: string, what: string) {
  if (!navigator.clipboard) {
    toast.error("Clipboard is not available in this browser.");
    return;
  }
  navigator.clipboard.writeText(text).then(
    () => toast.success(`Copied ${what}`),
    () => toast.error("Could not copy. The browser blocked clipboard access."),
  );
}

const QA_LINE =
  /^\s*(?:>\s*)?(?:\*\*|__)?(q|a|question|answer)(?:\*\*|__)?\s*:(?:\*\*|__)?\s*(.*)$/i;

/**
 * An `answer` entry holds the question and the answer (written by `wf resolve`).
 * Reads `question`/`answer` meta keys first, then `Q:` / `A:` lines in the body.
 */
function parseQA(entry: ChangeEntry): {
  q: string;
  a: string;
  by: string | undefined;
  rest: string;
  consumed: Set<string>;
} | null {
  const by = entry.meta.answered_by?.replace(/^@/, "");
  const consumed = new Set(by ? ["answered_by"] : []);
  const mq = entry.meta.question ?? entry.meta.q;
  const ma = entry.meta.answer ?? entry.meta.a;
  if (mq && ma) {
    for (const k of ["question", "q", "answer", "a"]) consumed.add(k);
    return { q: mq, a: ma, by, rest: entry.body_md.trim(), consumed };
  }

  const q: string[] = [];
  const a: string[] = [];
  const rest: string[] = [];
  let cur: string[] | null = null;
  for (const line of entry.body_md.split("\n")) {
    const m = QA_LINE.exec(line);
    if (m) {
      cur = m[1].toLowerCase().startsWith("q") ? q : a;
      cur.push(m[2]);
    } else if (line.trim() === "") {
      cur = null;
      rest.push(line);
    } else if (cur) {
      cur.push(line.replace(/^\s*>\s?/, ""));
    } else {
      rest.push(line);
    }
  }
  if (q.length === 0 || a.length === 0) return null;
  return {
    q: q.join("\n").trim(),
    a: a.join("\n").trim(),
    by,
    rest: rest.join("\n").trim(),
    consumed,
  };
}
