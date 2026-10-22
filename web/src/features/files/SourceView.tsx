// One workspace file, as text: the header (path, rev, size, links), the text with line numbers
// and lint markers, and the editor. Images show as images, other binaries say so. It is the same
// component in the Workspace files pane and inline in an issue's Files tab.

import { useBlocker } from "@tanstack/react-router";
import { ArrowLeft, ArrowUpRight, Copy, Ellipsis, File, FileX, Pencil, Trash2 } from "lucide-react";
import { type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { CopyButton, copyText, EmptyState } from "@/components/common";
import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  IconButton,
} from "@/components/ui";
import type { Diagnostic } from "@/gen/types";
import { NotFoundError, useDeleteWorkspaceFile, useMe, useWorkspaceFile } from "@/lib/api";
import { cn } from "@/lib/cn";
import { formatBytes } from "@/lib/format";
import { useHotkey } from "@/lib/hooks";
import { useGo, useOpenIssue } from "@/lib/nav";
import { useFileContext } from "./context";
import { DeleteFileDialog } from "./DeleteFileDialog";
import { DiscardDialog } from "./DiscardDialog";
import { langOf } from "./highlight";
import { pendingIntentFor, useEditIntent } from "./intent";
import { changedLines } from "./lines";
import { basename, extension, roleHint, validateNewPath } from "./paths";
import { SourceCode } from "./SourceCode";
import { SourceEditor } from "./SourceEditor";
import {
  fileKind,
  ImageBody,
  KindGlyph,
  linkFor,
  Meta,
  NotFound,
  SourceSkeleton,
  TomlNote,
} from "./SourceParts";
import { appendEntry, templateForPath } from "./templates";
import { FilesLink, useFilesNav } from "./useFilesNav";

const ICON = { size: 14, strokeWidth: 1.75 } as const;
const EMPTY_SET: ReadonlySet<number> = new Set();

export interface SourceViewProps {
  /** Workspace-relative path of the file. */
  path: string;
  /** `pane` fills the Workspace files screen; `inline` sits inside an issue's Files tab. */
  variant?: "pane" | "inline";
  /** Shown instead of the full path (inline: the path inside the issue folder). */
  pathLabel?: string;
  /** Back affordance: the phone's file screen, or the inline list. */
  onBack?: () => void;
  /** Called after the file was deleted. Without it the view returns to /files. */
  onDeleted?: () => void;
  className?: string;
}

interface Session {
  key: number;
  mode: "edit" | "create";
  initialText: string;
  startText?: string;
  baseRev?: string;
  select?: string;
}

function isNotFound(error: unknown): boolean {
  return error instanceof NotFoundError || (error as { status?: number } | null)?.status === 404;
}

export function SourceView({
  path,
  variant = "pane",
  pathLabel,
  onBack,
  onDeleted,
  className,
}: SourceViewProps) {
  const query = useWorkspaceFile(path);
  const context = useFileContext(path);
  const nav = useFilesNav();
  const me = useMe();
  const inline = variant === "inline";

  const gone = query.isError && isNotFound(query.error);
  const file = gone ? undefined : query.data;
  const kind = fileKind(path);

  // ---- editing
  const [session, setSession] = useState<Session | null>(null);
  const sessionKey = useRef(0);
  const [dirty, setDirty] = useState(false);
  const [leave, setLeave] = useState<(() => void) | null>(null);

  const startSession = useCallback((next: Omit<Session, "key">) => {
    sessionKey.current += 1;
    setSession({ ...next, key: sessionKey.current });
  }, []);

  const startEdit = () => {
    if (file?.text == null) return;
    startSession({ mode: "edit", initialText: file.text, baseRev: file.rev });
  };

  const startCreate = () =>
    startSession({
      mode: "create",
      initialText: "",
      startText: templateForPath(path, { author: me ?? "shruti" }),
    });

  // An edit requested elsewhere (palette, New file, an issue's Files tab) for this path.
  const intent = useEditIntent((s) => s.intent);
  const clearIntent = useEditIntent((s) => s.clear);
  const pending = pendingIntentFor(intent, path);
  useEffect(() => {
    if (!pending || session || query.isPending) return;
    if (!file && !gone) {
      clearIntent();
      return;
    }
    if (file && file.text == null) {
      clearIntent();
      return;
    }
    const base = file?.text ?? "";
    const startText =
      pending.draft ??
      (pending.append !== undefined ? appendEntry(file?.text, pending.append, pending.h1) : base);
    startSession({
      mode: file ? "edit" : "create",
      initialText: base,
      startText,
      baseRev: file?.rev,
      select: pending.select,
    });
    clearIntent();
  }, [pending, session, query.isPending, file, gone, startSession, clearIntent]);

  // ---- after a save: show the saved text at once, fade the lines that changed
  const [override, setOverride] = useState<{ text: string; rev: string } | null>(null);
  const [flash, setFlash] = useState<ReadonlySet<number>>(EMPTY_SET);
  useEffect(() => {
    if (!override) return;
    if (file?.rev === override.rev) {
      setOverride(null);
      return;
    }
    const t = setTimeout(() => setOverride(null), 2500);
    return () => clearTimeout(t);
  }, [override, file?.rev]);
  useEffect(() => {
    if (flash.size === 0) return;
    const t = setTimeout(() => setFlash(EMPTY_SET), 1500);
    return () => clearTimeout(t);
  }, [flash]);

  const onSaved = ({ rev, before, after }: { rev: string; before: string; after: string }) => {
    setSession(null);
    setOverride({ text: after, rev });
    setFlash(new Set(changedLines(before, after)));
  };

  const reload = () => {
    if (!file || file.text == null) {
      setSession(null);
      return;
    }
    startSession({ mode: "edit", initialText: file.text, baseRev: file.rev });
  };

  // ---- leaving with a draft open
  const blocker = useBlocker({
    shouldBlockFn: () => true,
    disabled: !dirty,
    enableBeforeUnload: false,
    withResolver: true,
  });
  const requestLeave = (fn: () => void) => (dirty ? setLeave(() => fn) : fn());
  const blocked = blocker.status === "blocked";

  useHotkey("Escape", () => (onBack ? requestLeave(onBack) : undefined), {
    enabled: inline && Boolean(onBack) && !session,
  });

  // ---- the text, findings and jumping to them
  const text = override ? override.text : (file?.text ?? null);
  const diagnostics = useMemo<Diagnostic[]>(
    () => (override ? [] : [...(file?.diagnostics ?? [])].sort(byLine)),
    [override, file?.diagnostics],
  );
  const scroller = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState<number | undefined>();
  const jumped = useRef(0);
  useEffect(() => {
    if (active === undefined) return;
    const t = setTimeout(() => setActive(undefined), 1500);
    return () => clearTimeout(t);
  }, [active]);

  /** Scroll so `line` sits in the upper third. With `onlyIfHidden`, leave a visible line alone. */
  const scrollToLine = useCallback((line: number, onlyIfHidden = false) => {
    const box = scroller.current;
    const row = box?.querySelector<HTMLElement>(`[data-line="${line}"]`);
    if (!box || !row) return;
    if (
      onlyIfHidden &&
      row.offsetTop >= box.scrollTop &&
      row.offsetTop + row.offsetHeight <= box.scrollTop + box.clientHeight
    ) {
      return;
    }
    box.scrollTo({
      top: Math.max(0, row.offsetTop - box.clientHeight / 3),
      behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth",
    });
  }, []);

  const jumpToFinding = () => {
    if (diagnostics.length === 0) return;
    const target = diagnostics[jumped.current % diagnostics.length];
    jumped.current += 1;
    const line = Math.max(target.line, 1);
    scrollToLine(line);
    setActive(line);
  };

  // After a save, bring the first changed line into view: a new entry lands at the bottom.
  useEffect(() => {
    if (flash.size === 0) return;
    const first = Math.min(...flash);
    const frame = requestAnimationFrame(() => scrollToLine(first, true));
    return () => cancelAnimationFrame(frame);
  }, [flash, scrollToLine]);

  // ---- delete
  const remove = useDeleteWorkspaceFile();
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const confirmRemove = async () => {
    setDeleting(true);
    try {
      await remove({ path, base_rev: file?.rev });
      toast(`Deleted ${basename(path)}`);
      setConfirmDelete(false);
      if (onDeleted) onDeleted();
      else void nav.open(undefined, { replace: true });
    } catch (err) {
      toast.error("Could not delete the file", {
        description: err instanceof Error ? err.message : "Try again in a moment.",
      });
    } finally {
      setDeleting(false);
    }
  };

  // ---- links
  const openIssue = useOpenIssue();
  const go = useGo();
  const link = linkFor(context, { openIssue, go });

  const root = cn("flex min-w-0 flex-col bg-bg", inline ? "gap-0" : "h-full min-h-0", className);

  // ---- states
  const editing = session !== null;
  let body: ReactNode;
  if (editing) {
    body = (
      <SourceEditor
        key={session.key}
        path={path}
        mode={session.mode}
        initialText={session.initialText}
        startText={session.startText}
        baseRev={session.baseRev}
        liveRev={file?.rev}
        gone={gone}
        select={session.select}
        variant={variant}
        onSaved={onSaved}
        onCancel={() => setSession(null)}
        onReload={reload}
        onDirtyChange={setDirty}
      />
    );
  } else if (query.isPending) {
    body = <SourceSkeleton inline={inline} />;
  } else if (gone) {
    body = (
      <NotFound
        path={path}
        inline={inline}
        onBack={onBack}
        onCreate={validateNewPath(path, new Set()) === null ? startCreate : undefined}
      />
    );
  } else if (query.isError && !file) {
    body = (
      <div className="flex min-h-0 flex-1 items-center justify-center">
        <EmptyState
          icon={<FileX />}
          title="Could not load this file"
          hint="The server did not answer. Your files are safe."
          action={
            <Button variant="secondary" size="sm" onClick={() => void query.refetch()}>
              Try again
            </Button>
          }
        />
      </div>
    );
  } else if (file && kind === "image") {
    body = <ImageBody path={path} url={file.url} bytes={file.bytes} inline={inline} />;
  } else if (file && text == null) {
    body = (
      <div className="flex min-h-0 flex-1 items-center justify-center">
        <EmptyState
          icon={<File />}
          title="No preview for this file"
          hint={`${extension(path).slice(1).toUpperCase() || "Binary"} · ${formatBytes(file.bytes)}. It is not text, so there is nothing to edit here.`}
          action={
            file.url ? (
              <Button asChild variant="secondary" size="sm">
                <a href={file.url} target="_blank" rel="noreferrer">
                  Open raw
                </a>
              </Button>
            ) : undefined
          }
        />
      </div>
    );
  } else if (text != null) {
    body =
      text === "" ? (
        <div className="px-4 py-6 text-fg-faint text-sm">
          This file is empty. Use Edit to write it.
        </div>
      ) : (
        <SourceCode
          text={text}
          lang={langOf(path)}
          diagnostics={diagnostics}
          flash={flash}
          activeLine={active}
          scrollerRef={scroller}
          className={
            inline
              ? "max-h-[min(62vh,560px)] rounded-md border border-border"
              : "min-h-0 flex-1 border-border border-t"
          }
        />
      );
  } else {
    body = <SourceSkeleton inline={inline} />;
  }

  const lineCount = text ? text.split("\n").length - (text.endsWith("\n") ? 1 : 0) : 0;
  const ext = extension(path);

  return (
    <section
      data-wf="SourceView"
      data-variant={variant}
      data-kind={kind}
      aria-label={path}
      className={root}
    >
      <header className={cn("flex shrink-0 flex-col gap-1", inline ? "pb-2" : "px-4 pt-2.5 pb-2")}>
        <div className="flex min-w-0 flex-wrap items-center gap-x-1.5 gap-y-1">
          <div className="flex min-w-0 flex-1 basis-56 items-center gap-1.5">
            {onBack && (
              <IconButton
                size="sm"
                label={inline ? "Back to files" : "Back to the file list"}
                shortcut={inline && !editing ? "Escape" : undefined}
                icon={<ArrowLeft {...ICON} />}
                onClick={() => requestLeave(onBack)}
                className={cn(!inline && "-ml-1.5")}
              />
            )}
            <span className="shrink-0 text-fg-faint">
              <KindGlyph kind={kind} ext={ext} />
            </span>
            <h2 className="min-w-0 truncate font-medium font-mono text-fg text-sm" title={path}>
              {pathLabel ?? path}
            </h2>
            <CopyButton text={path} label="Copy path" size="sm" />
          </div>
          <div className="ml-auto flex shrink-0 items-center gap-1.5">
            {!editing && link && !inline && (
              <Button variant="ghost" size="sm" onClick={link.run}>
                {link.label}
                <ArrowUpRight {...ICON} aria-hidden />
              </Button>
            )}
            {inline && (
              <FilesLink
                path={path}
                className="inline-flex h-6 shrink-0 items-center gap-1 rounded-md px-2 font-medium text-fg-muted text-sm transition-colors duration-100 hover:bg-muted hover:text-fg"
              >
                <span className="hidden min-[480px]:inline">Open in Workspace files</span>
                <span className="min-[480px]:hidden">Open</span>
                <ArrowUpRight {...ICON} aria-hidden />
              </FilesLink>
            )}
            {!editing && file && text != null && (
              <Button variant="secondary" size="sm" onClick={startEdit}>
                <Pencil {...ICON} aria-hidden />
                Edit
              </Button>
            )}
            {!editing && file && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <IconButton
                    size="sm"
                    label="File actions"
                    icon={<Ellipsis {...ICON} />}
                    variant="ghost"
                  />
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem icon={<Copy />} onSelect={() => void copy(path, "Path copied")}>
                    Copy path
                  </DropdownMenuItem>
                  {text != null && (
                    <DropdownMenuItem
                      icon={<Copy />}
                      onSelect={() => void copy(text, "File text copied")}
                    >
                      Copy text
                    </DropdownMenuItem>
                  )}
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    tone="danger"
                    icon={<Trash2 />}
                    onSelect={() => setConfirmDelete(true)}
                  >
                    Delete file…
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            )}
          </div>
        </div>
        {file && !editing && (
          <Meta
            rev={file.rev}
            bytes={file.bytes}
            lines={lineCount}
            hint={roleHint(path)}
            diagnostics={diagnostics}
            onJump={jumpToFinding}
            kind={kind}
          />
        )}
      </header>

      {file && !editing && ext === ".toml" && <TomlNote name={basename(path)} />}

      {body}

      <DiscardDialog
        open={blocked || leave !== null}
        name={basename(path)}
        onKeep={() => {
          setLeave(null);
          if (blocked) blocker.reset?.();
        }}
        onDiscard={() => {
          const fn = leave;
          setLeave(null);
          setDirty(false);
          if (blocked) blocker.proceed?.();
          else fn?.();
        }}
      />
      <DeleteFileDialog
        open={confirmDelete}
        path={path}
        context={context}
        busy={deleting}
        onCancel={() => setConfirmDelete(false)}
        onConfirm={() => void confirmRemove()}
      />
    </section>
  );
}

// ---------------------------------------------------------------- header parts

/** Copy to the clipboard and say so, or say it was blocked. */
async function copy(value: string, done: string) {
  if (await copyText(value)) toast.success(done);
  else toast.error("Could not copy to the clipboard");
}

function byLine(a: Diagnostic, b: Diagnostic): number {
  return a.line - b.line || a.col - b.col;
}
