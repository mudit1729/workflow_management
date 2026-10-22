// The `## Links` section of goal.md as the Goal tab shows it: one row per bullet with the glyph
// of what it links. Library items, entries and issues are RefLinks. A glossary term opens the
// glossary, a file opens its source in the Workspace files view (a plain relative link would
// point nowhere in the app or in the static build). A bullet this grammar does not know keeps
// its markdown. Each row has a remove button on hover and focus: it takes that one bullet out
// of goal.md, and the toast offers to put it back.
import { BookA, ExternalLink, FileText, X } from "lucide-react";
import { type ReactNode, useState } from "react";
import { toast } from "sonner";
import { KindIcon, MarkdownProse, RefLink } from "@/components/common";
import { filesHref, useFilesNav } from "@/features/files/useFilesNav";
import { InlineCode, LibraryStatusChip } from "@/features/library/meta";
import type { Diagram } from "@/gen/types";
import { api, useSnapshot, useWriteWorkspaceFile } from "@/lib/api";
import { cn } from "@/lib/cn";
import { useGo } from "@/lib/nav";
import { type ParsedLink, parseLinkLine, withoutLink } from "./links";
import { DRAFT_NOTE } from "./types";

export interface LinkedContextProps {
  /** The text of the `## Links` section. */
  md: string;
  issueId: string;
  /** The issue folder, to turn a relative file link into a workspace path. */
  dir: string;
  diagrams?: Diagram[];
}

type Block = { type: "link"; link: ParsedLink } | { type: "prose"; md: string };
type Group = { type: "links"; links: ParsedLink[] } | { type: "prose"; md: string };

const BULLET = /^\s*[-*+]\s+/;

/** Bullets in order; consecutive lines this grammar does not know stay one markdown block. */
function blocks(md: string, dir: string): Block[] {
  const out: Block[] = [];
  for (const line of md.split("\n")) {
    if (line.trim() === "") continue;
    const link = parseLinkLine(line, dir);
    const last = out.at(-1);
    // A bullet this grammar does not know is still a row, with its markdown. Other text is prose.
    if (link.kind !== "text" || BULLET.test(line)) out.push({ type: "link", link });
    else if (last?.type === "prose") last.md += `\n${line}`;
    else out.push({ type: "prose", md: line });
  }
  return out;
}

export function LinkedContext({ md, issueId, dir, diagrams }: LinkedContextProps) {
  // Neighbouring links share one list; prose breaks the list.
  const groups: Group[] = [];
  for (const b of blocks(md, dir)) {
    const last = groups.at(-1);
    if (b.type === "prose") groups.push(b);
    else if (last?.type === "links") last.links.push(b.link);
    else groups.push({ type: "links", links: [b.link] });
  }
  return (
    <div data-wf="LinkedContext" className="flex min-w-0 flex-col gap-1.5">
      {groups.map((g, i) =>
        g.type === "prose" ? (
          <MarkdownProse key={i} md={g.md} issueId={issueId} diagrams={diagrams} compact />
        ) : (
          <ul key={i} className="flex min-w-0 flex-col gap-1">
            {g.links.map((link, j) => (
              <LinkRow key={`${link.line}-${j}`} link={link} issueId={issueId} dir={dir} />
            ))}
          </ul>
        ),
      )}
    </div>
  );
}

// ---------------------------------------------------------------- rows

const norm = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();

interface Removal {
  label: string;
  run: () => void;
  busy: boolean;
}

/**
 * Take one bullet out of `## Links` in goal.md. The file is read fresh, the bullet cut by its
 * text and the file written against the rev just read, so a change that landed meanwhile is a
 * conflict, not an overwrite. Undo writes the old text back.
 */
function useRemoval(link: ParsedLink, dir: string): Removal {
  const write = useWriteWorkspaceFile();
  const [busy, setBusy] = useState(false);
  const title = link.label || link.target;
  const run = async () => {
    if (busy) return;
    setBusy(true);
    const path = `${dir}/goal.md`;
    try {
      const file = await api.file(path);
      const before = file.text ?? undefined;
      const after = before === undefined ? undefined : withoutLink(before, link.line);
      if (before === undefined || after === undefined) {
        toast.error("Could not remove the link", {
          description: "goal.md changed under this list. Try again in a moment.",
        });
        return;
      }
      const res = await write({ path, text: after, base_rev: file.rev });
      if (!res) return; // the hook explained the failure
      toast.success(`Removed ${title}`, {
        description: "Taken out of Links in goal.md.",
        action: {
          label: "Undo",
          onClick: () => void write({ path, text: before, base_rev: res.rev }),
        },
      });
    } catch (err) {
      toast.error("Could not remove the link", {
        description: err instanceof Error ? err.message : "Try again in a moment.",
      });
    } finally {
      setBusy(false);
    }
  };
  return { label: `Remove ${title}`, run: () => void run(), busy };
}

/** One bullet. RefLinks bring their own glyph; the other kinds put theirs in front, the same size. */
function Row({
  icon,
  removal,
  children,
}: {
  icon?: ReactNode;
  removal?: Removal;
  children: ReactNode;
}) {
  return (
    <li className="group/row flex min-w-0 flex-wrap items-baseline gap-x-2 gap-y-0.5 text-sm">
      {icon ? (
        <span className="inline-flex min-w-0 items-baseline gap-1">
          <span aria-hidden className="flex shrink-0 translate-y-[3px] text-fg-muted">
            {icon}
          </span>
          {children}
        </span>
      ) : (
        children
      )}
      {removal && (
        <button
          type="button"
          aria-label={removal.label}
          title={removal.label}
          disabled={removal.busy}
          onClick={removal.run}
          className={cn(
            "ml-auto flex size-5 shrink-0 cursor-default items-center justify-center self-center rounded-sm text-fg-faint",
            "transition-[opacity,background-color,color] duration-100 ease-wf hover:bg-muted hover:text-fg disabled:opacity-40",
            "opacity-0 focus-visible:opacity-100 group-focus-within/row:opacity-100 group-hover/row:opacity-100 [@media(hover:none)]:opacity-100",
          )}
        >
          <X aria-hidden size={14} strokeWidth={1.75} />
        </button>
      )}
    </li>
  );
}

/** The quiet words after a link. A label is markdown-light: `code` spans render as code. */
const Faint = ({ children, mono }: { children: ReactNode; mono?: boolean }) => (
  <span className={cn("min-w-0 break-words text-fg-faint", mono && "font-mono text-xs")}>
    {typeof children === "string" && !mono ? (
      <InlineCode text={children} className="text-xs text-fg-muted" />
    ) : (
      children
    )}
  </span>
);

/** `D-` is a decision, `L-` a learning, `C-` a change, the rest are ids inside the issue. */
function entryKind(target: string): "decision" | "tip" | "progress" {
  const sub = target.slice(target.indexOf("#") + 1);
  return sub.startsWith("D-") ? "decision" : sub.startsWith("L-") ? "tip" : "progress";
}

function LinkRow({ link, issueId, dir }: { link: ParsedLink; issueId: string; dir: string }) {
  const removal = useRemoval(link, dir);
  switch (link.kind) {
    case "library":
      return <LibraryRow link={link} issueId={issueId} removal={removal} />;
    case "entry":
      return (
        <Row icon={<KindIcon kind={entryKind(link.target)} size={14} />} removal={removal}>
          <RefLink target={link.target} issueId={issueId} />
          {link.label && <Faint>{link.label}</Faint>}
        </Row>
      );
    case "issue":
      // RefLink carries the status glyph of the issue itself.
      return (
        <Row removal={removal}>
          <RefLink target={link.target} issueId={issueId} />
          {link.label && <Faint>{link.label}</Faint>}
        </Row>
      );
    case "term":
      return <TermRow link={link} removal={removal} />;
    case "file":
      return <FileRow link={link} dir={dir} removal={removal} />;
    case "url":
      return (
        <Row icon={<ExternalLink size={14} strokeWidth={1.75} />} removal={removal}>
          <a
            href={link.target}
            target="_blank"
            rel="noopener noreferrer"
            className="min-w-0 break-words text-accent underline decoration-accent/30 underline-offset-[3px] hover:decoration-accent"
          >
            {link.label || link.target}
          </a>
        </Row>
      );
    default:
      return (
        <Row removal={removal}>
          <MarkdownProse
            md={link.line.replace(BULLET, "")}
            issueId={issueId}
            className="min-w-0"
            compact
          />
        </Row>
      );
  }
}

function LibraryRow({
  link,
  issueId,
  removal,
}: {
  link: ParsedLink;
  issueId: string;
  removal: Removal;
}) {
  const item = useSnapshot().data?.library.find((l) => l.id === link.target);
  const same = item && norm(item.title) === norm(link.label);
  return (
    <Row removal={removal}>
      <RefLink target={link.target} issueId={issueId} />
      {item?.status === "draft" && (
        <span title={DRAFT_NOTE} className="inline-flex shrink-0 translate-y-px">
          <LibraryStatusChip status="draft" size="xs" />
        </span>
      )}
      {link.label && !same && <Faint>{link.label}</Faint>}
    </Row>
  );
}

function TermRow({ link, removal }: { link: ParsedLink; removal: Removal }) {
  const go = useGo();
  return (
    <Row icon={<BookA size={14} strokeWidth={1.75} />} removal={removal}>
      <button
        type="button"
        title="Open the glossary"
        onClick={() => void go.library({ tab: "glossary", q: link.target })}
        className="rounded-sm font-medium text-fg underline decoration-1 decoration-border-strong underline-offset-[3px] transition-colors duration-100 hover:bg-muted hover:decoration-fg-muted"
      >
        {link.target}
      </button>
      {link.label && <Faint>{link.label}</Faint>}
    </Row>
  );
}

function FileRow({ link, dir, removal }: { link: ParsedLink; dir: string; removal: Removal }) {
  const files = useFilesNav();
  const inside = link.target.startsWith(`${dir}/`);
  const shown = inside ? link.target.slice(dir.length + 1) : link.target;
  return (
    <Row icon={<FileText size={14} strokeWidth={1.75} />} removal={removal}>
      <a
        href={filesHref(link.target)}
        onClick={(e) => {
          if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
          e.preventDefault();
          void files.open(link.target);
        }}
        title={`Open ${link.target} in Workspace files`}
        className="min-w-0 break-words font-medium text-fg underline decoration-1 decoration-border-strong underline-offset-[3px] transition-colors duration-100 hover:bg-muted hover:decoration-fg-muted"
      >
        {link.label || shown}
      </a>
      <Faint mono>{shown}</Faint>
    </Row>
  );
}
