// The agent row of the nav (plan D11): a status dot and where things stand, near Kit and the
// Prototype pill. "Connect an agent" opens the connect flow; "Codex · connected" and "Codex · lost"
// open the Agent panel; "Codex · pairing…" goes back to the command. The collapsed rail shows the
// icon with the dot, and the words in a tooltip. `AgentStatusRow` is the row itself, shared with the
// gallery; `AgentStatus` ties it to the connection.
import { Bot } from "lucide-react";
import { openAgent, openAgentPanel } from "@/app/shell-store";
import { Tooltip } from "@/components/ui";
import { type AgentConnection, agentName, useAgent } from "@/lib/api";
import { cn } from "@/lib/cn";
import { statusHint, statusLabel } from "./agent-copy";
import { StatusDot } from "./parts";

const ICON = { size: 14, strokeWidth: 1.75 } as const;

export interface AgentStatusRowProps {
  connection: AgentConnection;
  collapsed?: boolean;
  onClick?: () => void;
  className?: string;
}

export function AgentStatusRow({
  connection: c,
  collapsed,
  onClick,
  className,
}: AgentStatusRowProps) {
  const label = statusLabel(c);
  const lost = c.status === "lost";
  const name = c.agent ? agentName(c.agent) : undefined;
  const hint = statusHint(c);

  if (collapsed) {
    return (
      <Tooltip
        side="right"
        content={
          <span className="flex flex-col gap-0.5">
            <span className="font-semibold">{label}</span>
            <span>{hint}</span>
          </span>
        }
      >
        <button
          type="button"
          data-wf="AgentStatus"
          data-status={c.status}
          aria-label={`${label}. ${hint}`}
          aria-haspopup="dialog"
          onClick={onClick}
          className={cn(
            "relative flex size-7 items-center justify-center rounded-md transition-colors duration-100 ease-wf hover:bg-muted/70",
            lost ? "text-stale-text" : "text-fg-muted hover:text-fg",
            className,
          )}
        >
          <Bot {...ICON} aria-hidden />
          <StatusDot
            status={c.status}
            className="absolute top-[3px] right-[3px] ring-2 ring-subtle"
          />
        </button>
      </Tooltip>
    );
  }

  return (
    <Tooltip side="right" content={hint}>
      <button
        type="button"
        data-wf="AgentStatus"
        data-status={c.status}
        aria-haspopup="dialog"
        onClick={onClick}
        className={cn(
          "flex h-7 w-full min-w-0 items-center gap-2 rounded-md px-2 text-left text-base transition-colors duration-100 ease-wf hover:bg-muted/70",
          lost ? "text-stale-text" : "text-fg-muted hover:text-fg",
          className,
        )}
      >
        {/* The dot sits where Kit's icon does, so the words line up. */}
        <span aria-hidden className="flex w-[14px] shrink-0 items-center justify-center">
          <StatusDot status={c.status} />
        </span>
        <span className="min-w-0 flex-1 truncate">
          {name && c.status !== "none" ? (
            <>
              <span className={lost ? undefined : "font-medium text-fg"}>{name}</span>
              {label.slice(name.length)}
            </>
          ) : (
            label
          )}
        </span>
      </button>
    </Tooltip>
  );
}

export function AgentStatus({
  collapsed,
  onNavigate,
}: {
  collapsed?: boolean;
  /** Called after the click (the mobile sheet closes). */
  onNavigate?: () => void;
}) {
  const connection = useAgent();
  return (
    <AgentStatusRow
      connection={connection}
      collapsed={collapsed}
      onClick={() => {
        if (connection.status === "connected" || connection.status === "lost") openAgentPanel();
        else openAgent();
        onNavigate?.();
      }}
    />
  );
}
