// One extra doc or asset: markdown rendered, images inline (click to zoom), others as a raw link.
import {
  ArrowLeft,
  ExternalLink,
  File,
  FileCode,
  FileImage,
  FileText,
  ImageOff,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { EmptyState, MarkdownProse } from "@/components/common";
import { Button, Dialog, DialogContent, IconButton, Skeleton } from "@/components/ui";
import type { Diagram, DocFile, IssueId } from "@/gen/types";
import { cn } from "@/lib/cn";
import { formatBytes } from "@/lib/format";
import { useHotkey } from "@/lib/hooks";

const ICON = { size: 14, strokeWidth: 1.75 } as const;

interface DocViewProps {
  doc: DocFile;
  /** Shows a back arrow (and binds Esc) when the view replaces a list. */
  onBack?: () => void;
  /** Diagrams of the issue, for `wf-diagram` fences inside markdown docs. */
  diagrams?: Diagram[];
  issueId?: IssueId;
  /** Shows "View source": the file's text, with Edit, instead of the rendered doc. */
  onViewSource?: () => void;
}

export function DocView({ doc, onBack, diagrams, issueId, onViewSource }: DocViewProps) {
  const rootRef = useRef<HTMLElement>(null);
  const hasBack = onBack != null;
  useHotkey("Escape", () => onBack?.(), { enabled: hasBack });

  // Opening a doc replaces the row that was clicked. Move focus to the view itself, so the
  // keyboard path continues from here (Tab reaches Back first) without a tooltip popping open.
  useEffect(() => {
    if (hasBack) rootRef.current?.focus({ preventScroll: true });
  }, [hasBack]);

  return (
    <article
      ref={rootRef}
      tabIndex={-1}
      aria-label={doc.path}
      data-wf="DocView"
      data-kind={doc.kind}
      className="flex min-w-0 flex-col gap-3 outline-none"
    >
      <div className="flex h-7 min-w-0 items-center gap-2">
        {onBack && (
          <IconButton
            size="sm"
            label="Back to files"
            shortcut="Escape"
            icon={<ArrowLeft {...ICON} />}
            onClick={onBack}
          />
        )}
        <span className="shrink-0 text-fg-faint">
          {doc.kind === "image" ? (
            <FileImage {...ICON} />
          ) : doc.kind === "markdown" ? (
            <FileText {...ICON} />
          ) : (
            <File {...ICON} />
          )}
        </span>
        <h3 className="min-w-0 truncate font-mono text-fg text-sm" title={doc.path}>
          {doc.path}
        </h3>
        <span className="shrink-0 text-fg-faint text-xs tabular">{formatBytes(doc.size)}</span>
        <span className="ml-auto flex shrink-0 items-center gap-0.5">
          {onViewSource && (
            <Button variant="ghost" size="sm" onClick={onViewSource} className="text-fg-muted">
              <FileCode {...ICON} aria-hidden />
              View source
            </Button>
          )}
          <a
            href={doc.url}
            target="_blank"
            rel="noreferrer"
            className="inline-flex h-6 shrink-0 items-center gap-1 rounded-md px-1.5 text-fg-muted text-sm transition-colors duration-100 hover:bg-muted hover:text-fg"
          >
            Open raw
            <ExternalLink {...ICON} aria-hidden />
          </a>
        </span>
      </div>

      {doc.kind === "markdown" ? (
        doc.body_md?.trim() ? (
          <MarkdownProse md={doc.body_md} diagrams={diagrams} issueId={issueId} />
        ) : (
          <p className="text-fg-faint text-sm">This file is empty.</p>
        )
      ) : doc.kind === "image" ? (
        <ImagePreview doc={doc} />
      ) : (
        <div className="rounded-md border border-border border-dashed py-6">
          <EmptyState
            icon={<File {...ICON} />}
            title="No preview for this file"
            hint={`${extensionOf(doc.path)} · ${formatBytes(doc.size)}. Use Open raw to see it.`}
          />
        </div>
      )}
    </article>
  );
}

function ImagePreview({ doc }: { doc: DocFile }) {
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const [zoomed, setZoomed] = useState(false);
  const alt = doc.title ?? doc.path;

  if (state === "error") {
    return (
      <div className="rounded-md border border-border border-dashed py-6">
        <EmptyState
          icon={<ImageOff {...ICON} />}
          title="Could not load this image"
          hint="The file may have moved, or the server cannot read it. Try Open raw."
        />
      </div>
    );
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setZoomed(true)}
        disabled={state !== "ready"}
        aria-label={`Zoom ${doc.path}`}
        className="relative flex min-h-40 cursor-zoom-in items-center justify-center overflow-hidden rounded-md border border-border bg-subtle p-3 disabled:cursor-default"
      >
        {state === "loading" && <Skeleton className="absolute inset-3 rounded-sm" />}
        <img
          src={doc.url}
          alt={alt}
          onLoad={() => setState("ready")}
          onError={() => setState("error")}
          className={cn(
            "max-h-[min(60vh,520px)] max-w-full object-contain transition-opacity duration-150",
            state === "ready" ? "opacity-100" : "opacity-0",
          )}
        />
      </button>
      <Dialog open={zoomed} onOpenChange={setZoomed}>
        <DialogContent title={doc.path} size="full">
          <div className="flex h-full min-h-0 items-center justify-center overflow-auto p-4">
            <img src={doc.url} alt={alt} className="max-h-full max-w-full object-contain" />
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

function extensionOf(path: string): string {
  const name = path.slice(path.lastIndexOf("/") + 1);
  const dot = name.lastIndexOf(".");
  return dot > 0 ? `${name.slice(dot + 1).toUpperCase()} file` : "File";
}
