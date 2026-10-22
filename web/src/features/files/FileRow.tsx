// The two kinds of row in the workspace tree: a folder (a group, an issue, a library kind or
// a plain folder) and a file. Both are flat `treeitem`s with aria-level, like GroupTree, so each
// gets its own focus ring and the arrow keys walk the visible rows.
import {
  ChevronRight,
  File,
  FileCog,
  FileImage,
  FileText,
  Folder,
  FolderOpen,
  Library,
} from "lucide-react";
import type { ReactNode } from "react";
import { lintSummary, StatusIcon } from "@/components/common";
import { Tooltip } from "@/components/ui";
import type { LintCounts } from "@/gen/types";
import { cn } from "@/lib/cn";
import type { FileNode, FolderNode } from "./tree";
import { totalLint } from "./tree";

export interface RowProps {
  depth: number;
  posinset: number;
  setsize: number;
  selected: boolean;
  tabbable: boolean;
  rowRef: (el: HTMLDivElement | null) => void;
  onFocus: () => void;
}

const ICON = { size: 14, strokeWidth: 1.75 } as const;
const indent = (depth: number) => 6 + depth * 12;

const rowBase =
  "group/row flex h-7 pointer-coarse:h-9 cursor-pointer select-none items-center gap-1.5 rounded-md pr-1.5 text-base transition-colors duration-100 ease-wf outline-none focus-visible:ring-2 focus-visible:ring-focus";

/** A dot (and a count) for the findings under a row, colored by the worst severity. */
export function LintMark({ counts, count = true }: { counts: LintCounts; count?: boolean }) {
  const total = totalLint(counts);
  if (total === 0) return null;
  const color = counts.error ? "bg-danger" : counts.warn ? "bg-stale" : "bg-fg-faint";
  const summary = lintSummary(counts);
  return (
    <Tooltip content={summary} side="right">
      <span
        data-wf="LintMark"
        role="img"
        aria-label={summary}
        className="flex shrink-0 items-center gap-1"
      >
        <span className={cn("size-1.5 rounded-full", color)} />
        {count && total > 1 && <span className="tabular text-fg-faint text-xs">{total}</span>}
      </span>
    </Tooltip>
  );
}

function FileGlyph({ kind }: { kind: FileNode["info"]["kind"] }) {
  if (kind === "image") return <FileImage {...ICON} />;
  if (kind === "toml") return <FileCog {...ICON} />;
  if (kind === "md") return <FileText {...ICON} />;
  return <File {...ICON} />;
}

export interface FileRowProps extends RowProps {
  node: FileNode;
  onSelect: () => void;
}

export function FileRow({
  node,
  depth,
  posinset,
  setsize,
  selected,
  tabbable,
  rowRef,
  onFocus,
  onSelect,
}: FileRowProps) {
  const lint = totalLint(node.lint) > 0 ? `, ${lintSummary(node.lint).toLowerCase()}` : "";
  return (
    <div
      ref={rowRef}
      data-wf="FileRow"
      data-path={node.path}
      role="treeitem"
      tabIndex={tabbable ? 0 : -1}
      aria-level={depth + 1}
      aria-posinset={posinset}
      aria-setsize={setsize}
      aria-selected={selected}
      aria-label={`${node.name}${lint}`}
      title={node.path}
      onFocus={onFocus}
      onClick={onSelect}
      className={cn(
        rowBase,
        selected ? "bg-muted text-fg" : "text-fg-muted hover:bg-muted/70 hover:text-fg",
      )}
      style={{ paddingLeft: indent(depth) }}
    >
      <span aria-hidden className="size-4 shrink-0" />
      <span
        aria-hidden
        className={cn("flex shrink-0", selected ? "text-fg-muted" : "text-fg-faint")}
      >
        <FileGlyph kind={node.info.kind} />
      </span>
      <span className="min-w-0 flex-1 truncate font-mono text-sm">{node.name}</span>
      <LintMark counts={node.lint} />
    </div>
  );
}

export interface FolderRowProps extends RowProps {
  node: FolderNode;
  open: boolean;
  onToggle: () => void;
}

function FolderMarker({ node, open }: { node: FolderNode; open: boolean }): ReactNode {
  if (node.role === "issue" && node.status) return <StatusIcon status={node.status} size={14} />;
  if (node.role === "group" && node.color) {
    return (
      <span
        aria-hidden
        className="size-2 rounded-full"
        style={{ background: `var(--wf-hue-${node.color})` }}
      />
    );
  }
  if (node.role === "group") {
    return <span aria-hidden className="size-2 rounded-full border border-fg-faint" />;
  }
  if (node.path.endsWith("library") && node.role === "section") return <Library {...ICON} />;
  return open ? <FolderOpen {...ICON} /> : <Folder {...ICON} />;
}

export function FolderRow({
  node,
  depth,
  posinset,
  setsize,
  selected,
  tabbable,
  rowRef,
  onFocus,
  open,
  onToggle,
}: FolderRowProps) {
  const heading = node.role === "workspace" || node.role === "section";
  const label = node.title ?? node.name;
  const lint = totalLint(node.lint) > 0 ? `, ${lintSummary(node.lint).toLowerCase()}` : "";
  return (
    <div
      ref={rowRef}
      data-wf="FolderRow"
      data-path={node.path}
      data-role={node.role}
      role="treeitem"
      tabIndex={tabbable ? 0 : -1}
      aria-level={depth + 1}
      aria-posinset={posinset}
      aria-setsize={setsize}
      aria-selected={selected}
      aria-expanded={open}
      aria-label={`${label}, ${node.fileCount} ${node.fileCount === 1 ? "file" : "files"}${lint}`}
      onFocus={onFocus}
      onClick={onToggle}
      className={cn(rowBase, "text-fg-muted hover:bg-muted/70 hover:text-fg")}
      style={{ paddingLeft: indent(depth) }}
    >
      <span aria-hidden className="flex size-4 shrink-0 items-center justify-center text-fg-faint">
        <ChevronRight
          size={12}
          strokeWidth={2}
          className={cn("transition-transform duration-150 ease-wf", open && "rotate-90")}
        />
      </span>
      {!heading && (
        <span aria-hidden className="flex w-3.5 shrink-0 items-center justify-center text-fg-faint">
          <FolderMarker node={node} open={open} />
        </span>
      )}
      {node.role === "issue" ? (
        <>
          <span className={cn("min-w-0 truncate", node.title ? "text-fg" : "font-mono text-sm")}>
            {label}
          </span>
          {node.title && (
            <span className="min-w-0 flex-1 truncate font-mono text-fg-faint text-xs">
              {node.name}
            </span>
          )}
          {!node.title && <span className="flex-1" />}
        </>
      ) : (
        <span
          className={cn(
            "min-w-0 flex-1 truncate",
            heading && "font-medium text-fg-faint text-xs",
            node.role === "group" && node.implicit && "text-fg-faint italic",
            node.role === "plain" && "font-mono text-sm",
            node.role === "library" && "font-mono text-sm",
          )}
        >
          {label}
        </span>
      )}
      {!open && <LintMark counts={node.lint} count={false} />}
    </div>
  );
}
