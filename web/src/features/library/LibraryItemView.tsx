// One library item: what it says, how far to trust it, where it came from and who uses it.
import {
  ArrowLeft,
  Check,
  FilePen,
  Hourglass,
  Info,
  Link2,
  type LucideIcon,
  SearchX,
  TriangleAlert,
  X,
} from "lucide-react";
import { type ReactNode, useMemo, useState } from "react";
import { toast } from "sonner";
import {
  AuthorChip,
  AuthorStack,
  CopyButton,
  EmptyState,
  GroupPath,
  KIND_LABEL,
  KindIcon,
  MarkdownProse,
  RefLink,
} from "@/components/common";
import { Button, Chip, IconButton, Skeleton, Tooltip } from "@/components/ui";
import type { Diagnostic, LibId, LibraryItemDetail, Ref } from "@/gen/types";
import { useApproveLibrary, useIssueMap, useLibraryItem } from "@/lib/api";
import { cn } from "@/lib/cn";
import { STATUS_LABEL } from "@/lib/status";
import { formatDate, InlineCode, LibraryStatusChip, STALE_TEXT, sortSections } from "./meta";

export interface LibraryItemViewProps {
  id: LibId;
  /** Closes the pane (or goes back, on a small screen). Without it no close button shows. */
  onClose?: () => void;
  /** `screen` is the small-screen variant: the item fills the page and the button reads "Library". */
  variant?: "pane" | "screen";
}

export function LibraryItemView({ id, onClose, variant = "pane" }: LibraryItemViewProps) {
  const query = useLibraryItem(id);
  const detail = query.data;

  if (!detail) {
    if (query.isPending) return <ItemSkeleton onClose={onClose} variant={variant} />;
    const status = (query.error as { status?: number } | null)?.status;
    const missing = !query.isError || status === 404;
    return (
      <ItemMessage onClose={onClose} variant={variant}>
        <EmptyState
          icon={<SearchX />}
          title={missing ? "Item not found" : "Could not open this item"}
          hint={
            missing
              ? `No library item has the id ${id}. It may have been renamed or deleted.`
              : "The server did not answer. Your files are safe."
          }
          action={
            missing ? (
              onClose && (
                <Button size="sm" onClick={onClose}>
                  Back to the library
                </Button>
              )
            ) : (
              <Button size="sm" onClick={() => void query.refetch()}>
                Try again
              </Button>
            )
          }
        />
      </ItemMessage>
    );
  }

  // Keyed by id: selecting another item resets the scroll position.
  return <ItemBody key={detail.summary.id} detail={detail} onClose={onClose} variant={variant} />;
}

// ---------------------------------------------------------------- body

function ItemBody({
  detail,
  onClose,
  variant,
}: {
  detail: LibraryItemDetail;
  onClose?: () => void;
  variant: "pane" | "screen";
}) {
  const s = detail.summary;
  const overdue = s.review_overdue && s.status !== "retired";
  const sections = useMemo(() => sortSections(s.kind, detail.sections), [s.kind, detail.sections]);
  // The overdue banner already says it; keep the panel for other findings.
  const findings = detail.diagnostics.filter((d) => !(overdue && d.rule === "Q013"));

  return (
    <div data-wf="LibraryItemView" data-status={s.status} className="flex h-full min-h-0 flex-col">
      <Toolbar detail={detail} onClose={onClose} variant={variant} />

      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="flex flex-col gap-5 px-5 py-4">
          <header className="flex flex-col gap-2">
            <h2
              className={cn(
                "font-semibold text-fg text-lg",
                s.status === "retired" && "text-fg-muted",
              )}
            >
              {s.title}
            </h2>
            <div className="flex min-w-0 items-center gap-1 text-fg-faint text-xs">
              <code className="shrink-0 whitespace-nowrap font-mono">{s.id}</code>
              <CopyButton text={s.id} label="Copy id" />
              <span aria-hidden>·</span>
              <code className="min-w-0 truncate font-mono" title={s.path}>
                {s.path}
              </code>
              <CopyButton text={s.path} label="Copy file path" />
            </div>
            <p className="text-base text-fg-muted leading-relaxed">
              <InlineCode text={s.description} className="text-fg-muted" />
            </p>
          </header>

          <Banners detail={detail} overdue={overdue} />

          {sections.length > 0 && (
            <div className="flex flex-col gap-4">
              {sections.map((section, i) => (
                <section key={`${section.heading}-${i}`} aria-label={section.heading}>
                  <h3 className="mb-1.5 font-semibold text-fg text-sm">{section.heading}</h3>
                  <MarkdownProse md={section.body_md} />
                </section>
              ))}
            </div>
          )}

          <Details detail={detail} overdue={overdue} />
          <Sources sources={detail.source} />
          <UsedBy backlinks={detail.backlinks} />
          {findings.length > 0 && <Findings findings={findings} />}
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- toolbar

function Toolbar({
  detail,
  onClose,
  variant,
}: {
  detail: LibraryItemDetail;
  onClose?: () => void;
  variant: "pane" | "screen";
}) {
  const s = detail.summary;
  return (
    <div className="flex h-10 shrink-0 items-center gap-2 border-border border-b px-3 pl-5">
      {variant === "screen" && onClose && (
        <Button variant="ghost" size="sm" onClick={onClose} className="-ml-3">
          <ArrowLeft aria-hidden size={14} strokeWidth={1.75} />
          Library
        </Button>
      )}
      <span className="inline-flex min-w-0 items-center gap-1.5 font-medium text-fg-muted text-sm">
        <KindIcon kind={s.kind} size={14} />
        {KIND_LABEL[s.kind]}
      </span>
      <LibraryStatusChip status={s.status} />
      <div className="ml-auto flex shrink-0 items-center gap-1">
        {s.status === "reviewed" && <RetireButton />}
        {variant === "pane" && onClose && (
          <IconButton
            size="sm"
            label="Close"
            shortcut="Escape"
            icon={<X size={14} strokeWidth={1.75} />}
            onClick={onClose}
          />
        )}
      </div>
    </div>
  );
}

/** A stub: retiring needs the CLI for now. The tooltip names the command. */
function RetireButton() {
  return (
    <Tooltip content="Retire from the CLI: wf library retire">
      <span className="inline-flex">
        <Button variant="ghost" size="sm" disabled>
          Retire
        </Button>
      </span>
    </Tooltip>
  );
}

// ---------------------------------------------------------------- banners

function Banners({ detail, overdue }: { detail: LibraryItemDetail; overdue: boolean }) {
  const s = detail.summary;
  const approve = useApproveLibrary();
  const [busy, setBusy] = useState(false);

  const onApprove = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const result = await approve({ id: s.id, base_rev: detail.edit.rev });
      if (result) {
        toast.success(`${s.id} approved`, {
          description: "Agents can now read it in their context.",
        });
      }
    } finally {
      setBusy(false);
    }
  };

  if (s.status === "draft") {
    return (
      <Banner
        tone="accent"
        icon={FilePen}
        actions={
          <>
            <Button variant="primary" size="sm" disabled={busy} onClick={onApprove}>
              <Check aria-hidden size={14} strokeWidth={2} />
              {busy ? "Approving…" : "Approve"}
            </Button>
            <RetireButton />
          </>
        }
      >
        <strong className="font-medium">Draft</strong> — agents do not see this item until a
        reviewer approves it.
      </Banner>
    );
  }

  if (s.status === "retired") {
    return (
      <Banner tone="neutral" icon={Info}>
        <strong className="font-medium">Retired</strong> — agents no longer read this item.
        {detail.superseded_by && (
          <>
            {" "}
            Replaced by <RefLink target={detail.superseded_by} />.
          </>
        )}
      </Banner>
    );
  }

  if (overdue) {
    return (
      <Banner tone="stale" icon={Hourglass}>
        Past its review date (Q013)
        {s.review_after && <> — it was due on {formatDate(s.review_after)}</>}. Check that it is
        still true.
      </Banner>
    );
  }
  return null;
}

type BannerTone = "accent" | "neutral" | "stale";

const BANNER_TONE: Record<BannerTone, { box: string; icon: string }> = {
  accent: { box: "border-accent/20 bg-accent-subtle", icon: "text-accent" },
  neutral: { box: "border-border bg-subtle", icon: "text-fg-faint" },
  stale: { box: "border-stale/30 bg-stale/10", icon: STALE_TEXT },
};

function Banner({
  tone,
  icon: Icon,
  actions,
  children,
}: {
  tone: BannerTone;
  icon: LucideIcon;
  actions?: ReactNode;
  children: ReactNode;
}) {
  const t = BANNER_TONE[tone];
  return (
    <div
      data-wf="LibraryBanner"
      data-tone={tone}
      className={cn("flex flex-col gap-2.5 rounded-md border px-3 py-2.5", t.box)}
    >
      <p className="flex items-start gap-2 text-base text-fg leading-5">
        <Icon
          aria-hidden
          size={14}
          strokeWidth={1.75}
          className={cn("mt-[3px] shrink-0", t.icon)}
        />
        <span className="min-w-0">{children}</span>
      </p>
      {actions && <div className="flex flex-wrap items-center gap-1.5 pl-[22px]">{actions}</div>}
    </div>
  );
}

// ---------------------------------------------------------------- details

function Details({ detail, overdue }: { detail: LibraryItemDetail; overdue: boolean }) {
  const s = detail.summary;
  return (
    <section data-wf="LibraryDetails" aria-label="Details">
      <dl className="grid grid-cols-[88px_minmax(0,1fr)] items-start gap-x-3 gap-y-2.5 text-sm">
        <Field label="Authors">
          {s.authors.length > 0 ? (
            <span className="flex min-w-0 items-center gap-2">
              <AuthorStack handles={s.authors} max={4} />
              <span className="min-w-0 truncate text-fg-muted">
                {s.authors.map((h) => `@${h}`).join(", ")}
              </span>
            </span>
          ) : (
            <Faint>None recorded</Faint>
          )}
        </Field>
        <Field label="Reviewed by">
          {detail.reviewed_by ? (
            <AuthorChip handle={detail.reviewed_by} size="sm" />
          ) : (
            <Faint>Not reviewed yet</Faint>
          )}
        </Field>
        <Field label="Created">
          <span className="tabular">{formatDate(s.created)}</span>
        </Field>
        <Field label="Last reviewed">
          {s.last_reviewed ? (
            <span className="tabular">{formatDate(s.last_reviewed)}</span>
          ) : (
            <Faint>Never</Faint>
          )}
        </Field>
        <Field label="Review after">
          {s.review_after ? (
            <span className={cn("tabular", overdue && STALE_TEXT)}>
              {formatDate(s.review_after)}
              {overdue && " · overdue"}
            </span>
          ) : (
            <Faint>No date set</Faint>
          )}
        </Field>
        {detail.superseded_by && s.status !== "retired" && (
          <Field label="Replaced by">
            <RefLink target={detail.superseded_by} />
          </Field>
        )}
        <Field label="Tags">
          {s.tags.length > 0 ? (
            <span className="flex flex-wrap gap-1">
              {s.tags.map((t) => (
                <Chip key={t}>{t}</Chip>
              ))}
            </span>
          ) : (
            <Faint>None</Faint>
          )}
        </Field>
        <Field label="Applies to">
          {s.applies_to.length > 0 ? (
            <span className="flex flex-wrap gap-1">
              {s.applies_to.map((a) => (
                <Chip key={a} tone="outline" className="font-mono">
                  {a}
                </Chip>
              ))}
            </span>
          ) : (
            <Faint>Everything</Faint>
          )}
        </Field>
      </dl>
    </section>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <>
      <dt className="pt-px text-fg-faint">{label}</dt>
      <dd className="min-w-0 text-fg">{children}</dd>
    </>
  );
}

function Faint({ children }: { children: ReactNode }) {
  return <span className="text-fg-faint">{children}</span>;
}

// ---------------------------------------------------------------- sources and backlinks

function Panel({
  name,
  title,
  aside,
  children,
}: {
  /** The element name for feedback: `data-wf`. */
  name: string;
  title: ReactNode;
  aside?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section data-wf={name} className="overflow-hidden rounded-md border border-border">
      <header className="flex h-8 items-center gap-2 border-border border-b bg-subtle px-3">
        <h3 className="font-medium text-fg text-sm">{title}</h3>
        {aside && <span className="ml-auto text-fg-faint text-xs">{aside}</span>}
      </header>
      {children}
    </section>
  );
}

function Sources({ sources }: { sources: Ref[] }) {
  return (
    <Panel name="LibrarySources" title="Sources" aside="Where this came from">
      {sources.length === 0 ? (
        <p className="px-3 py-2.5 text-fg-faint text-sm">
          No source recorded. Promote a learning or decision to give it one.
        </p>
      ) : (
        <ul className="divide-y divide-border">
          {sources.map((ref) => (
            <li key={ref.target} className="flex min-w-0 items-baseline gap-2 px-3 py-2 text-base">
              <Link2
                aria-hidden
                size={12}
                strokeWidth={1.75}
                className="shrink-0 translate-y-[1px] text-fg-faint"
              />
              <span className="min-w-0 text-fg-muted">
                Promoted from <RefLink target={ref.target} />
              </span>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}

function UsedBy({ backlinks }: { backlinks: Ref[] }) {
  const issues = useIssueMap();
  // A backlink may point at an entry inside an issue; the panel counts issues.
  const ids = useMemo(() => {
    const seen = new Set<string>();
    for (const ref of backlinks) {
      const issue = ref.issue ?? (ref.kind === "issue" ? ref.id : undefined) ?? ref.target;
      seen.add(issue.split("#")[0] ?? issue);
    }
    return [...seen];
  }, [backlinks]);

  return (
    <Panel
      name="LibraryUsedBy"
      title={
        <>
          Used by <span className="tabular">{ids.length}</span>{" "}
          {ids.length === 1 ? "issue" : "issues"}
        </>
      }
    >
      {ids.length === 0 ? (
        <p className="px-3 py-2.5 text-fg-faint text-sm">
          No issue cites this item yet. Agents record it in{" "}
          <code className="rounded-sm bg-muted px-1 py-px font-mono text-xs text-fg-muted">
            library_refs
          </code>{" "}
          when they use it.
        </p>
      ) : (
        <ul className="divide-y divide-border">
          {ids.map((issueId) => {
            const issue = issues.get(issueId);
            return (
              <li key={issueId} className="flex min-w-0 items-center gap-2 px-3 py-2 text-base">
                <span className="min-w-0 truncate">
                  <RefLink target={issueId} />
                </span>
                {issue && (
                  <>
                    <GroupPath path={issue.group_path} className="ml-auto max-w-[40%] shrink" />
                    <span className="shrink-0 text-fg-faint text-xs">
                      {STATUS_LABEL[issue.status]}
                    </span>
                  </>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </Panel>
  );
}

// ---------------------------------------------------------------- lint

function Findings({ findings }: { findings: Diagnostic[] }) {
  return (
    <Panel
      name="LibraryLint"
      title="Lint"
      aside={`${findings.length} ${findings.length === 1 ? "finding" : "findings"}`}
    >
      <ul className="divide-y divide-border">
        {findings.map((d, i) => (
          <li key={`${d.rule}-${d.line}-${i}`} className="flex items-start gap-2 px-3 py-2 text-sm">
            <TriangleAlert
              aria-hidden
              size={12}
              strokeWidth={1.75}
              className={cn(
                "mt-[3px] shrink-0",
                d.severity === "error"
                  ? "text-danger"
                  : d.severity === "warn"
                    ? STALE_TEXT
                    : "text-fg-faint",
              )}
            />
            <div className="min-w-0">
              <p className="text-fg-muted">
                <code className="mr-1.5 font-mono text-fg text-xs">{d.rule}</code>
                {d.message}
              </p>
              {d.fix && <p className="mt-0.5 text-fg-faint">{d.fix}</p>}
            </div>
          </li>
        ))}
      </ul>
    </Panel>
  );
}

// ---------------------------------------------------------------- loading and error

function ItemMessage({
  children,
  onClose,
  variant,
}: {
  children: ReactNode;
  onClose?: () => void;
  variant: "pane" | "screen";
}) {
  return (
    <div data-wf="LibraryItemView" data-state="missing" className="flex h-full min-h-0 flex-col">
      <div className="flex h-10 shrink-0 items-center gap-2 border-border border-b px-3 pl-5">
        {variant === "screen" && onClose ? (
          <Button variant="ghost" size="sm" onClick={onClose} className="-ml-3">
            <ArrowLeft aria-hidden size={14} strokeWidth={1.75} />
            Library
          </Button>
        ) : (
          <span className="font-medium text-fg-muted text-sm">Library item</span>
        )}
        {variant === "pane" && onClose && (
          <IconButton
            size="sm"
            label="Close"
            shortcut="Escape"
            icon={<X size={14} strokeWidth={1.75} />}
            onClick={onClose}
            className="ml-auto"
          />
        )}
      </div>
      <div className="flex min-h-0 flex-1 items-center justify-center">{children}</div>
    </div>
  );
}

function ItemSkeleton({ onClose, variant }: { onClose?: () => void; variant: "pane" | "screen" }) {
  return (
    <div
      data-wf="LibraryItemView"
      data-state="loading"
      role="status"
      aria-busy="true"
      aria-label="Loading library item"
      className="flex h-full min-h-0 flex-col"
    >
      <div className="flex h-10 shrink-0 items-center gap-2 border-border border-b px-3 pl-5">
        {variant === "screen" && onClose ? (
          <Button variant="ghost" size="sm" onClick={onClose} className="-ml-3">
            <ArrowLeft aria-hidden size={14} strokeWidth={1.75} />
            Library
          </Button>
        ) : (
          <>
            <Skeleton className="size-3.5" />
            <Skeleton className="h-3 w-14" />
            <Skeleton className="h-5 w-16" />
          </>
        )}
      </div>
      <div className="flex flex-col gap-5 px-5 py-4">
        <div className="flex flex-col gap-2.5">
          <Skeleton className="h-5 w-4/5" />
          <Skeleton className="h-3 w-1/2" />
          <Skeleton className="h-3.5 w-full" />
          <Skeleton className="h-3.5 w-2/3" />
        </div>
        <Skeleton className="h-16 w-full rounded-md" />
        {[0, 1, 2].map((i) => (
          <div key={i} className="flex flex-col gap-2">
            <Skeleton className="h-3 w-16" />
            <Skeleton className="h-3.5 w-full" />
            <Skeleton className="h-3.5 w-5/6" />
          </div>
        ))}
      </div>
    </div>
  );
}
