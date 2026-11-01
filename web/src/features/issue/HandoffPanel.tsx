// Hand an issue over (goal 2): the header button copies the whole context bundle as markdown and
// opens this popover, built like Open in Codex's: it says what was copied, shows the text, and
// offers the prompt that asks Codex or Claude to do the same hand-off with the `handing-off`
// skill. "Open in Codex" stays the way to start Codex; this is the way to hand the content to a
// person or to an agent that is not Codex.
import { Check, ClipboardCopy, Copy, Expand, TriangleAlert } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";
import { copyText } from "@/components/common";
import {
  Button,
  Dialog,
  DialogContent,
  Popover,
  PopoverContent,
  PopoverTrigger,
  Skeleton,
  Tooltip,
} from "@/components/ui";
import { useContextBundle, useFlowSkill } from "@/lib/api";
import { cn } from "@/lib/cn";
import {
  type ContextFacts,
  contextFacts,
  copyContext,
  handoffPrompt,
  tokenCount,
  tokenLabel,
  useContextView,
} from "./handoff";
import { SkillLink } from "./skill-hint";

const ICON = { size: 14, strokeWidth: 1.75 } as const;

export const HANDOFF_HINT =
  "Copies the full context of this issue as markdown: goal, criteria, current state, ready tasks, last changes, decisions, learnings, git and CI.";

// ---------------------------------------------------------------- pieces

/** A Copy button that shows what it did for a moment. `source` may need to be read first. */
function CopyAction({
  source,
  label,
  primary,
  disabled,
}: {
  source: string | (() => Promise<string | undefined>);
  label: string;
  primary?: boolean;
  disabled?: boolean;
}) {
  const [state, setState] = useState<"idle" | "copied" | "failed">("idle");
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);
  const click = async () => {
    const text = typeof source === "string" ? source : await source();
    const ok = text ? await copyText(text) : false;
    setState(ok ? "copied" : "failed");
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setState("idle"), 1500);
  };
  return (
    <Button
      variant={primary ? "secondary" : "ghost"}
      size="sm"
      disabled={disabled}
      onClick={() => void click()}
    >
      {state === "copied" ? (
        <Check {...ICON} className="text-status-done" />
      ) : (
        <Copy {...ICON} className={primary ? undefined : "text-fg-faint"} />
      )}
      <span aria-live="polite">
        {state === "copied" ? "Copied" : state === "failed" ? "Could not copy" : label}
      </span>
    </Button>
  );
}

/** The bundle as written, so what is on the clipboard is what the person reads. */
function BundleText({ markdown, className }: { markdown: string; className?: string }) {
  return (
    // A region that scrolls must take focus, or the keyboard cannot reach the text below the fold.
    <pre
      data-wf="ContextText"
      // biome-ignore lint/a11y/noNoninteractiveTabindex: a scrollable region takes focus
      tabIndex={0}
      className={cn(
        "select-text overflow-auto whitespace-pre-wrap break-words rounded-md border border-border bg-subtle px-2.5 py-2 font-mono text-fg-muted text-xs leading-snug outline-none focus-visible:ring-2 focus-visible:ring-focus",
        className,
      )}
    >
      {markdown}
    </pre>
  );
}

function BundleSkeleton() {
  return (
    <div
      role="status"
      aria-busy="true"
      aria-label="Reading the context"
      className="flex flex-col gap-1.5 rounded-md border border-border bg-subtle p-2.5"
    >
      <Skeleton className="h-3 w-2/3" />
      <Skeleton className="h-3 w-full" />
      <Skeleton className="h-3 w-5/6" />
      <Skeleton className="h-3 w-1/2" />
    </div>
  );
}

function leftOutLine(facts: ContextFacts): string | undefined {
  return facts.leftOut.length > 0
    ? `Left out to fit ${facts.budget.toLocaleString("en-US")} tokens: ${facts.leftOut.join(", ")}.`
    : undefined;
}

// ---------------------------------------------------------------- the panel

export interface HandoffPanelProps {
  issueId: string;
  /** The click already copied the context: true when the clipboard took it, false when it did not. */
  copied?: boolean;
  className?: string;
}

/** What was copied, the text itself, Copy context, Copy prompt, and a way to read it whole. */
export function HandoffPanel({ issueId, copied, className }: HandoffPanelProps) {
  const bundle = useContextBundle(issueId);
  const markdown = bundle.data;
  const facts = markdown ? contextFacts(markdown) : undefined;
  const openView = useContextView((s) => s.open);
  const prompt = handoffPrompt(issueId, useFlowSkill("handoff"));
  const cut = facts ? leftOutLine(facts) : undefined;

  return (
    <div data-wf="HandoffPanel" className={cn("flex flex-col gap-3", className)}>
      <div className="flex flex-col gap-0.5">
        <h3 className="font-semibold text-base text-fg">Hand {issueId} over</h3>
        <p
          role="status"
          className={cn(
            "flex items-center gap-1.5 text-sm",
            copied === false ? "text-stale-text" : "text-fg-muted",
          )}
        >
          {copied === true && <Check {...ICON} aria-hidden className="text-status-done" />}
          {copied === false && <TriangleAlert {...ICON} aria-hidden />}
          {copied === true &&
            `Context copied${facts ? ` (${tokenLabel(facts.tokens)})` : ""}. Paste it in a chat or a ticket.`}
          {copied === false && "The browser blocked the clipboard. Use Copy context."}
          {copied === undefined &&
            "The person or agent who gets this text can pick the issue up without opening the folder."}
        </p>
      </div>

      <div className="flex flex-col gap-1">
        <div className="flex items-center justify-between gap-2">
          <span className="text-fg-faint text-xs">
            What you copy
            {facts && (
              <span className="tabular">
                {" · "}
                {tokenCount(facts.tokens)} of {facts.budget.toLocaleString("en-US")} tokens
              </span>
            )}
          </span>
          <Button
            variant="ghost"
            size="sm"
            disabled={!markdown}
            onClick={() => openView(issueId)}
            className="-mr-1.5"
          >
            <Expand {...ICON} className="text-fg-faint" />
            View all
          </Button>
        </div>
        {markdown ? (
          <BundleText markdown={markdown} className="max-h-44" />
        ) : bundle.isError ? (
          <p role="alert" className="text-sm text-stale-text">
            Could not read the context of {issueId}.
          </p>
        ) : (
          <BundleSkeleton />
        )}
        {cut && <p className="text-stale-text text-xs">{cut}</p>}
      </div>

      <div className="flex flex-wrap items-center gap-1.5">
        <CopyAction
          primary
          label="Copy context"
          disabled={!markdown}
          source={async () => (await copyContext(issueId))?.markdown}
        />
        <CopyAction label="Copy prompt" source={prompt} />
      </div>

      <div className="flex flex-col gap-1">
        <span className="text-fg-faint text-xs">Prompt</span>
        <p
          data-wf="HandoffPrompt"
          className="select-text rounded-md border border-border bg-subtle px-2.5 py-2 text-base text-fg leading-normal"
        >
          {prompt}
        </p>
      </div>

      <p className="text-fg-faint text-xs leading-snug">
        The prompt asks Codex or Claude to use the <SkillLink step="handoff" /> skill: it refreshes
        current_state.md first, then prints this bundle. With the wf CLI later:{" "}
        <code className="font-mono">wf context {issueId}</code>.
      </p>
    </div>
  );
}

// ---------------------------------------------------------------- the button

export interface HandoffButtonProps {
  issueId: string;
  /** Under a narrow container the label gives way to the glyph. */
  compact?: boolean;
  className?: string;
}

/**
 * "Copy context": one click copies the bundle and opens the popover that says so. The popover's
 * line is the one confirmation; there is no toast.
 */
export function HandoffButton({ issueId, compact, className }: HandoffButtonProps) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState<boolean | undefined>();

  const onClick = () => {
    // A click that closes the popover is not a second copy.
    if (open) return;
    setCopied(undefined);
    void copyContext(issueId).then((r) => setCopied(r?.ok ?? false));
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <Tooltip content={HANDOFF_HINT} disabled={open}>
        <PopoverTrigger asChild>
          <Button
            data-wf="HandoffButton"
            variant="secondary"
            onClick={onClick}
            aria-label={compact ? "Copy context" : undefined}
            className={cn(
              compact &&
                "@max-[440px]:size-7 @max-[440px]:px-0 group-data-[busy]/codex:@max-[640px]:size-7 group-data-[busy]/codex:@max-[640px]:px-0",
              className,
            )}
          >
            <ClipboardCopy {...ICON} />
            <span
              className={cn(
                compact && "@max-[440px]:hidden group-data-[busy]/codex:@max-[640px]:hidden",
              )}
            >
              Copy context
            </span>
          </Button>
        </PopoverTrigger>
      </Tooltip>
      <PopoverContent
        data-wf="HandoffPopover"
        align="start"
        aria-label="Hand the issue over"
        className="w-[min(420px,calc(100vw-24px))]"
      >
        <HandoffPanel issueId={issueId} copied={copied} />
      </PopoverContent>
    </Popover>
  );
}

// ---------------------------------------------------------------- the whole bundle

/**
 * The dialog that shows the whole bundle. The issue view mounts it, so "View" in the palette's
 * toast and "View all" in the popover open the same reader. It reads the bundle only while open.
 */
export function HandoffViewHost({ issueId }: { issueId: string }) {
  const host = useId();
  const mount = useContextView((s) => s.mount);
  const unmount = useContextView((s) => s.unmount);
  useEffect(() => {
    mount(host);
    return () => unmount(host);
  }, [host, mount, unmount]);
  // One dialog per bundle, even where several views of the same issue are on screen (the kit).
  const open = useContextView((s) => s.issue === issueId && s.hosts[0] === host);
  const close = useContextView((s) => s.close);
  return (
    <Dialog open={open} onOpenChange={(next) => !next && close()}>
      {open && <HandoffDialogBody issueId={issueId} />}
    </Dialog>
  );
}

function HandoffDialogBody({ issueId }: { issueId: string }) {
  const bundle = useContextBundle(issueId);
  const markdown = bundle.data;
  const facts = markdown ? contextFacts(markdown) : undefined;
  const cut = facts ? leftOutLine(facts) : undefined;
  return (
    <DialogContent
      data-wf="HandoffDialog"
      size="lg"
      title={`Context of ${issueId}`}
      description={
        facts
          ? `${tokenCount(facts.tokens)} of ${facts.budget.toLocaleString("en-US")} tokens · exactly what Copy context puts on the clipboard`
          : "Reading the context"
      }
      actions={markdown ? <CopyAction primary label="Copy context" source={markdown} /> : undefined}
    >
      {markdown ? (
        <div className="flex flex-col gap-2">
          <BundleText markdown={markdown} className="max-h-[60dvh]" />
          {cut && <p className="text-stale-text text-xs">{cut}</p>}
        </div>
      ) : bundle.isError ? (
        <p role="alert" className="text-sm text-stale-text">
          Could not read the context of {issueId}.
        </p>
      ) : (
        <BundleSkeleton />
      )}
    </DialogContent>
  );
}
