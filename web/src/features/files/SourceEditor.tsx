// Edit mode of a file: a mono textarea with the same metrics and line numbers as the read view.
// Save writes the text through the workspace-file hook, against the rev the editor opened from;
// the board then re-reads it. If the file changed underneath, the editor says so and offers
// Reload or Overwrite instead of guessing. Prose wraps (the line numbers stay one per line of the
// file); code scrolls sideways.
import { LoaderCircle, TriangleAlert } from "lucide-react";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Button, Kbd, Tooltip } from "@/components/ui";
import { isConflictError, useWriteWorkspaceFile } from "@/lib/api";
import { cn } from "@/lib/cn";
import { useHotkey } from "@/lib/hooks";
import { lineAt, lineStart } from "./lines";
import { basename } from "./paths";
import { GutterCell, gutterWidth, SourceGutter, SRC_METRICS, SRC_PAD } from "./SourceGutter";
import { WrapToggle } from "./SourceParts";
import { useSavedToast } from "./useSavedToast";

export interface SourceEditorProps {
  path: string;
  /** "create" writes a file that does not exist yet (no base rev). */
  mode: "edit" | "create";
  /** The text on disk when the edit began: the baseline for "Unsaved" and for the diff. */
  initialText: string;
  /** The text the draft starts with, when it differs from the baseline (a template, a new entry). */
  startText?: string;
  /** The rev this edit started from; the write is refused if the file moved past it. */
  baseRev?: string;
  /** The rev of the file on disk right now, undefined when there is none. */
  liveRev?: string;
  /** The file was deleted while editing. */
  gone?: boolean;
  /** Text to select on open, so a title placeholder can be overtyped. */
  select?: string;
  /** 1-based line to put the caret on when the editor opens (used when `select` finds nothing). */
  line?: number;
  variant: "pane" | "inline";
  /** Wrap long lines (prose). Off: they scroll sideways (code, toml). */
  wrap?: boolean;
  onWrapChange?: (wrap: boolean) => void;
  onSaved: (saved: { rev: string; before: string; after: string }) => void;
  onCancel: () => void;
  /** Take the file as it is on disk now and drop this draft. */
  onReload: () => void;
  onDirtyChange?: (dirty: boolean) => void;
}

const ICON = { size: 14, strokeWidth: 1.75 } as const;

export function SourceEditor({
  path,
  mode,
  initialText,
  startText,
  baseRev,
  liveRev,
  gone = false,
  select,
  line: openAtLine,
  variant,
  wrap = false,
  onWrapChange,
  onSaved,
  onCancel,
  onReload,
  onDirtyChange,
}: SourceEditorProps) {
  const write = useWriteWorkspaceFile();
  const savedToast = useSavedToast();
  const [draft, setDraft] = useState(startText ?? initialText);
  const [saving, setSaving] = useState(false);
  const [refused, setRefused] = useState(false);
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const area = useRef<HTMLTextAreaElement>(null);
  /** What follows the textarea's vertical scroll: the gutter, or the mirror that wraps like it. */
  const slider = useRef<HTMLDivElement>(null);
  const mirror = useRef<HTMLDivElement>(null);
  const reloadButton = useRef<HTMLButtonElement>(null);
  /** The width a scrollbar takes from the textarea, so the mirror wraps at the same column. */
  const [scrollbar, setScrollbar] = useState(0);

  // `touched`: the draft differs from the file on disk, so there is something to save.
  // `edited`: the person typed beyond the text the editor opened with, so leaving needs a word.
  const touched = draft !== initialText;
  const edited = draft !== (startText ?? initialText);
  const creating = mode === "create";
  const changedOnDisk = creating
    ? liveRev !== undefined
    : gone || (liveRev !== undefined && liveRev !== baseRev);
  const conflict = refused || changedOnDisk;

  useLayoutEffect(() => {
    onDirtyChange?.(edited);
    return () => onDirtyChange?.(false);
  }, [edited, onDirtyChange]);

  // Focus on open. A placeholder (a new entry's title) is selected and brought into view.
  useLayoutEffect(() => {
    const el = area.current;
    if (!el) return;
    el.focus({ preventScroll: true });
    let start = creating ? el.value.length : 0;
    let end = start;
    const at = select ? el.value.lastIndexOf(select) : -1;
    if (select && at !== -1) {
      start = at;
      end = at + select.length;
    } else if (openAtLine) {
      start = lineStart(el.value, openAtLine);
      end = start;
    }
    el.setSelectionRange(start, end);
    if (start > 0) {
      const lh = Number.parseFloat(getComputedStyle(el).getPropertyValue("--wf-src-lh")) || 20;
      const line = lineAt(el.value, start);
      // A wrapped line above makes a row taller than one line: ask the mirror where the line is.
      const row = mirror.current?.children[line - 1] as HTMLElement | undefined;
      const top = row ? row.offsetTop : (line - 1) * lh + SRC_PAD;
      el.scrollTop = Math.max(0, top - el.clientHeight / 2);
    }
    // Only on open: wrap and the draft change later without moving the caret.
  }, [creating, select, openAtLine]);

  // Keep the gutter on the line the textarea shows: after a scroll, and when the mode changes.
  const syncScroll = () => {
    const el = area.current;
    if (el && slider.current) slider.current.style.transform = `translateY(${-el.scrollTop}px)`;
  };
  // biome-ignore lint/correctness/useExhaustiveDependencies: `wrap` swaps the element that slides
  useLayoutEffect(syncScroll, [wrap]);

  // The mirror must wrap at the textarea's column: tell it how wide the scrollbar is.
  // biome-ignore lint/correctness/useExhaustiveDependencies: the draft decides if one shows
  useLayoutEffect(() => {
    const el = area.current;
    if (!el || !wrap) return;
    const measure = () => setScrollbar(el.offsetWidth - el.clientWidth);
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [wrap, draft]);

  async function save(overwrite = false) {
    if (saving) return;
    if (conflict && !overwrite) {
      // The shortcut does nothing while the bar asks a question: say so, and go to the answer.
      toast.warning("This file changed. Reload or Overwrite first.");
      reloadButton.current?.focus();
      return;
    }
    if (!creating && !touched && !overwrite) return;
    setSaving(true);
    try {
      const res = await write({
        path,
        text: draft,
        base_rev: overwrite || creating ? undefined : baseRev,
      });
      // The hook has already explained any other failure with a toast.
      if (!res) return;
      savedToast({ verb: creating ? "Created" : "Saved", path, text: draft });
      onSaved({ rev: res.rev, before: initialText, after: draft });
    } catch (err) {
      if (isConflictError(err)) setRefused(true);
      else
        toast.error("Could not save the file", {
          description: err instanceof Error ? err.message : "Try again in a moment.",
        });
    } finally {
      setSaving(false);
    }
  }

  function cancel() {
    if (confirmDiscard) {
      setConfirmDiscard(false);
      area.current?.focus();
      return;
    }
    if (edited) setConfirmDiscard(true);
    else onCancel();
  }

  useHotkey(["mod+s", "mod+Enter"], () => void save(), { allowInInputs: true });

  // Esc cancels the edit, from the text or from a button in the editor. A window capture
  // listener runs before the overlay that may host this editor (a sheet, the drawer), so the
  // press is claimed here and never also closes that overlay. Radix skips handled keys.
  const cancelRef = useRef(cancel);
  cancelRef.current = cancel;
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || e.defaultPrevented) return;
      if (!root.current?.contains(e.target as Node)) return;
      e.preventDefault();
      cancelRef.current();
    };
    window.addEventListener("keydown", onKey, { capture: true });
    return () => window.removeEventListener("keydown", onKey, { capture: true });
  }, []);

  const lines = draft.split("\n");
  const gutterW = gutterWidth(lines.length);

  return (
    <div
      ref={root}
      data-wf="SourceEditor"
      data-mode={mode}
      className={cn("flex min-w-0 flex-col", variant === "pane" ? "min-h-0 flex-1" : "gap-0")}
    >
      <div
        className={cn(
          "flex h-9 shrink-0 items-center gap-3 border-border border-b bg-subtle px-3",
          variant === "inline" && "rounded-t-md border border-b-0",
        )}
      >
        <span className="font-medium text-fg-muted text-sm">
          {creating ? "New file" : "Editing"}
        </span>
        {(touched || creating) && (
          <span className="inline-flex items-center gap-1.5 text-fg-faint text-xs">
            <span aria-hidden className="size-1.5 rounded-full bg-stale" />
            {creating && !edited ? "Not saved yet" : "Unsaved"}
          </span>
        )}
        <span className="flex-1" />
        {onWrapChange && <WrapToggle wrap={wrap} onChange={onWrapChange} />}
        <Tooltip content="Cancel" shortcut="Escape">
          <Button variant="ghost" size="sm" onClick={cancel}>
            Cancel
          </Button>
        </Tooltip>
        <Tooltip content={creating ? "Create the file" : "Save the file"} shortcut="mod+s">
          <Button
            variant="primary"
            size="sm"
            onClick={() => void save()}
            disabled={saving || conflict || (!creating && !touched)}
          >
            {saving && <LoaderCircle {...ICON} className="animate-spin" aria-hidden />}
            {creating ? "Create" : "Save"}
          </Button>
        </Tooltip>
      </div>

      {conflict && (
        <div
          role="alert"
          data-wf="ConflictBar"
          className="flex shrink-0 flex-wrap items-center gap-x-3 gap-y-1.5 border-stale/30 border-b bg-stale/10 px-3 py-2 text-sm"
        >
          <TriangleAlert {...ICON} className="shrink-0 text-stale" aria-hidden />
          <span className="min-w-0 flex-1 text-fg">
            {gone && !refused
              ? "This file was deleted while you edited it."
              : creating && !refused
                ? "A file now exists at this path."
                : "This file changed while you edited it."}
          </span>
          {gone && !refused ? (
            <>
              <Button ref={reloadButton} variant="secondary" size="sm" onClick={onReload}>
                Close editor
              </Button>
              <Button variant="primary" size="sm" onClick={() => void save(true)} disabled={saving}>
                Recreate
              </Button>
            </>
          ) : (
            <>
              <Button ref={reloadButton} variant="secondary" size="sm" onClick={onReload}>
                Reload
              </Button>
              <Button variant="danger" size="sm" onClick={() => void save(true)} disabled={saving}>
                Overwrite
              </Button>
            </>
          )}
        </div>
      )}

      {confirmDiscard && (
        <div
          role="alert"
          data-wf="DiscardBar"
          className="flex shrink-0 flex-wrap items-center gap-x-3 gap-y-1.5 border-border border-b bg-subtle px-3 py-2 text-sm"
        >
          <span className="min-w-0 flex-1 text-fg">Discard your changes to {basename(path)}?</span>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => {
              setConfirmDiscard(false);
              area.current?.focus();
            }}
          >
            Keep editing
            <Kbd combo="Escape" />
          </Button>
          <Button variant="danger" size="sm" onClick={onCancel}>
            Discard
          </Button>
        </div>
      )}

      <div
        className={cn(
          // 16 px on a phone: a smaller field makes iOS zoom the page when it takes focus. The
          // gutter and the wrap mirror live in this box, so they follow the textarea's size.
          "relative flex overflow-hidden bg-bg text-fg max-md:text-lg",
          SRC_METRICS,
          variant === "pane"
            ? "min-h-0 flex-1"
            : "h-[min(62vh,560px)] rounded-b-md border border-border border-t-0",
        )}
      >
        {/* The textarea scrolls itself, so the caret is always revealed natively. The gutter
            (or, when lines wrap, the mirror that wraps like the textarea) is clipped here and
            follows the textarea's vertical scroll. */}
        {wrap ? (
          <div
            key="mirror"
            aria-hidden
            className="pointer-events-none absolute inset-0 select-none overflow-hidden"
          >
            <div
              aria-hidden
              className="absolute inset-y-0 left-0 border-border border-r bg-bg"
              style={{ width: gutterW }}
            />
            <div
              ref={(el) => {
                slider.current = el;
                mirror.current = el;
              }}
              className="relative will-change-transform"
              style={{ paddingTop: SRC_PAD, paddingBottom: SRC_PAD, tabSize: 2 }}
            >
              {lines.map((text, i) => (
                <div key={i} className="flex">
                  <div className="shrink-0 text-fg-faint" style={{ width: gutterW }}>
                    <GutterCell line={i + 1} />
                  </div>
                  <div
                    className="min-h-(--wf-src-lh) min-w-0 flex-1 whitespace-pre-wrap pl-3 text-transparent leading-(--wf-src-lh) [overflow-wrap:anywhere]"
                    style={{ paddingRight: `calc(16px + ${scrollbar}px)` }}
                  >
                    {text}
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div key="gutter" className="shrink-0 overflow-hidden">
            <div
              ref={(el) => {
                slider.current = el;
                mirror.current = null;
              }}
              className="will-change-transform"
            >
              <SourceGutter lineCount={lines.length} />
            </div>
          </div>
        )}
        <textarea
          key="area"
          ref={area}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onScroll={syncScroll}
          aria-label={`Edit ${path}`}
          spellCheck={false}
          autoCapitalize="off"
          autoCorrect="off"
          autoComplete="off"
          wrap={wrap ? "soft" : "off"}
          data-gramm="false"
          className={cn(
            "relative block min-w-0 flex-1 resize-none overscroll-contain border-0 bg-transparent pl-3 text-fg leading-(--wf-src-lh) outline-none",
            wrap
              ? "overflow-y-auto overflow-x-hidden whitespace-pre-wrap pr-4 [overflow-wrap:anywhere]"
              : "overflow-auto whitespace-pre pr-6",
          )}
          style={{
            paddingTop: SRC_PAD,
            paddingBottom: SRC_PAD,
            tabSize: 2,
            marginLeft: wrap ? gutterW : undefined,
          }}
        />
      </div>
    </div>
  );
}
