// Learnings as cards: the rule in bold, the evidence under it, and a path into the
// library. A candidate offers Promote; a promoted learning links to its library item.
import { ArrowUpRight, BookPlus, Lightbulb } from "lucide-react";
import { type MouseEvent, useMemo, useState } from "react";
import { AuthorChip, EmptyState, KindIcon, MarkdownProse, RelativeTime } from "@/components/common";
import { Button, Chip, Tooltip } from "@/components/ui";
import { PromoteDialog } from "@/features/library";
import type { LearningEntry, LearningKind, LibrarySummary } from "@/gen/types";
import { useSnapshot } from "@/lib/api";
import { cn } from "@/lib/cn";
import { parseTs } from "@/lib/format";
import { hrefFor, useGo } from "@/lib/nav";
import { ClampedProse, EntryIdButton, TitleText } from "./ChangesTimeline";
import { ASK, SkillHint } from "./skill-hint";

const KIND_LABEL: Record<LearningKind, string> = {
  tip: "Tip",
  gotcha: "Gotcha",
  pattern: "Pattern",
};

/** Tile tint per kind: tip neutral, gotcha amber, pattern accent. */
const KIND_TILE: Record<LearningKind, string> = {
  tip: "bg-muted text-fg-muted",
  gotcha: "bg-stale/12 text-stale",
  pattern: "bg-accent-subtle text-accent",
};

export interface LearningCardsProps {
  learnings: LearningEntry[];
  issueId: string;
  /** The drawer always uses one column; the page uses two when its column is wide enough. */
  variant?: "drawer" | "page";
  className?: string;
}

export function LearningCards({
  learnings,
  issueId,
  variant = "page",
  className,
}: LearningCardsProps) {
  const libTitles = useLibraryTitles();
  const [promote, setPromote] = useState<{ open: boolean; entry: LearningEntry | null }>({
    open: false,
    entry: null,
  });
  const sorted = useMemo(
    () => [...learnings].sort((a, b) => parseTs(b.ts) - parseTs(a.ts)),
    [learnings],
  );

  if (learnings.length === 0) {
    return (
      <div data-wf="LearningCards" className={className}>
        <EmptyState
          icon={<Lightbulb strokeWidth={1.75} />}
          title="No learnings yet"
          hint="Agents log a learning when something surprised them: a tip, a gotcha or a pattern worth reusing."
          action={<SkillHint skill="logging-work" prompt={ASK.learning(issueId)} />}
        />
      </div>
    );
  }

  const wide = variant !== "drawer";
  return (
    <div data-wf="LearningCards" className={cn("min-w-0 pt-1", wide && "@container", className)}>
      <ul className={cn("grid grid-cols-1 gap-3", wide && "@min-[640px]:grid-cols-2")}>
        {sorted.map((l) => (
          <LearningCard
            key={l.id}
            learning={l}
            issueId={issueId}
            libraryTitle={l.promoted_to ? libTitles.get(l.promoted_to) : undefined}
            onPromote={() => setPromote({ open: true, entry: l })}
          />
        ))}
      </ul>
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

function LearningCard({
  learning: l,
  issueId,
  libraryTitle,
  onPromote,
}: {
  learning: LearningEntry;
  issueId: string;
  libraryTitle: string | undefined;
  onPromote: () => void;
}) {
  const { rule, evidence } = splitRule(l);
  // The title often restates the rule's first sentence; show it only when it adds something.
  const showTitle = !normalize(rule).startsWith(normalize(l.title));
  const hasChips = l.tags.length > 0 || l.applies_to.length > 0;

  return (
    <li
      data-wf="LearningCard"
      aria-label={`${KIND_LABEL[l.kind]}: ${l.title.replace(/`/g, "")}`}
      className="group grid min-w-0 grid-cols-[24px_minmax(0,1fr)] gap-x-2.5 rounded-lg border border-border bg-bg p-3"
    >
      <span
        aria-hidden
        className={cn("flex size-[24px] items-center justify-center rounded-md", KIND_TILE[l.kind])}
      >
        <KindIcon kind={l.kind} size={14} />
      </span>

      <div className="flex min-w-0 flex-col">
        <div className="flex min-h-[24px] min-w-0 items-center gap-1.5 text-fg-faint text-xs">
          <span className="shrink-0 font-medium text-fg-muted">{KIND_LABEL[l.kind]}</span>
          {showTitle && (
            <>
              <span aria-hidden>·</span>
              <span className="truncate">
                <TitleText text={l.title} />
              </span>
            </>
          )}
        </div>

        <MarkdownProse
          md={rule}
          issueId={issueId}
          compact
          className="font-semibold text-base text-fg"
        />

        {evidence && (
          <ClampedProse
            className="mt-1 text-sm"
            md={evidence}
            issueId={issueId}
            proseClassName="text-fg-faint text-sm"
          />
        )}

        {hasChips && (
          <div className="mt-2.5 flex flex-wrap items-center gap-1">
            {l.tags.map((t) => (
              <Chip key={`t:${t}`} tone="outline" className="font-normal">
                {t}
              </Chip>
            ))}
            {l.applies_to.map((a) => (
              <Tooltip key={`a:${a}`} content={`Applies to ${a}`}>
                <Chip tone="neutral" className="max-w-[220px] font-mono font-normal">
                  {a}
                </Chip>
              </Tooltip>
            ))}
          </div>
        )}

        <footer className="mt-auto flex min-h-[24px] items-center gap-1.5 pt-3 text-fg-faint text-xs">
          <AuthorChip handle={l.author} variant="chip" size="xs" />
          <span aria-hidden>·</span>
          <RelativeTime ts={l.ts} className="tabular" />
          <span aria-hidden>·</span>
          <EntryIdButton issueId={issueId} id={l.id} />
          <span className="ml-auto flex items-center">
            <LearningAction learning={l} libraryTitle={libraryTitle} onPromote={onPromote} />
          </span>
        </footer>
      </div>
    </li>
  );
}

function LearningAction({
  learning: l,
  libraryTitle,
  onPromote,
}: {
  learning: LearningEntry;
  libraryTitle: string | undefined;
  onPromote: () => void;
}) {
  const go = useGo();
  if (l.promoted_to) {
    const libId = l.promoted_to;
    const open = (e: MouseEvent<HTMLAnchorElement>) => {
      if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
      e.preventDefault();
      go.libraryItem(libId);
    };
    return (
      <Tooltip content={libraryTitle ? `${libId} · ${libraryTitle}` : `Promoted to ${libId}`}>
        <a
          data-wf="LibraryLink"
          href={hrefFor(`/lib/${libId}`)}
          onClick={open}
          className="inline-flex h-6 items-center gap-0.5 rounded-md px-1.5 font-medium text-accent text-sm transition-colors duration-100 ease-wf hover:bg-accent-subtle"
        >
          In library
          <ArrowUpRight size={14} strokeWidth={1.75} aria-hidden />
        </a>
      </Tooltip>
    );
  }
  if (l.promote === "candidate") {
    return (
      <Tooltip content="Marked as a promotion candidate. Promote it to a draft library item.">
        <Button
          data-wf="PromoteButton"
          variant="ghost"
          size="sm"
          onClick={onPromote}
          className="text-accent hover:bg-accent-subtle hover:text-accent"
        >
          <BookPlus size={14} strokeWidth={1.75} aria-hidden />
          Promote
        </Button>
      </Tooltip>
    );
  }
  return (
    <button
      type="button"
      data-wf="PromoteButton"
      onClick={onPromote}
      className="h-6 rounded-md px-1.5 text-fg-faint text-sm opacity-0 transition-[opacity,background-color,color] duration-100 ease-wf hover:bg-muted hover:text-fg focus-visible:opacity-100 group-focus-within:opacity-100 group-hover:opacity-100"
    >
      Promote
    </button>
  );
}

// ---------------------------------------------------------------- helpers

function useLibraryTitles(): Map<string, string> {
  const { data } = useSnapshot();
  return useMemo(
    () => new Map((data?.library ?? []).map((i: LibrarySummary) => [i.id, i.title])),
    [data],
  );
}

/** The rule is `rule_md`, else the first paragraph of the body; evidence is the rest. */
function splitRule(l: LearningEntry): { rule: string; evidence: string | undefined } {
  const paras = l.body_md
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean);
  const rule = l.rule_md?.trim() || paras[0] || l.title;
  const evidence =
    l.evidence_md?.trim() || (l.rule_md ? undefined : paras.slice(1).join("\n\n")) || undefined;
  return { rule, evidence };
}

function normalize(s: string): string {
  return s
    .replace(/[`*_[\]]/g, "")
    .replace(/[.\s]+$/, "")
    .trim()
    .toLowerCase();
}
