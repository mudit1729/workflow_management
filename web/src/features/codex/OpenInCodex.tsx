// "Open in Codex" (plan D3): one click copies the command, says so, and opens a small popover
// with the prompt, so the person sees exactly what the agent will receive. The button follows the
// connected agent (plan D12): "Open in Claude Code" copies `claude '…'`.
import { Check, Copy, Terminal, TriangleAlert } from "lucide-react";
import { useState } from "react";
import { copyText } from "@/components/common";
import { Button, Popover, PopoverContent, PopoverTrigger, Tooltip } from "@/components/ui";
import { type AgentKind, agentCommand, agentName, useAgent, usePreferredAgent } from "@/lib/api";
import { cn } from "@/lib/cn";
import { type CodexIssue, copyCodexCommand, openInAgentHint } from "./open-in-codex";

const ICON = { size: 14, strokeWidth: 1.75 } as const;

// ---------------------------------------------------------------- the panel

export interface OpenInCodexPanelProps {
  issue: CodexIssue;
  /** The click already copied the command: true when the clipboard took it, false when it did not. */
  copied?: boolean;
  /** The agent the command is for. Default: the connected one, else the last one chosen. */
  agent?: AgentKind;
}

/** The prompt, the command, two Copy buttons and a line on what Do next step does instead. */
export function OpenInCodexPanel({ issue, copied, agent }: OpenInCodexPanelProps) {
  const preferred = usePreferredAgent();
  const connected = useAgent().status === "connected";
  const name = agentName(agent ?? preferred);
  const { prompt, command } = agentCommand(agent ?? preferred, issue);
  return (
    <div data-wf="OpenInCodexPanel" className="flex flex-col gap-3">
      <div className="flex flex-col gap-0.5">
        <h3 className="font-semibold text-base text-fg">{name} gets this prompt</h3>
        <p
          role="status"
          className={cn(
            "flex items-center gap-1.5 text-sm",
            copied === false ? "text-stale-text" : "text-fg-muted",
          )}
        >
          {copied === true && <Check {...ICON} aria-hidden className="text-status-done" />}
          {copied === false && <TriangleAlert {...ICON} aria-hidden />}
          {copied === true && "Command copied. Paste it in a terminal at the repo root."}
          {copied === false && "The browser blocked the clipboard. Use Copy command."}
          {copied === undefined && "Paste the command in a terminal at the repo root."}
        </p>
      </div>

      <p
        data-wf="CodexPrompt"
        className="select-text rounded-md border border-border bg-subtle px-2.5 py-2 text-base text-fg leading-normal"
      >
        {prompt}
      </p>

      <div className="flex flex-col gap-1">
        <span className="text-fg-faint text-xs">Command</span>
        <code
          data-wf="CodexCommand"
          title={command}
          className="block select-text truncate rounded-md bg-muted px-2 py-1 font-mono text-fg-muted text-xs"
        >
          {command}
        </code>
      </div>

      <div className="flex items-center gap-1.5">
        <CopyAction text={command} label="Copy command" primary />
        <CopyAction text={prompt} label="Copy prompt" />
      </div>

      <p className="text-fg-faint text-xs leading-snug">
        {name} reads current_state.md first and does the rest with the wf skills. Do next step runs
        it for you{connected ? "" : " once an agent is connected"}.
      </p>
    </div>
  );
}

/** A Copy button that shows what it did for a moment. */
function CopyAction({ text, label, primary }: { text: string; label: string; primary?: boolean }) {
  const [state, setState] = useState<"idle" | "copied" | "failed">("idle");
  const click = async () => {
    const ok = await copyText(text);
    setState(ok ? "copied" : "failed");
    window.setTimeout(() => setState("idle"), 1500);
  };
  return (
    <Button variant={primary ? "secondary" : "ghost"} size="sm" onClick={() => void click()}>
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

// ---------------------------------------------------------------- the button

export interface OpenInCodexProps {
  issue: CodexIssue;
  /** Under a narrow container the label gives way to the glyph (a phone while a run shows). */
  compact?: boolean;
  className?: string;
}

export function OpenInCodex({ issue, compact, className }: OpenInCodexProps) {
  const agent = usePreferredAgent();
  const name = agentName(agent);
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState<boolean | undefined>();
  // The tooltip is controlled for its whole life (a boolean from the first render): flipping
  // `disabled` made it switch between uncontrolled and controlled, which Radix warns about.
  const [hint, setHint] = useState(false);

  const onClick = () => {
    // A click that closes the popover is not a second copy.
    if (open) return;
    setCopied(undefined);
    // The popover's line says "Command copied" (or that the clipboard was blocked): no toast.
    void copyCodexCommand(issue, { toast: false, agent }).then(setCopied);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <Tooltip content={openInAgentHint(agent)} open={hint && !open} onOpenChange={setHint}>
        <PopoverTrigger asChild>
          <Button
            data-wf="OpenInCodexButton"
            variant="secondary"
            onClick={onClick}
            aria-label={compact ? `Open in ${name}` : undefined}
            className={cn(
              compact &&
                "@max-[440px]:size-7 @max-[440px]:px-0 group-data-[busy]/codex:@max-[640px]:size-7 group-data-[busy]/codex:@max-[640px]:px-0",
              className,
            )}
          >
            <Terminal {...ICON} />
            <span
              className={cn(
                compact && "@max-[440px]:hidden group-data-[busy]/codex:@max-[640px]:hidden",
              )}
            >
              Open in {name}
            </span>
          </Button>
        </PopoverTrigger>
      </Tooltip>
      <PopoverContent
        data-wf="OpenInCodexPopover"
        align="start"
        aria-label={`Open in ${name}`}
        className="w-[min(380px,calc(100vw-24px))]"
      >
        <OpenInCodexPanel issue={issue} copied={copied} agent={agent} />
      </PopoverContent>
    </Popover>
  );
}
