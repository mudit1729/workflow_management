// A diagram at full size. Ready: the preview page without `embed`, so it shows its own header
// and uses the whole dialog. Invalid or unavailable: the JSON source, full height.
import { useMemo, useRef, useState } from "react";
import { CopyButton } from "@/components/common";
import { Chip, Dialog, DialogContent, Skeleton } from "@/components/ui";
import type { Diagram } from "@/gen/types";
import { useSnapshot } from "@/lib/api";
import { DiagramErrors, InlineCode, UnavailableNote } from "./DiagramNotes";
import { JsonSource } from "./JsonSource";
import {
  agentReport,
  diagramState,
  frameSrc,
  plural,
  sourceLocation,
  TYPE_ICON,
  TYPE_LABEL,
  useDiagramTheme,
  usePostTheme,
} from "./meta";
import { orderedErrors } from "./sourceLines";

export interface DiagramDialogProps {
  diagram: Diagram;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function DiagramDialog({ diagram, open, onOpenChange }: DiagramDialogProps) {
  const contentRef = useRef<HTMLDivElement>(null);
  const archify = useSnapshot().data?.config.archify;
  const state = diagramState(diagram, archify);
  const Icon = TYPE_ICON[diagram.type];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        ref={contentRef}
        data-wf="DiagramDialog"
        // Focus the dialog, not its first button: that would pop a tooltip open on arrival.
        onOpenAutoFocus={(e) => {
          e.preventDefault();
          contentRef.current?.focus();
        }}
        size="full"
        title={
          <span className="flex min-w-0 items-center gap-2">
            <Icon size={14} strokeWidth={1.75} aria-hidden className="shrink-0 text-fg-muted" />
            <span className="min-w-0 truncate">{diagram.title}</span>
            <Chip size="sm" className="shrink-0">
              {TYPE_LABEL[diagram.type]}
            </Chip>
            <span className="hidden shrink-0 font-mono font-normal text-fg-faint text-sm sm:inline">
              {sourceLocation(diagram)}
            </span>
          </span>
        }
        actions={<CopyButton text={diagram.source} label="Copy JSON" size="md" />}
        bodyClassName="relative overflow-hidden px-0 pb-0"
      >
        {state === "ready" || state === "rendering" ? (
          <Preview diagram={diagram} />
        ) : (
          <SourceView diagram={diagram} invalid={state === "invalid"} />
        )}
      </DialogContent>
    </Dialog>
  );
}

function Preview({ diagram }: { diagram: Diagram }) {
  const frameRef = useRef<HTMLIFrameElement>(null);
  const theme = useDiagramTheme();
  const firstTheme = useRef(theme).current;
  const [loaded, setLoaded] = useState(false);
  usePostTheme(frameRef, theme, loaded);

  return (
    <div className="absolute inset-0 border-border border-t bg-bg">
      <iframe
        ref={frameRef}
        src={frameSrc(diagram, firstTheme, false)}
        title={`${diagram.title}, ${diagram.type} diagram`}
        sandbox="allow-scripts allow-downloads"
        onLoad={() => setLoaded(true)}
        className="size-full border-0 bg-transparent"
      />
      {!loaded && (
        <div
          role="status"
          className="absolute inset-0 flex flex-col items-center justify-center gap-4 bg-bg"
        >
          <div className="flex flex-col items-center gap-2" aria-hidden>
            <Skeleton className="h-7 w-32 rounded-md" />
            <div className="flex gap-2">
              <Skeleton className="h-7 w-28 rounded-md" />
              <Skeleton className="h-7 w-24 rounded-md" />
            </div>
            <Skeleton className="h-7 w-36 rounded-md" />
          </div>
          <span className="text-fg-faint text-xs">Rendering diagram…</span>
        </div>
      )}
    </div>
  );
}

function SourceView({ diagram, invalid }: { diagram: Diagram; invalid: boolean }) {
  const { errors, lines } = useMemo(() => orderedErrors(diagram.source, diagram.errors), [diagram]);
  const marked = useMemo(() => lines.filter((n): n is number => n !== undefined), [lines]);
  return (
    <div className="@container flex h-full min-h-0 flex-col gap-3 border-border border-t p-4">
      {invalid ? (
        <>
          <div>
            <p className="font-medium text-base text-fg">Archify could not draw this diagram</p>
            <p className="text-fg-muted text-sm">
              Fix the {plural(diagram.errors.length, "error")} below in the block, then run{" "}
              <InlineCode>wf lint --render</InlineCode>.
            </p>
          </div>
          <DiagramErrors errors={errors} lines={lines} className="shrink-0" />
        </>
      ) : (
        <UnavailableNote facts={`${plural(diagram.nodes, "node")} · ${sourceLocation(diagram)}`} />
      )}
      <div className="min-h-0 flex-1">
        <JsonSource source={diagram.source} fill highlight={marked} />
      </div>
      {invalid && (
        <div className="flex shrink-0 items-center gap-3">
          <CopyButton
            variant="button"
            size="md"
            text={agentReport(diagram)}
            label="Copy for agent"
          />
          <span className="text-fg-faint text-xs">
            Paste it to your agent. It has the errors and the block.
          </span>
        </div>
      )}
    </div>
  );
}
