// Promote a learning or decision to the library. It creates a draft item with a source backlink
// and asks the group owner to review it. Nothing reaches agents until a reviewer approves.
import { Info, Merge } from "lucide-react";
import { type KeyboardEvent, useId, useMemo, useState } from "react";
import { toast } from "sonner";
import { KIND_LABEL, KindIcon, RefLink } from "@/components/common";
import {
  Button,
  Dialog,
  DialogContent,
  DialogFooter,
  Input,
  Kbd,
  Segmented,
} from "@/components/ui";
import type { DecisionEntry, GroupNode, IssueId, LearningEntry, LibraryKind } from "@/gen/types";
import {
  useGroupTree,
  useIssueSummary,
  useLibraryItem,
  useMe,
  usePromote,
  useSearch,
  useSnapshot,
} from "@/lib/api";
import { hrefFor, useGo } from "@/lib/nav";
import { InlineCode, kebab, LIBRARY_KINDS, LibraryStatusChip, libraryPath } from "./meta";

/**
 * A library hit at or above this search score counts as "similar". The search is BM25-style and its
 * scores are not normalised: a title query whose every word matches an item's title scores 30 or more.
 */
const DEDUPE_MIN_SCORE = 20;

const SLUG_MAX = 64;
const SLUG_OK = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export interface PromoteDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  issueId: IssueId;
  entry: LearningEntry | DecisionEntry;
}

export function PromoteDialog({ open, onOpenChange, issueId, entry }: PromoteDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        data-wf="PromoteDialog"
        title="Promote to library"
        description={`Turn this ${entry.type} into an item that agents can reuse in later issues.`}
        size="md"
      >
        <PromoteForm issueId={issueId} entry={entry} onClose={() => onOpenChange(false)} />
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------- form

function PromoteForm({
  issueId,
  entry,
  onClose,
}: {
  issueId: IssueId;
  entry: LearningEntry | DecisionEntry;
  onClose: () => void;
}) {
  const promote = usePromote();
  const go = useGo();
  const me = useMe();
  const snapshot = useSnapshot().data;
  const issue = useIssueSummary(issueId);
  const tree = useGroupTree();

  const [kind, setKind] = useState<LibraryKind>(() => defaultKind(entry));
  const [slug, setSlug] = useState(() => kebab(entry.title, SLUG_MAX));
  const [busy, setBusy] = useState(false);
  const slugId = useId();

  const finalSlug = slug.replace(/^-+|-+$/g, "");
  const path = libraryPath(kind, finalSlug || "…");
  const taken = useMemo(
    () => snapshot?.library.some((l) => l.path.endsWith(libraryPath(kind, finalSlug))) ?? false,
    [snapshot, kind, finalSlug],
  );
  const slugError = !finalSlug
    ? "Enter a name for the file."
    : !SLUG_OK.test(finalSlug)
      ? "Use lowercase letters, numbers and hyphens."
      : taken
        ? `A ${kind} with this name already exists.`
        : undefined;

  const owner = (tree && issue && findOwner(tree, issue.group)) || me;
  const description = useMemo(() => suggestDescription(entry), [entry]);
  const similar = useSimilarItem(issueId, entry);

  const canCreate = !slugError && !busy;
  const submit = async () => {
    if (!canCreate) return;
    setBusy(true);
    try {
      const result = await promote({
        issue: issueId,
        entry: entry.id,
        kind,
        slug: finalSlug,
        base_rev: entry.edit.rev,
      });
      if (!result) return; // The write failed; the data layer already showed why.
      const created = result.created;
      onClose();
      toast.success(
        created
          ? `Draft ${created} created · review requested`
          : "Draft created · review requested",
        created ? { action: { label: "View", onClick: () => void go.libraryItem(created) } } : {},
      );
    } finally {
      setBusy(false);
    }
  };

  const onKeyDown = (e: KeyboardEvent<HTMLFormElement>) => {
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      void submit();
    }
  };

  return (
    <form
      data-wf="PromoteForm"
      className="flex flex-col gap-4 pt-2"
      onSubmit={(e) => {
        e.preventDefault();
        void submit();
      }}
      onKeyDown={onKeyDown}
    >
      <Field label="Kind">
        <Segmented<LibraryKind>
          aria-label="Library kind"
          value={kind}
          onChange={setKind}
          className="w-full [&>button]:flex-1"
          options={LIBRARY_KINDS.map((k) => ({
            value: k,
            label: KIND_LABEL[k],
            icon: <KindIcon kind={k} />,
          }))}
        />
      </Field>

      <Field
        label="File name"
        htmlFor={slugId}
        error={slugError}
        hint={
          <>
            Saved as <code className="font-mono text-fg-muted">{path}</code>
          </>
        }
      >
        <Input
          id={slugId}
          value={slug}
          onChange={(e) => setSlug(toSlugInput(e.target.value))}
          onBlur={() => setSlug((s) => s.replace(/^-+|-+$/g, ""))}
          maxLength={SLUG_MAX}
          spellCheck={false}
          autoComplete="off"
          aria-invalid={slugError ? true : undefined}
          aria-describedby={slugError ? `${slugId}-error` : `${slugId}-hint`}
          className="font-mono"
        />
      </Field>

      <Preview
        kind={kind}
        title={entry.title}
        description={description}
        source={`${issueId}#${entry.id}`}
      />

      {similar && (
        <div
          data-wf="PromoteSimilar"
          role="note"
          className="flex items-start gap-2 rounded-md border border-border bg-subtle px-3 py-2 text-fg text-sm"
        >
          <Merge
            aria-hidden
            size={14}
            strokeWidth={1.75}
            className="mt-px shrink-0 text-fg-muted"
          />
          <p className="min-w-0">
            {similar.same ? "Already in the library:" : "Similar item:"}{" "}
            <a
              href={hrefFor(`/lib/${similar.id}`)}
              onClick={(e) => {
                if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
                e.preventDefault();
                onClose();
                void go.libraryItem(similar.id);
              }}
              className="font-medium underline decoration-border-strong underline-offset-[3px] hover:decoration-fg-muted"
            >
              {similar.title}
            </a>{" "}
            <span className="font-mono text-fg-muted text-xs">({similar.id})</span>
            {similar.same
              ? " — this entry is its source. Open it instead of creating a copy."
              : " — consider merging instead."}
          </p>
        </div>
      )}

      <p className="flex items-start gap-2 text-fg-muted text-sm">
        <Info aria-hidden size={14} strokeWidth={1.75} className="mt-px shrink-0 text-fg-faint" />
        <span>Creates a draft and asks the group owner (@{owner}) to review it.</span>
      </p>

      <DialogFooter className="mt-0 justify-between">
        <span className="hidden items-center gap-1.5 text-fg-faint text-xs sm:inline-flex">
          <Kbd combo="mod+Enter" /> to create
        </span>
        <span className="ml-auto flex items-center gap-2">
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" variant="primary" disabled={!canCreate}>
            {busy ? "Creating…" : "Create draft"}
          </Button>
        </span>
      </DialogFooter>
    </form>
  );
}

function Field({
  label,
  htmlFor,
  hint,
  error,
  children,
}: {
  label: string;
  htmlFor?: string;
  hint?: React.ReactNode;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      {/* A group of buttons has no single control to point at, so it is labelled by name only. */}
      {htmlFor ? (
        <label htmlFor={htmlFor} className="font-medium text-fg-muted text-sm">
          {label}
        </label>
      ) : (
        <span className="font-medium text-fg-muted text-sm">{label}</span>
      )}
      {children}
      {error ? (
        <p id={htmlFor ? `${htmlFor}-error` : undefined} className="text-danger text-sm">
          {error}
        </p>
      ) : (
        hint && (
          <p id={htmlFor ? `${htmlFor}-hint` : undefined} className="text-fg-faint text-sm">
            {hint}
          </p>
        )
      )}
    </div>
  );
}

// ---------------------------------------------------------------- preview

function Preview({
  kind,
  title,
  description,
  source,
}: {
  kind: LibraryKind;
  title: string;
  description: string;
  source: string;
}) {
  return (
    <section
      data-wf="PromotePreview"
      aria-label="Preview of the draft"
      className="overflow-hidden rounded-md border border-border"
    >
      <header className="flex h-8 items-center gap-2 border-border border-b bg-subtle px-3">
        <span className="font-medium text-fg-muted text-sm">Draft preview</span>
        <LibraryStatusChip status="draft" className="ml-auto" />
      </header>
      <div className="flex flex-col gap-2 px-3 py-2.5">
        <p className="flex items-start gap-2 font-medium text-base text-fg leading-5">
          <KindIcon kind={kind} size={14} className="mt-[3px] shrink-0 text-fg-muted" />
          <span className="min-w-0">{title}</span>
        </p>
        <p className="text-fg-muted text-sm leading-normal">
          <InlineCode text={description} className="text-[11px]" />
        </p>
        <p className="text-fg-faint text-sm">
          Promoted from <RefLink target={source} />
        </p>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------- helpers

/** gotcha → gotcha, pattern and tip → pattern, decision → decision. */
function defaultKind(entry: LearningEntry | DecisionEntry): LibraryKind {
  if (entry.type === "decision") return "decision";
  return entry.kind === "gotcha" ? "gotcha" : "pattern";
}

/** Typing helper: lowercase, no spaces, no symbols. A trailing hyphen is allowed while typing. */
function toSlugInput(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/-{2,}/g, "-")
    .replace(/^-+/, "");
}

function plain(md: string | undefined): string {
  return (md ?? "")
    .replace(/\[\[([^\]]+)\]\]/g, "$1")
    .replace(/[*_`>#]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function firstSentence(text: string): string {
  const m = text.match(/^.+?[.!?](?=\s|$)/);
  return (m ? m[0] : text).trim();
}

function ruleOf(entry: LearningEntry | DecisionEntry): string {
  const text =
    entry.type === "decision"
      ? plain(entry.decision_md) || plain(entry.body_md)
      : plain(entry.rule_md) || plain(entry.body_md);
  return firstSentence(text.replace(/^(decision|rule):\s*/i, ""));
}

/** A "Use when…" line for the draft, built from the entry. The reviewer can reword it. */
function suggestDescription(entry: LearningEntry | DecisionEntry): string {
  let lead: string;
  if (entry.type === "decision") {
    lead = entry.topic
      ? `Use when you work on ${entry.topic.replace(/[-_]+/g, " ")}.`
      : "Use when you face the same choice.";
  } else if (entry.applies_to.length > 0) {
    lead = `Use when you work on ${entry.applies_to
      .slice(0, 2)
      .map((a) => `\`${a}\``)
      .join(" or ")}.`;
  } else if (entry.tags.length > 0) {
    lead = `Use when you work with ${entry.tags.slice(0, 3).join(", ")}.`;
  } else {
    lead = "Use when you hit the same problem.";
  }
  const rule = ruleOf(entry);
  const text = rule ? `${lead} ${rule}` : lead;
  return text.length <= 300 ? text : `${text.slice(0, 297).trimEnd()}…`;
}

/**
 * The best library hit for the entry's title, if it scores high enough to suggest merging. Retired
 * items do not count. `same` is true when the hit already comes from this very entry.
 */
function useSimilarItem(issueId: IssueId, entry: LearningEntry | DecisionEntry) {
  const hits = useSearch(entry.title, "library").data;
  const library = useSnapshot().data?.library;
  const hit = useMemo(
    () =>
      hits
        ?.filter(
          (h) =>
            h.kind === "library" &&
            h.score >= DEDUPE_MIN_SCORE &&
            library?.find((l) => l.id === h.id)?.status !== "retired",
        )
        .sort((a, b) => b.score - a.score)[0],
    [hits, library],
  );
  const detail = useLibraryItem(hit?.id).data;
  if (!hit) return undefined;
  const source = `${issueId}#${entry.id}`;
  const same =
    (entry.type === "learning" && entry.promoted_to === hit.id) ||
    Boolean(detail?.source.some((ref) => ref.target === source));
  return { id: hit.id, title: hit.title, same };
}

/** The owner of the group, or the nearest ancestor that has one. */
function findOwner(node: GroupNode, groupId: string, inherited?: string): string | undefined {
  const owner = node.owner ?? inherited;
  if (node.id === groupId) return owner;
  for (const child of node.children) {
    const found = findOwner(child, groupId, owner);
    if (found !== undefined) return found;
  }
  return undefined;
}
