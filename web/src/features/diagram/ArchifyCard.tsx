// An archify diagram inline in prose: header bar, then the preview, or the reason there is none.
//
// States (see `diagramState`):
//   rendering    skeleton while archify draws, or while the preview page loads
//   ready        the preview page in a sandboxed iframe, mounted once the card is near the screen
//   invalid      the errors with their JSON paths, the source, and "Copy for agent"
//   unavailable  archify or node is missing: a calm note and the source, folded away
import { ChevronRight, Maximize2, MousePointerClick, TriangleAlert } from "lucide-react";
import { type RefObject, useEffect, useMemo, useRef, useState } from "react";
import { getMockControls, withMockControls } from "@/app/mock-controls";
import { CopyButton } from "@/components/common";
import {
  Button,
  Chip,
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
  Skeleton,
} from "@/components/ui";
import type { Diagram } from "@/gen/types";
import { useSnapshot } from "@/lib/api";
import { cn } from "@/lib/cn";
import { DiagramDialog } from "./DiagramDialog";
import { DiagramErrors, InlineCode, UnavailableNote } from "./DiagramNotes";
import { JsonSource } from "./JsonSource";
import {
  agentReport,
  type DiagramState,
  diagramState,
  frameSrc,
  lineCount,
  plural,
  sourceLocation,
  TYPE_ICON,
  TYPE_LABEL,
  useDiagramTheme,
  usePostTheme,
} from "./meta";
import { orderedErrors } from "./sourceLines";

export interface ArchifyCardProps {
  diagram: Diagram;
  /** Shorter body, for cards inside timelines. */
  compact?: boolean;
  className?: string;
}

/** The preview never grows past this (compact: the second value). */
const CAP = { regular: 420, compact: 320 } as const;
const BASE_HEIGHT = {
  regular: "clamp(220px, 32vh, 420px)",
  compact: "clamp(180px, 24vh, 320px)",
} as const;

export function ArchifyCard({ diagram, compact = false, className }: ArchifyCardProps) {
  const archify = useSnapshot().data?.config.archify;
  const state = diagramState(diagram, archify);
  const [open, setOpen] = useState(false);
  const invalid = state === "invalid";

  return (
    <div
      data-wf="ArchifyCard"
      data-state={state}
      className={cn(
        "@container min-w-0 overflow-hidden rounded-lg border bg-bg",
        invalid ? "border-danger/30" : "border-border",
        className,
      )}
    >
      <CardHeader diagram={diagram} state={state} onOpen={() => setOpen(true)} />
      {invalid && <InvalidBody diagram={diagram} />}
      {state === "unavailable" && <UnavailableBody diagram={diagram} />}
      {(state === "ready" || state === "rendering") && (
        <PreviewBody
          diagram={diagram}
          compact={compact}
          rendering={state === "rendering"}
          onOpen={() => setOpen(true)}
        />
      )}
      <DiagramDialog diagram={diagram} open={open} onOpenChange={setOpen} />
    </div>
  );
}

// ---------------------------------------------------------------- header

function CardHeader({
  diagram,
  state,
  onOpen,
}: {
  diagram: Diagram;
  state: DiagramState;
  onOpen: () => void;
}) {
  const invalid = state === "invalid";
  const Icon = invalid ? TriangleAlert : TYPE_ICON[diagram.type];
  return (
    <div
      data-wf="ArchifyCardHeader"
      className={cn(
        "flex h-9 items-center gap-2 border-b px-3",
        invalid ? "border-danger/25 bg-danger/8" : "border-border bg-subtle",
      )}
    >
      <Icon
        size={14}
        strokeWidth={1.75}
        aria-hidden
        className={cn("shrink-0", invalid ? "text-danger" : "text-fg-muted")}
      />
      <span className="min-w-0 truncate font-medium text-fg text-sm" title={diagram.title}>
        {diagram.title}
      </span>
      <Chip size="xs" className="hidden @xs:inline-flex">
        {TYPE_LABEL[diagram.type]}
      </Chip>
      {invalid ? (
        <Chip size="xs" tone="danger">
          {plural(diagram.errors.length, "error")}
        </Chip>
      ) : (
        <span className="hidden shrink-0 text-fg-faint text-xs tabular @sm:inline">
          {plural(diagram.nodes, "node")}
        </span>
      )}
      <span className="hidden shrink-0 font-mono text-fg-faint text-xs @md:inline">
        {sourceLocation(diagram)}
      </span>
      <div className="ml-auto flex shrink-0 items-center gap-0.5">
        <Button
          variant="ghost"
          size="sm"
          onClick={onOpen}
          aria-label={`Open ${diagram.title} full size`}
        >
          <Maximize2 size={14} strokeWidth={1.75} />
          <span className="hidden @sm:inline">Open</span>
        </Button>
        <CopyButton text={diagram.source} label="Copy JSON" />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- preview

/** True once the element has come within `rootMargin` of the screen. Stays true. */
function useSeen(ref: RefObject<HTMLElement | null>, rootMargin: string): boolean {
  const [seen, setSeen] = useState(false);
  useEffect(() => {
    if (seen) return;
    const el = ref.current;
    if (!el) return;
    if (typeof IntersectionObserver === "undefined") {
      setSeen(true);
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setSeen(true);
          io.disconnect();
        }
      },
      { rootMargin },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [seen, ref, rootMargin]);
  return seen;
}

function RenderingPlaceholder({ className }: { className?: string }) {
  return (
    <div
      role="status"
      className={cn("flex flex-col items-center justify-center gap-4 bg-bg", className)}
    >
      <div className="flex flex-col items-center gap-2" aria-hidden>
        <Skeleton className="h-6 w-28 rounded-md" />
        <div className="flex gap-2">
          <Skeleton className="h-6 w-24 rounded-md" />
          <Skeleton className="h-6 w-20 rounded-md" />
        </div>
        <Skeleton className="h-6 w-32 rounded-md" />
      </div>
      <span className="text-fg-faint text-xs">Rendering diagram…</span>
    </div>
  );
}

function PreviewBody({
  diagram,
  compact,
  rendering,
  onOpen,
}: {
  diagram: Diagram;
  compact: boolean;
  rendering: boolean;
  onOpen: () => void;
}) {
  const bodyRef = useRef<HTMLDivElement>(null);
  const frameRef = useRef<HTMLIFrameElement>(null);
  const theme = useDiagramTheme();
  // The page loads once with the theme of that moment. Later changes are posted to it.
  const firstTheme = useRef(theme).current;
  const seen = useSeen(bodyRef, "200px");
  const [loaded, setLoaded] = useState(false);
  const [reported, setReported] = useState<number | null>(null);
  const mounted = seen && !rendering;
  const size = compact ? "compact" : "regular";

  // The page reports its content height. Grow to fit it, never past the cap.
  useEffect(() => {
    if (!mounted) return;
    const onMessage = (e: MessageEvent) => {
      if (e.source !== frameRef.current?.contentWindow) return;
      const data = e.data as { type?: unknown; h?: unknown } | null;
      if (data?.type !== "wf:size" || typeof data.h !== "number" || !Number.isFinite(data.h))
        return;
      setReported(Math.max(0, Math.ceil(data.h)));
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [mounted]);

  usePostTheme(frameRef, theme, mounted && loaded);

  return (
    <div
      ref={bodyRef}
      data-wf="ArchifyCardBody"
      className="relative overflow-hidden bg-bg transition-[min-height] duration-200 ease-wf"
      style={{
        height: BASE_HEIGHT[size],
        minHeight: reported ? Math.min(reported, CAP[size]) : undefined,
      }}
    >
      {mounted && (
        <iframe
          ref={frameRef}
          src={frameSrc(diagram, firstTheme, true)}
          title={`${diagram.title}, ${diagram.type} diagram`}
          sandbox="allow-scripts"
          loading="lazy"
          onLoad={() => setLoaded(true)}
          className="absolute inset-0 size-full border-0 bg-transparent"
        />
      )}
      <RenderingPlaceholder
        className={cn(
          "absolute inset-0 transition-opacity duration-150",
          mounted && loaded && "pointer-events-none opacity-0",
        )}
      />
      {!rendering && (
        <button
          type="button"
          onClick={onOpen}
          // The button covers the frame, so hand it the wheel: a page taller than the card scrolls in place.
          onWheel={(e) =>
            frameRef.current?.contentWindow?.postMessage({ type: "wf:scroll", dy: e.deltaY }, "*")
          }
          aria-label={`Open ${diagram.title} full size`}
          className="group/open absolute inset-0 z-raised cursor-zoom-in outline-none transition-colors duration-100 hover:bg-fg/[0.015] focus-visible:outline-2 focus-visible:outline-focus focus-visible:-outline-offset-2"
        >
          <span className="pointer-events-none absolute right-2 bottom-2 inline-flex items-center gap-1 rounded-md border border-border bg-bg/95 px-2 py-1 text-fg-muted text-xs opacity-0 transition-opacity duration-150 group-hover/open:opacity-100 group-focus-visible/open:opacity-100">
            <MousePointerClick size={14} strokeWidth={1.75} />
            Click to explore
          </span>
        </button>
      )}
    </div>
  );
}

// ---------------------------------------------------------------- invalid

function InvalidBody({ diagram }: { diagram: Diagram }) {
  // The errors in the order of the source, so reading the block below goes top to bottom.
  const { errors, lines } = useMemo(() => orderedErrors(diagram.source, diagram.errors), [diagram]);
  const marked = useMemo(() => lines.filter((n): n is number => n !== undefined), [lines]);
  return (
    <div data-wf="ArchifyCardInvalid" className="flex flex-col gap-3 p-3">
      <div>
        <p className="font-medium text-base text-fg">Archify could not draw this diagram</p>
        <p className="text-fg-muted text-sm">
          Fix the {plural(diagram.errors.length, "error")} below in the block, then run{" "}
          <InlineCode>wf lint --render</InlineCode>.
        </p>
      </div>
      <DiagramErrors errors={errors} lines={lines} />
      <JsonSource source={diagram.source} maxHeight={200} highlight={marked} />
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
        <CopyButton variant="button" size="sm" text={agentReport(diagram)} label="Copy for agent" />
        <span className="text-fg-faint text-xs">
          Paste it to your agent. It has the errors and the block.
        </span>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- unavailable

/**
 * Prototype only: the mock ships with archify off, so diagrams show as unavailable. When the mock
 * has a stand-in page for this diagram, one quiet button turns the archify switch on.
 */
function PrototypeHint({ diagram }: { diagram: Diagram }) {
  if (!getMockControls() || !diagram.url) return null;
  return (
    <Button
      data-wf="PrototypeHint"
      variant="ghost"
      size="sm"
      onClick={() => withMockControls((c) => c.setArchifyAvailable(true))}
      className="-ml-2 mt-1.5 text-fg-faint hover:text-fg"
    >
      Prototype: show the stand-in preview
    </Button>
  );
}

function UnavailableBody({ diagram }: { diagram: Diagram }) {
  return (
    <div data-wf="ArchifyCardUnavailable" className="flex flex-col gap-3 p-3">
      <UnavailableNote
        facts={`${plural(diagram.nodes, "node")} · ${sourceLocation(diagram)}`}
        hint={<PrototypeHint diagram={diagram} />}
      />
      <Collapsible>
        <CollapsibleTrigger className="group/src -ml-1 flex h-6 cursor-default items-center gap-1 rounded-sm px-1 text-fg-muted text-sm transition-colors duration-100 hover:bg-muted hover:text-fg">
          <ChevronRight
            size={14}
            strokeWidth={1.75}
            className="transition-transform duration-150 ease-wf group-data-[state=open]/src:rotate-90"
          />
          JSON source
          <span className="text-fg-faint text-xs tabular">
            {plural(lineCount(diagram.source), "line")}
          </span>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <div className="pt-2">
            <JsonSource source={diagram.source} maxHeight={200} />
          </div>
        </CollapsibleContent>
      </Collapsible>
    </div>
  );
}
