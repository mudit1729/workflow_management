// Decisions as ADR cards: the decision first, then why, what follows and when to
// revisit. A superseded decision folds under the one that replaced it, so the list
// shows only live decisions while the history stays one click away.
import {
  BookPlus,
  Check,
  ChevronRight,
  CircleDashed,
  Info,
  Replace,
  Scale,
  TriangleAlert,
  X,
} from "lucide-react";
import { type ReactNode, useMemo, useState } from "react";
import {
  AuthorChip,
  AuthorStack,
  CopyButton,
  EmptyState,
  MarkdownProse,
  RelativeTime,
} from "@/components/common";
import {
  Button,
  Chip,
  type ChipProps,
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
  Tooltip,
} from "@/components/ui";
import { PromoteDialog } from "@/features/library";
import type { Criterion, DecisionEntry, DecisionStatus } from "@/gen/types";
import { useIssue } from "@/lib/api";
import { cn } from "@/lib/cn";
import { parseTs } from "@/lib/format";
import { useIssueTab } from "@/lib/nav";
import { EntryIdButton, MetaChip, TitleText } from "./ChangesTimeline";

type ShownStatus = DecisionStatus | "superseded";

export interface DecisionCardsProps {
  decisions: DecisionEntry[];
  issueId: string;
  className?: string;
}

export function DecisionCards({ decisions, issueId, className }: DecisionCardsProps) {
  const chains = useMemo(() => buildChains(decisions), [decisions]);
  const roots = useMemo(
    () =>
      decisions
        .filter((d) => {
          const next = chains.successor.get(d.id);
          return !next || !chains.byId.has(next);
        })
        .sort((a, b) => parseTs(b.ts) - parseTs(a.ts)),
    [decisions, chains],
  );
  const clashes = useMemo(() => topicClashes(decisions, chains), [decisions, chains]);
  const criteria = useCriteriaText(issueId);
  const { setTab } = useIssueTab();
  const [promote, setPromote] = useState<{ open: boolean; entry: DecisionEntry | null }>({
    open: false,
    entry: null,
  });

  if (decisions.length === 0) {
    return (
      <div data-wf="DecisionCards" className={className}>
        <EmptyState
          icon={<Scale strokeWidth={1.75} />}
          title="No decisions logged"
          hint="Agents record each design choice as a decision, with the options they rejected and why."
          skill="log-decision"
          command={`wf append ${issueId} decision --title "…"`}
        />
      </div>
    );
  }

  const ctx: CardContext = {
    issueId,
    chains,
    clashes,
    criteria,
    onOpenCriterion: () => setTab("goal"),
    onPromote: (entry) => setPromote({ open: true, entry }),
  };

  return (
    <div data-wf="DecisionCards" className={cn("flex min-w-0 flex-col gap-3 pt-1", className)}>
      {roots.map((d) => (
        <DecisionCard key={d.id} decision={d} ctx={ctx} seen={new Set([d.id])} />
      ))}
      {promote.entry && (
        <PromoteDialog
          open={promote.open}
          onOpenChange={(open: boolean) => setPromote((p) => ({ ...p, open }))}
          issueId={issueId}
          entry={promote.entry}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------- card

interface CardContext {
  issueId: string;
  chains: Chains;
  clashes: Map<string, string[]>;
  criteria: Map<string, string>;
  onOpenCriterion: () => void;
  onPromote: (entry: DecisionEntry) => void;
}

function DecisionCard({
  decision: d,
  ctx,
  nested = false,
  seen,
}: {
  decision: DecisionEntry;
  ctx: CardContext;
  nested?: boolean;
  /** Ids already on screen in this chain; guards against supersedes cycles. */
  seen: Set<string>;
}) {
  const superseded = nested || ctx.chains.successor.has(d.id);
  const status: ShownStatus = superseded ? "superseded" : d.status;
  const predecessorId = ctx.chains.predecessor.get(d.id);
  const predecessor = predecessorId ? ctx.chains.byId.get(predecessorId) : undefined;
  const clash = superseded ? undefined : ctx.clashes.get(d.id);
  const rejected = d.rejected_md ? splitOptions(d.rejected_md) : [];
  const deciders = d.decided_by.length > 0 ? d.decided_by : [d.author];
  const decisionMd = d.decision_md ?? (d.because_md ? undefined : d.body_md.trim());

  return (
    <article
      data-wf="DecisionCard"
      aria-label={`${d.id}: ${d.title.replace(/`/g, "")}`}
      className={cn(
        "min-w-0 rounded-lg border border-border",
        nested ? "bg-subtle p-3" : "bg-bg p-4",
      )}
    >
      <header className="flex flex-wrap items-center gap-1.5">
        <StatusChip status={status} was={superseded ? d.status : undefined} />
        {d.topic && (
          <Tooltip content="Topic. A new decision on the same topic should supersede this one.">
            <Chip tone="neutral" className="font-mono font-normal text-fg-faint">
              {d.topic}
            </Chip>
          </Tooltip>
        )}
        {clash && clash.length > 0 && <ClashChip topic={d.topic ?? ""} others={clash} />}
        <EntryIdButton issueId={ctx.issueId} id={d.id} />
        <RelativeTime ts={d.ts} className="ml-auto shrink-0 text-fg-faint text-xs" />
      </header>

      <h4
        className={cn(
          "mt-2 font-semibold text-md leading-snug",
          superseded ? "text-fg-muted line-through decoration-fg-faint" : "text-fg",
        )}
      >
        <TitleText text={d.title} />
      </h4>

      <div className={cn(superseded && "opacity-70")}>
        {decisionMd && (
          <div
            className={cn(
              "mt-2.5 border-l-2 pl-3 text-base text-fg",
              superseded ? "border-border-strong" : "border-accent",
            )}
          >
            <MarkdownProse md={decisionMd} issueId={ctx.issueId} compact />
          </div>
        )}

        {(d.because_md || d.consequences_md || d.revisit_md) && (
          <dl className="mt-3 grid grid-cols-[88px_minmax(0,1fr)] gap-x-3 gap-y-2">
            {d.because_md && <Row label="Because" md={d.because_md} issueId={ctx.issueId} />}
            {d.consequences_md && (
              <Row label="Consequences" md={d.consequences_md} issueId={ctx.issueId} />
            )}
            {d.revisit_md && <Row label="Revisit when" md={d.revisit_md} issueId={ctx.issueId} />}
          </dl>
        )}

        {rejected.length > 0 && (
          <Fold
            name="RejectedOptions"
            className="mt-2"
            trigger={
              <span>
                Rejected options <span className="text-fg-faint tabular">({rejected.length})</span>
              </span>
            }
          >
            <ul className="mt-1 flex flex-col gap-1 pl-[22px]">
              {rejected.map((opt) => (
                <li key={opt} className="flex items-baseline gap-2 text-base text-fg-muted">
                  <X
                    size={14}
                    strokeWidth={1.75}
                    className="relative top-[1px] shrink-0 text-fg-faint"
                    aria-hidden
                  />
                  <MarkdownProse md={opt} issueId={ctx.issueId} compact className="min-w-0" />
                </li>
              ))}
            </ul>
          </Fold>
        )}
      </div>

      {!superseded && d.status === "proposed" && (
        <p className="mt-3 flex flex-wrap items-center gap-x-1.5 gap-y-1 text-fg-faint text-sm">
          <Info size={14} strokeWidth={1.75} className="shrink-0" aria-hidden />
          <span>Accept or reject it with</span>
          <code className="rounded-sm bg-muted px-1 font-mono text-fg-muted text-xs">
            wf decide {ctx.issueId} {d.id} accept
          </code>
          <CopyButton
            text={`wf decide ${ctx.issueId} ${d.id} accept`}
            label="Copy the wf decide command"
          />
        </p>
      )}

      {predecessorId && (
        <SupersedesRow
          id={predecessorId}
          predecessor={predecessor && !seen.has(predecessor.id) ? predecessor : undefined}
          ctx={ctx}
          seen={seen}
        />
      )}

      {!nested && (
        <footer className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2 border-border border-t pt-3">
          <div className="flex min-w-0 items-center gap-1.5">
            {deciders.length === 1 ? (
              <AuthorChip handle={deciders[0]} variant="chip" size="xs" />
            ) : (
              <>
                <AuthorStack handles={deciders} max={3} />
                <span className="truncate text-fg-muted text-sm">
                  {deciders.map((h) => `@${h}`).join(", ")}
                </span>
              </>
            )}
          </div>
          {d.affects.length > 0 && (
            <div className="flex flex-wrap items-center gap-1">
              <span className="mr-0.5 text-fg-faint text-sm">Affects</span>
              {d.affects.map((sc) => {
                const text = ctx.criteria.get(sc);
                return (
                  <MetaChip
                    key={sc}
                    mono
                    onClick={ctx.onOpenCriterion}
                    tooltip={text ? `${sc}: ${text.replace(/`/g, "")}` : `${sc} · Open in Goal`}
                  >
                    {sc}
                  </MetaChip>
                );
              })}
            </div>
          )}
          <Button
            data-wf="PromoteButton"
            variant="ghost"
            size="sm"
            className="ml-auto"
            onClick={() => ctx.onPromote(d)}
            aria-label={`Promote ${d.id} to the library`}
          >
            <BookPlus size={14} strokeWidth={1.75} aria-hidden />
            Promote
          </Button>
        </footer>
      )}
    </article>
  );
}

function SupersedesRow({
  id,
  predecessor,
  ctx,
  seen,
}: {
  id: string;
  predecessor: DecisionEntry | undefined;
  ctx: CardContext;
  seen: Set<string>;
}) {
  if (!predecessor) {
    return (
      <p className="mt-3 flex items-center gap-1.5 text-fg-faint text-sm">
        <Replace size={14} strokeWidth={1.75} aria-hidden />
        Supersedes <span className="font-mono text-xs">{id}</span>
        <span>· not found in this log</span>
      </p>
    );
  }
  return (
    <Fold
      name="SupersedesRow"
      className="mt-3"
      trigger={
        <span className="flex min-w-0 items-center gap-1.5">
          <span className="shrink-0">Supersedes</span>
          <span className="shrink-0 font-mono text-fg-faint text-xs">{predecessor.id}</span>
          <span className="shrink-0 text-fg-faint">—</span>
          <span className="truncate">
            <TitleText text={predecessor.title} />
          </span>
        </span>
      }
    >
      <div className="mt-2">
        <DecisionCard
          decision={predecessor}
          ctx={ctx}
          nested
          seen={new Set([...seen, predecessor.id])}
        />
      </div>
    </Fold>
  );
}

/** A quiet disclosure row: chevron + label, full-width hover. */
function Fold({
  name,
  trigger,
  children,
  className,
}: {
  /** The element name the user sees in `data-wf`. */
  name: string;
  trigger: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <Collapsible data-wf={name} className={className}>
      <CollapsibleTrigger className="group -mx-1.5 flex w-[calc(100%+var(--wf-space-1)*3)] min-w-0 items-center gap-1.5 rounded-md px-1.5 py-1 text-left text-fg-muted text-sm transition-colors duration-100 ease-wf hover:bg-muted hover:text-fg">
        <ChevronRight
          size={14}
          strokeWidth={1.75}
          className="shrink-0 text-fg-faint transition-transform duration-150 ease-wf group-data-[state=open]:rotate-90"
          aria-hidden
        />
        {trigger}
      </CollapsibleTrigger>
      <CollapsibleContent>{children}</CollapsibleContent>
    </Collapsible>
  );
}

function Row({ label, md, issueId }: { label: string; md: string; issueId: string }) {
  return (
    <>
      <dt className="pt-px font-medium text-fg-faint text-sm leading-[19px]">{label}</dt>
      <dd className="min-w-0 text-base text-fg">
        <MarkdownProse md={md} issueId={issueId} compact />
      </dd>
    </>
  );
}

const STATUS_STYLE: Record<
  ShownStatus,
  { label: string; tone: ChipProps["tone"]; cls?: string; icon: ReactNode }
> = {
  proposed: {
    label: "Proposed",
    tone: "outline",
    cls: "border-border-strong",
    icon: <CircleDashed strokeWidth={1.75} aria-hidden />,
  },
  accepted: {
    label: "Accepted",
    tone: "success",
    icon: <Check strokeWidth={1.75} aria-hidden />,
  },
  rejected: {
    label: "Rejected",
    tone: "outline",
    cls: "border-danger/40 text-danger",
    icon: <X strokeWidth={1.75} aria-hidden />,
  },
  superseded: {
    label: "Superseded",
    tone: "outline",
    cls: "text-fg-faint line-through decoration-fg-faint",
    icon: <Replace strokeWidth={1.75} aria-hidden />,
  },
};

function StatusChip({ status, was }: { status: ShownStatus; was?: DecisionStatus }) {
  const s = STATUS_STYLE[status];
  const chip = (
    <Chip data-wf="StatusChip" tone={s.tone} icon={s.icon} className={s.cls}>
      {s.label}
    </Chip>
  );
  if (!was) return chip;
  return <Tooltip content={`Superseded by a later decision. It was ${was}.`}>{chip}</Tooltip>;
}

function ClashChip({ topic, others }: { topic: string; others: string[] }) {
  const list = others.join(", ");
  return (
    <Tooltip
      content={`Q009: ${list} ${others.length === 1 ? "is" : "are"} also live on the topic “${topic}”. Supersede one, or give them different topics.`}
    >
      <Chip
        data-wf="ClashChip"
        tone="stale"
        icon={<TriangleAlert strokeWidth={1.75} aria-hidden />}
      >
        Q009
      </Chip>
    </Tooltip>
  );
}

// ---------------------------------------------------------------- helpers

function useCriteriaText(issueId: string): Map<string, string> {
  const { data } = useIssue(issueId);
  return useMemo(
    () => new Map((data?.criteria ?? []).map((c: Criterion) => [c.id, c.text])),
    [data],
  );
}

interface Chains {
  byId: Map<string, DecisionEntry>;
  /** old id → the id that supersedes it */
  successor: Map<string, string>;
  /** new id → the id it supersedes (may be missing from the log) */
  predecessor: Map<string, string>;
}

/** Supersession links from both sides: a later entry's `supersedes` and the derived `superseded_by`. */
function buildChains(decisions: DecisionEntry[]): Chains {
  const byId = new Map(decisions.map((d) => [d.id, d]));
  const successor = new Map<string, string>();
  const predecessor = new Map<string, string>();
  for (const d of decisions) {
    if (!d.supersedes || d.supersedes === d.id) continue;
    predecessor.set(d.id, d.supersedes);
    if (byId.has(d.supersedes)) successor.set(d.supersedes, d.id);
  }
  for (const d of decisions) {
    const next = d.superseded_by;
    if (!next || next === d.id || successor.has(d.id)) continue;
    successor.set(d.id, next);
    if (byId.has(next) && !predecessor.has(next)) predecessor.set(next, d.id);
  }
  return { byId, successor, predecessor };
}

/** Live decisions (not rejected, not superseded) that share a topic: id → the other ids (Q009). */
function topicClashes(decisions: DecisionEntry[], chains: Chains): Map<string, string[]> {
  const byTopic = new Map<string, string[]>();
  for (const d of decisions) {
    if (!d.topic || chains.successor.has(d.id) || d.status === "rejected") continue;
    byTopic.set(d.topic, [...(byTopic.get(d.topic) ?? []), d.id]);
  }
  const out = new Map<string, string[]>();
  for (const ids of byTopic.values()) {
    if (ids.length < 2) continue;
    for (const id of ids)
      out.set(
        id,
        ids.filter((x) => x !== id),
      );
  }
  return out;
}

/** "WebSocket (two-way); polling (slow)." or a bullet list → one string per option. */
function splitOptions(md: string): string[] {
  const lines = md
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);
  const bullets = lines.filter((l) => /^[-*+]\s+/.test(l));
  const parts =
    bullets.length > 0
      ? bullets.map((l) => l.replace(/^[-*+]\s+/, ""))
      : md.split(/;\s*(?![^(]*\))/).map((s) => s.trim());
  return parts
    .map((s) => s.replace(/\.$/, ""))
    .filter(Boolean)
    .map((s) => s.charAt(0).toUpperCase() + s.slice(1));
}
