// One library item, read from its markdown file. The page is the rendered file (frontmatter as
// properties, then every section in file order, each block tied to its line); "Source" shows
// the text itself with its lint markers, edge to edge under the same toolbar, and Edit opens the
// editor right there in either mode. Around the document: the draft, retired and overdue banners,
// where the item came from and which issues use it.
import {
  ArrowLeft,
  Check,
  FilePen,
  Hourglass,
  Info,
  Link2,
  type LucideIcon,
  Pencil,
  SearchX,
  TriangleAlert,
  X,
} from "lucide-react";
import { type ReactNode, type Ref as ReactRef, useMemo, useRef, useState } from "react";
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
import { Button, Chip, IconButton, Segmented, Skeleton, Tooltip } from "@/components/ui";
import { requestFileEdit } from "@/features/files/intent";
import { SourceView } from "@/features/files/SourceView";
import type { Diagnostic, LibId, LibraryItemDetail, Ref } from "@/gen/types";
import { useApproveLibrary, useIssueMap, useLibraryItem, useWorkspaceFile } from "@/lib/api";
import { cn } from "@/lib/cn";
import { STATUS_LABEL } from "@/lib/status";
import { MarkdownDocument, Properties, Property } from "./MarkdownDocument";
import { frontmatterRefs, splitFrontmatter } from "./markdown";
import { formatDate, InlineCode, LibraryStatusChip, sortSections } from "./meta";

/** The item as the page it renders to, or as the text it is written in. */
export type LibraryItemMode = "rendered" | "source";

export interface LibraryItemViewProps {
  id: LibId;
  /** Closes the pane (or goes back, on a small screen). Without it no close button shows. */
  onClose?: () => void;
  /** `screen` is the small-screen variant: the item fills the page and the button reads "Library". */
  variant?: "pane" | "screen";
  /** Which view opens first. Default: the rendered page. */
  defaultView?: LibraryItemMode;
}

export function LibraryItemView({
  id,
  onClose,
  variant = "pane",
  defaultView = "rendered",
}: LibraryItemViewProps) {
  const query = useLibraryItem(id);
  const detail = query.data;

  if (!detail) {
    if (query.isPending) return <ItemSkeleton onClose={onClose} variant={variant} />;
    const status = (query.error as { status?: number } | null)?.status;
    const missing = !query.isError || status === 404;
    return (
      <ItemMessage onClose={onClose} variant={variant}>
        <EmptyState
          icon={<SearchX strokeWidth={1.75} />}
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

  // Keyed by id: selecting another item resets the scroll position and the view.
  return (
    <ItemBody
      key={detail.summary.id}
      detail={detail}
      onClose={onClose}
      variant={variant}
      defaultView={defaultView}
    />
  );
}

// ---------------------------------------------------------------- body

function ItemBody({
  detail,
  onClose,
  variant,
  defaultView,
}: {
  detail: LibraryItemDetail;
  onClose?: () => void;
  variant: "pane" | "screen";
  defaultView: LibraryItemMode;
}) {
  const s = detail.summary;
  const path = detail.edit.file || s.path;
  const overdue = s.review_overdue && s.status !== "retired";
  // The overdue banner already says it; keep the panel for other findings.
  const findings = detail.diagnostics.filter((d) => !(overdue && d.rule === "Q013"));
  const [mode, setMode] = useState<LibraryItemMode>(defaultView);
  const [line, setLine] = useState<number>();
  const [editing, setEditing] = useState(false);
  const editButton = useRef<HTMLButtonElement>(null);
  const file = useWorkspaceFile(path);
  const text = file.data?.text ?? undefined;

  const showSource = (at: number) => {
    setLine(at);
    setMode("source");
  };

  // Edit opens the editor in the source view, in whichever view the person is.
  const edit = () => {
    requestFileEdit({ path });
    if (mode !== "source") {
      setLine(undefined);
      setMode("source");
    }
  };
  const changeMode = (next: LibraryItemMode) => {
    if (editing) {
      toast("Save or cancel your edit first", { description: "Switching view would drop it." });
      return;
    }
    setLine(undefined);
    setMode(next);
  };
  const hasBanner = s.status === "draft" || s.status === "retired" || overdue;

  return (
    <div
      data-wf="LibraryItemView"
      data-status={s.status}
      data-view={mode}
      className="flex h-full min-h-0 flex-col"
    >
      <Toolbar
        detail={detail}
        mode={mode}
        onMode={changeMode}
        onEdit={edit}
        editing={editing}
        editRef={editButton}
        onClose={onClose}
        variant={variant}
      />
      <PathRow id={s.id} path={path} retire={s.status === "reviewed"} />

      {mode === "source" ? (
        // The text fills the pane under the toolbar and the one path row: no second header, no card.
        <div className="flex min-h-0 flex-1 flex-col">
          {hasBanner && (
            <div className="shrink-0 px-6 pt-4 pb-1">
              <Banners detail={detail} overdue={overdue} />
            </div>
          )}
          <SourceView
            path={path}
            variant="inline"
            embedded
            line={line}
            showViewToggle={false}
            returnFocusTo={editButton}
            onEditingChange={setEditing}
            onDeleted={onClose}
          />
        </div>
      ) : (
        <div className="min-h-0 flex-1 overflow-y-auto">
          <div className="flex flex-col gap-5 px-6 py-4">
            <Banners detail={detail} overdue={overdue} />

            {text !== undefined ? (
              <MarkdownDocument
                path={path}
                text={text}
                variant="pane"
                margin={24}
                frontmatter={<ItemFrontmatter detail={detail} text={text} overdue={overdue} />}
                onJump={showSource}
              />
            ) : file.isPending ? (
              <DocumentSkeleton />
            ) : (
              <ParsedSections
                detail={detail}
                overdue={overdue}
                onRetry={() => void file.refetch()}
              />
            )}

            <Sources
              sources={detail.source}
              written={text ? frontmatterRefs(text, "source") : []}
            />
            <UsedBy backlinks={detail.backlinks} />
            {findings.length > 0 && <Findings findings={findings} />}
          </div>
        </div>
      )}
    </div>
  );
}

/** The file could not be read: show what the server parsed from it, and say so. */
function ParsedSections({
  detail,
  overdue,
  onRetry,
}: {
  detail: LibraryItemDetail;
  overdue: boolean;
  onRetry: () => void;
}) {
  const sections = useMemo(
    () => sortSections(detail.summary.kind, detail.sections),
    [detail.summary.kind, detail.sections],
  );
  return (
    <div className="flex flex-col gap-4">
      <ItemFrontmatter detail={detail} overdue={overdue} />
      <p className="flex items-center gap-2 text-fg-faint text-sm">
        <Info aria-hidden size={14} strokeWidth={1.75} className="shrink-0" />
        <span>
          The file did not load, so this is the parsed copy.{" "}
          <button type="button" onClick={onRetry} className="text-fg-muted underline">
            Try again
          </button>
        </span>
      </p>
      {sections.map((section, i) => (
        <section key={`${section.heading}-${i}`} aria-label={section.heading}>
          <h3 className="mb-1.5 font-semibold text-fg text-md">{section.heading}</h3>
          <MarkdownProse md={section.body_md} document="pane" />
        </section>
      ))}
    </div>
  );
}

function DocumentSkeleton() {
  return (
    <div
      role="status"
      aria-busy="true"
      aria-label="Loading the file"
      className="flex flex-col gap-4"
    >
      <div className="flex flex-col gap-2.5">
        <Skeleton className="h-5 w-4/5" />
        <Skeleton className="h-3.5 w-full" />
        <Skeleton className="h-3.5 w-2/3" />
      </div>
      <Skeleton className="h-16 w-full rounded-md" />
      {[0, 1, 2].map((i) => (
        <div key={i} className="flex flex-col gap-2">
          <Skeleton className="h-3.5 w-16" />
          <Skeleton className="h-3.5 w-full" />
          <Skeleton className="h-3.5 w-5/6" />
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------- toolbar

function Toolbar({
  detail,
  mode,
  onMode,
  onEdit,
  editing,
  editRef,
  onClose,
  variant,
}: {
  detail: LibraryItemDetail;
  mode: LibraryItemMode;
  onMode: (mode: LibraryItemMode) => void;
  onEdit: () => void;
  /** The editor is open: Edit stays where it is, taken. */
  editing: boolean;
  editRef: ReactRef<HTMLButtonElement>;
  onClose?: () => void;
  variant: "pane" | "screen";
}) {
  const s = detail.summary;
  return (
    <div className="flex min-h-10 shrink-0 flex-wrap items-center gap-x-2 gap-y-1 border-border border-b py-1 pr-3 pl-5">
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
      <div className="ml-auto flex shrink-0 items-center gap-1.5">
        <Segmented
          size="sm"
          aria-label="Show the rendered page or the markdown source"
          value={mode}
          onChange={onMode}
          options={[
            { value: "rendered", label: "Rendered" },
            { value: "source", label: "Source" },
          ]}
        />
        {/* One Edit in both views, so the switch beside it never moves. */}
        <Tooltip content={editing ? "Editing this file" : "Edit this file"}>
          <Button
            ref={editRef}
            variant="secondary"
            size="sm"
            onClick={editing ? undefined : onEdit}
            aria-disabled={editing || undefined}
          >
            <Pencil aria-hidden size={14} strokeWidth={1.75} />
            Edit
          </Button>
        </Tooltip>
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

/** The id and the file the page is read from, both copyable. The folder gives way before the name. */
function PathRow({ id, path, retire }: { id: string; path: string; retire: boolean }) {
  const cut = path.lastIndexOf("/") + 1;
  return (
    <div
      data-wf="LibraryPathRow"
      className="@container flex h-8 shrink-0 items-center gap-1 border-border border-b pr-3 pl-5 text-fg-faint text-xs"
    >
      <code className="shrink-0 whitespace-nowrap font-mono">{id}</code>
      <CopyButton text={id} label="Copy id" />
      <span aria-hidden>·</span>
      <code className="flex min-w-0 font-mono" title={path}>
        {/* The folder gives way first, then the name. */}
        <span className="min-w-0 shrink-[20] truncate">{path.slice(0, cut)}</span>
        <span className="min-w-0 truncate">{path.slice(cut)}</span>
      </code>
      <CopyButton text={path} label="Copy file path" />
      {retire && (
        <span className="ml-auto hidden shrink-0 @[500px]:block">
          <RetireButton />
        </span>
      )}
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
              <Check aria-hidden size={14} strokeWidth={1.75} />
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
  stale: { box: "border-stale/30 bg-stale/10", icon: "text-stale-text" },
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

// ---------------------------------------------------------------- frontmatter

/**
 * The top of the page: title and description, then the properties of the file. The values are the
 * parsed ones (author chips, dates, overdue tone); each carries the line of its key in the file.
 */
function ItemFrontmatter({
  detail,
  text,
  overdue,
}: {
  detail: LibraryItemDetail;
  text?: string;
  overdue: boolean;
}) {
  const s = detail.summary;
  const lines = useMemo(
    () => new Map((text ? (splitFrontmatter(text).entries ?? []) : []).map((e) => [e.key, e.line])),
    [text],
  );
  return (
    <header data-wf="LibraryItemHeader" className="flex min-w-0 flex-col gap-2">
      {/* The page's h1 is the Library's; the item is the next level. */}
      <h2
        title={lines.has("title") ? `line ${lines.get("title")}` : undefined}
        className={cn(
          "font-semibold text-fg text-lg leading-snug",
          s.status === "retired" && "text-fg-muted",
        )}
      >
        {s.title}
      </h2>
      <p
        title={lines.has("description") ? `line ${lines.get("description")}` : undefined}
        className="text-base text-fg-muted leading-relaxed"
      >
        <InlineCode text={s.description} className="text-fg-muted" />
      </p>
      <section data-wf="LibraryDetails" aria-label="Details">
        <Properties>
          <Property label="authors" wide line={lines.get("authors")}>
            {s.authors.length > 0 ? (
              <span className="flex min-w-0 items-center gap-2">
                <AuthorStack handles={s.authors} max={4} />
                <span className="min-w-0 truncate">{s.authors.map((h) => `@${h}`).join(", ")}</span>
              </span>
            ) : (
              <Faint>None recorded</Faint>
            )}
          </Property>
          <Property label="reviewed_by" line={lines.get("reviewed_by")}>
            {detail.reviewed_by ? (
              <AuthorChip handle={detail.reviewed_by} size="sm" />
            ) : (
              <Faint>Not reviewed yet</Faint>
            )}
          </Property>
          <Property label="created" line={lines.get("created")}>
            <span className="tabular">{formatDate(s.created)}</span>
          </Property>
          <Property label="last_reviewed" line={lines.get("last_reviewed")}>
            {s.last_reviewed ? (
              <span className="tabular">{formatDate(s.last_reviewed)}</span>
            ) : (
              <Faint>Never</Faint>
            )}
          </Property>
          <Property label="review_after" line={lines.get("review_after")}>
            {s.review_after ? (
              <span className={cn("tabular", overdue && "text-stale-text")}>
                {formatDate(s.review_after)}
                {overdue && " · overdue"}
              </span>
            ) : (
              <Faint>No date set</Faint>
            )}
          </Property>
          {detail.superseded_by && s.status !== "retired" && (
            <Property label="superseded_by" line={lines.get("superseded_by")}>
              <RefLink target={detail.superseded_by} />
            </Property>
          )}
          <Property label="tags" wide line={lines.get("tags")}>
            {s.tags.length > 0 ? (
              <span className="flex flex-wrap gap-1">
                {s.tags.map((t) => (
                  <Chip key={t}>{t}</Chip>
                ))}
              </span>
            ) : (
              <Faint>None</Faint>
            )}
          </Property>
          <Property label="applies_to" wide line={lines.get("applies_to")}>
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
          </Property>
        </Properties>
      </section>
    </header>
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

function Sources({ sources, written }: { sources: Ref[]; written: string[] }) {
  // The server drops a source that no longer resolves. The file still names it: show it as a
  // dangling reference instead of claiming that no source was recorded.
  const unresolved = written.filter((t) => !sources.some((ref) => ref.target === t));
  return (
    <Panel name="LibrarySources" title="Sources" aside="Where this came from">
      {sources.length === 0 && unresolved.length === 0 ? (
        <p className="px-3 py-2.5 text-fg-faint text-sm">
          No source recorded. Promote a learning or decision to give it one.
        </p>
      ) : (
        <ul className="divide-y divide-border">
          {sources.map((ref) => (
            <SourceRow key={ref.target}>
              <RefLink target={ref.target} />
            </SourceRow>
          ))}
          {unresolved.map((target) => (
            <SourceRow key={target}>
              <RefLink target={target} />
              <span className="ml-2 text-fg-faint text-sm">Not in this workspace</span>
            </SourceRow>
          ))}
        </ul>
      )}
    </Panel>
  );
}

function SourceRow({ children }: { children: ReactNode }) {
  return (
    <li className="flex min-w-0 items-baseline gap-2 px-3 py-2 text-base">
      <Link2
        aria-hidden
        size={14}
        strokeWidth={1.75}
        className="shrink-0 translate-y-[2px] text-fg-faint"
      />
      <span className="min-w-0 text-fg-muted">Promoted from {children}</span>
    </li>
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
              size={14}
              strokeWidth={1.75}
              className={cn(
                "mt-px shrink-0",
                d.severity === "error"
                  ? "text-danger"
                  : d.severity === "warn"
                    ? "text-stale-text"
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
