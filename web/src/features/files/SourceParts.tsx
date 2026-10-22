// The smaller pieces of SourceView: the file kind, the meta line with its findings button, the
// toml note, the loading skeleton, the not-found and image bodies, and the header link.
import {
  ChevronsUpDown,
  File,
  FileCog,
  FileImage,
  FileText,
  FileX,
  Info,
  Plus,
} from "lucide-react";
import { useState } from "react";
import { EmptyState } from "@/components/common";
import { Button, Skeleton } from "@/components/ui";
import type { Diagnostic, Severity } from "@/gen/types";
import { cn } from "@/lib/cn";
import { formatBytes } from "@/lib/format";
import type { useGo, useOpenIssue } from "@/lib/nav";
import type { useFileContext } from "./context";
import { basename, extension, ISSUE_FILE_TARGET, isIssueFileName } from "./paths";
import { SeverityGlyph, worstSeverity } from "./SourceGutter";
import { FilesLink } from "./useFilesNav";

const ICON = { size: 14, strokeWidth: 1.75 } as const;

export type FileKind = "md" | "toml" | "image" | "other";

export function fileKind(path: string): FileKind {
  const ext = extension(path);
  if (ext === ".md") return "md";
  if (ext === ".toml") return "toml";
  if (/^\.(png|jpe?g|gif|webp|svg|avif)$/.test(ext)) return "image";
  return "other";
}

export function KindGlyph({ kind, ext }: { kind: FileKind; ext: string }) {
  if (kind === "image") return <FileImage {...ICON} />;
  if (kind === "toml" || ext === ".toml") return <FileCog {...ICON} />;
  if (kind === "md") return <FileText {...ICON} />;
  return <File {...ICON} />;
}

export function Meta({
  rev,
  bytes,
  lines,
  hint,
  diagnostics,
  onJump,
  kind,
}: {
  rev: string;
  bytes: number;
  lines: number;
  hint?: string;
  diagnostics: Diagnostic[];
  onJump: () => void;
  kind: FileKind;
}) {
  return (
    <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1 text-fg-faint text-xs">
      <span className="font-mono" title={`Revision ${rev}`}>
        rev {rev.slice(0, 7)}
      </span>
      <span className="tabular">{formatBytes(bytes)}</span>
      {kind !== "image" && lines > 0 && <span className="tabular">{lines} lines</span>}
      {diagnostics.length > 0 && <FindingsButton diagnostics={diagnostics} onJump={onJump} />}
      {hint && <span className="min-w-0 basis-full truncate sm:basis-auto">{hint}</span>}
    </div>
  );
}

const SEVERITY_ORDER: Severity[] = ["error", "warn", "info"];

function FindingsButton({
  diagnostics,
  onJump,
}: {
  diagnostics: Diagnostic[];
  onJump: () => void;
}) {
  const worst = worstSeverity(diagnostics);
  const counts = SEVERITY_ORDER.map(
    (s) => [s, diagnostics.filter((d) => d.severity === s).length] as const,
  )
    .filter(([, n]) => n > 0)
    .map(
      ([s, n]) =>
        `${n} ${s === "error" ? (n === 1 ? "error" : "errors") : s === "warn" ? (n === 1 ? "warning" : "warnings") : "info"}`,
    )
    .join(" · ");
  const total = diagnostics.length;
  return (
    <button
      type="button"
      onClick={onJump}
      title={`${counts}. Click to jump to a finding.`}
      className="inline-flex h-5 items-center gap-1 rounded-sm px-1 font-medium text-fg-muted transition-colors duration-100 hover:bg-muted hover:text-fg"
    >
      <SeverityGlyph severity={worst} />
      <span className="tabular">
        {total} {total === 1 ? "finding" : "findings"}
      </span>
      <ChevronsUpDown size={10} strokeWidth={2} aria-hidden className="text-fg-faint" />
    </button>
  );
}

export function TomlNote({ name }: { name: string }) {
  return (
    <p
      data-wf="TomlNote"
      className="mx-4 mb-2 flex shrink-0 items-start gap-2 rounded-md border border-border bg-subtle px-2.5 py-1.5 text-fg-muted text-sm"
    >
      <Info {...ICON} className="mt-0.5 shrink-0 text-fg-faint" aria-hidden />
      <span>
        {name} holds workspace settings and is read as TOML. Saving it changes which lint rules run
        and the lease and staleness limits. A typo shows as a finding on this file.
      </span>
    </p>
  );
}

// ---------------------------------------------------------------- bodies

export function SourceSkeleton({ inline }: { inline: boolean }) {
  const widths = [38, 64, 52, 0, 72, 46, 58, 33, 0, 61, 49, 70, 41, 55];
  return (
    <div
      data-wf="SourceSkeleton"
      role="status"
      aria-busy="true"
      aria-label="Loading file"
      className={cn(
        "flex min-h-0 flex-1 flex-col gap-2.5 overflow-hidden",
        inline ? "rounded-md border border-border p-3" : "border-border border-t px-4 py-3",
      )}
    >
      {widths.map((w, i) => (
        <div key={i} className="flex items-center gap-4">
          <Skeleton className="h-2.5 w-5 shrink-0" />
          {w > 0 && <Skeleton className="h-2.5" style={{ width: `${w}%` }} />}
        </div>
      ))}
    </div>
  );
}

export function NotFound({
  path,
  inline,
  onBack,
  onCreate,
}: {
  path: string;
  inline: boolean;
  onBack?: () => void;
  onCreate?: () => void;
}) {
  return (
    <div data-wf="FileNotFound" className="flex min-h-0 flex-1 items-center justify-center">
      <EmptyState
        icon={<FileX />}
        title={
          <>
            No file at <code className="break-all font-mono text-fg">{path}</code>
          </>
        }
        hint="It may have been renamed or deleted. The board no longer reads it."
        action={
          <div className="flex flex-wrap items-center justify-center gap-2">
            {onBack && inline ? (
              <Button variant="secondary" size="sm" onClick={onBack}>
                Back to files
              </Button>
            ) : (
              <FilesLink
                className="inline-flex h-6 items-center rounded-md border border-border px-2 font-medium text-fg text-sm transition-colors duration-100 hover:bg-subtle"
                onNavigate={onBack}
              >
                Back to all files
              </FilesLink>
            )}
            {onCreate && (
              <Button variant="ghost" size="sm" onClick={onCreate}>
                <Plus {...ICON} aria-hidden />
                Create this file
              </Button>
            )}
          </div>
        }
      />
    </div>
  );
}

export function ImageBody({
  path,
  url,
  bytes,
  inline,
}: {
  path: string;
  url?: string;
  bytes: number;
  inline: boolean;
}) {
  const [dims, setDims] = useState<{ w: number; h: number } | null>(null);
  const [failed, setFailed] = useState(false);
  if (!url || failed) {
    return (
      <div className="flex min-h-0 flex-1 items-center justify-center">
        <EmptyState
          icon={<FileImage />}
          title="Could not load this image"
          hint={`${formatBytes(bytes)}. The file may have moved.`}
        />
      </div>
    );
  }
  return (
    <div
      data-wf="ImagePreview"
      className={cn(
        "flex min-h-0 flex-1 flex-col items-center gap-2 overflow-auto bg-subtle p-4",
        inline ? "rounded-md border border-border" : "border-border border-t",
      )}
    >
      <img
        src={url}
        alt={basename(path)}
        onLoad={(e) =>
          setDims({ w: e.currentTarget.naturalWidth, h: e.currentTarget.naturalHeight })
        }
        onError={() => setFailed(true)}
        className="max-h-[min(70vh,640px)] max-w-full rounded-sm border border-border bg-bg object-contain"
      />
      <p className="tabular text-fg-faint text-xs">
        {dims ? `${dims.w} × ${dims.h} · ` : ""}
        {formatBytes(bytes)}
      </p>
    </div>
  );
}

// ---------------------------------------------------------------- links

export function linkFor(
  ctx: ReturnType<typeof useFileContext>,
  nav: { openIssue: ReturnType<typeof useOpenIssue>; go: ReturnType<typeof useGo> },
): { label: string; run: () => void } | undefined {
  if (ctx.issue && ctx.rel) {
    const issue = ctx.issue;
    const name = ctx.rel;
    const target = isIssueFileName(name) ? ISSUE_FILE_TARGET[name] : undefined;
    return {
      label: "Open issue",
      run: () => void nav.openIssue(issue.id, target ? { tab: target.tab, log: target.log } : {}),
    };
  }
  if (ctx.library) {
    const id = ctx.library.id;
    return { label: "Open library item", run: () => void nav.go.libraryItem(id) };
  }
  if (ctx.group) {
    const id = ctx.group.id;
    return { label: "Open group", run: () => void nav.go.board({ group: id }) };
  }
  return undefined;
}
