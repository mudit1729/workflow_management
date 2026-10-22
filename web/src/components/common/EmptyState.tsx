// Quiet empty state that names the skill or command that fills the space.
import type { ReactNode } from "react";
import { cn } from "@/lib/cn";
import { CopyButton } from "./CopyButton";

export interface EmptyStateProps {
  icon?: ReactNode;
  title: ReactNode;
  hint?: ReactNode;
  /** Skill name, shown as "Run the `write-plan` skill". */
  skill?: string;
  /** A `wf …` command, shown copyable. */
  command?: string;
  action?: ReactNode;
  /** Inline, left-aligned variant for sections inside a panel. */
  compact?: boolean;
  className?: string;
}

function SkillLine({ skill }: { skill: string }) {
  return (
    <p className="text-fg-muted text-sm">
      Run the{" "}
      <code className="rounded-sm bg-muted px-1 py-px font-mono text-[11.5px] text-fg">
        {skill}
      </code>{" "}
      skill.
    </p>
  );
}

function CommandLine({ command }: { command: string }) {
  return (
    <div className="flex h-7 max-w-full items-center gap-2 rounded-md border border-border bg-subtle pr-0.5 pl-2.5">
      <span aria-hidden className="font-mono text-fg-faint text-sm">
        $
      </span>
      <code className="min-w-0 truncate font-mono text-fg text-sm">{command}</code>
      <CopyButton text={command} label="Copy command" />
    </div>
  );
}

export function EmptyState({
  icon,
  title,
  hint,
  skill,
  command,
  action,
  compact = false,
  className,
}: EmptyStateProps) {
  if (compact) {
    return (
      <div
        data-wf="EmptyState"
        className={cn("flex min-w-0 items-start gap-2.5 py-2 text-left", className)}
      >
        {icon && (
          <span aria-hidden className="mt-0.5 flex shrink-0 text-fg-faint [&>svg]:size-[14px]">
            {icon}
          </span>
        )}
        <div className="flex min-w-0 flex-col items-start gap-1.5">
          <div className="flex flex-col gap-0.5">
            <p className="font-medium text-fg-muted text-sm">{title}</p>
            {hint && <p className="text-fg-faint text-sm">{hint}</p>}
          </div>
          {skill && <SkillLine skill={skill} />}
          {command && <CommandLine command={command} />}
          {action}
        </div>
      </div>
    );
  }
  return (
    <div
      data-wf="EmptyState"
      className={cn(
        "flex min-w-0 flex-col items-center justify-center gap-3 px-6 py-10 text-center",
        className,
      )}
    >
      {icon && (
        <span
          aria-hidden
          className="flex size-9 items-center justify-center rounded-lg border border-border bg-subtle text-fg-faint [&>svg]:size-[18px]"
        >
          {icon}
        </span>
      )}
      <div className="flex max-w-[340px] flex-col gap-1">
        <p className="font-medium text-base text-fg">{title}</p>
        {hint && <p className="text-fg-muted text-sm">{hint}</p>}
      </div>
      {(skill || command) && (
        <div className="flex max-w-full flex-col items-center gap-2">
          {skill && <SkillLine skill={skill} />}
          {command && <CommandLine command={command} />}
        </div>
      )}
      {action && <div className="pt-1">{action}</div>}
    </div>
  );
}
