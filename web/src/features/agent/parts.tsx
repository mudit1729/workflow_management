// Small pieces the connect flow, the Agent panel and the nav row share: the agent's tile, a status
// dot, a command with its Copy button, and a list of facts.
import { Check, Copy, TriangleAlert } from "lucide-react";
import { Fragment, type ReactNode, useEffect, useRef, useState } from "react";
import { AuthorAvatar, copyText } from "@/components/common";
import { Button } from "@/components/ui";
import { type AgentConnection, type AgentKind, useAuthors } from "@/lib/api";
import { cn } from "@/lib/cn";

const ICON = { size: 14, strokeWidth: 1.75 } as const;

/** The agent's author tile: the same hue as its name on a card or a log entry. */
export function AgentTile({ kind, px = 16 }: { kind: AgentKind; px?: number }) {
  const author = useAuthors().get(kind);
  return <AuthorAvatar handle={kind} author={author} px={px} />;
}

// ---------------------------------------------------------------- status dot

/**
 * One dot for a connection: hollow when there is none, a pulse while it pairs, green when it
 * answers, amber when it stopped. Color only means status. `warn` turns the dot of a connected
 * agent amber too: it answers, but something is left to fix (its skills are missing).
 */
export function StatusDot({
  status,
  warn,
  className,
}: {
  status: AgentConnection["status"];
  warn?: boolean;
  className?: string;
}) {
  const stale = status === "lost" || (status === "connected" && warn);
  return (
    <span
      aria-hidden
      data-status={status}
      className={cn(
        "inline-block size-1.5 shrink-0 rounded-full",
        status === "none" && "size-[7px] border border-fg-faint",
        status === "pairing" && "animate-pulse bg-status-in_progress motion-reduce:animate-none",
        status === "connected" && !stale && "bg-status-done",
        stale && "bg-stale",
        className,
      )}
    />
  );
}

// ---------------------------------------------------------------- copy

/** A Copy button that says what it did for a moment, and nothing else: no toast. */
export function CopyAction({
  text,
  label = "Copy",
  autoFocus,
  className,
}: {
  text: string;
  label?: string;
  /** The first control the flow focuses on this screen. */
  autoFocus?: boolean;
  className?: string;
}) {
  const [state, setState] = useState<"idle" | "copied" | "failed">("idle");
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);
  const click = async () => {
    const ok = await copyText(text);
    setState(ok ? "copied" : "failed");
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setState("idle"), 1500);
  };
  return (
    <Button
      variant="secondary"
      size="sm"
      data-autofocus={autoFocus ? "" : undefined}
      onClick={() => void click()}
      className={className}
    >
      {state === "copied" ? (
        <Check {...ICON} aria-hidden className="text-status-done" />
      ) : state === "failed" ? (
        <TriangleAlert {...ICON} aria-hidden className="text-stale-text" />
      ) : (
        <Copy {...ICON} aria-hidden className="text-fg-faint" />
      )}
      <span aria-live="polite">
        {state === "copied" ? "Copied" : state === "failed" ? "Could not copy" : label}
      </span>
    </Button>
  );
}

/**
 * The arguments of a command as the lines may break it: a flag stays with its value
 * (`--agent claude`), so a line breaks between arguments and never inside one.
 */
function commandUnits(command: string): string[] {
  const units: string[] = [];
  for (const word of command.split(" ")) {
    const last = units.at(-1);
    if (last && /^--?[\w-]+$/.test(last) && !word.startsWith("-"))
      units[units.length - 1] = `${last} ${word}`;
    else units.push(word);
  }
  return units;
}

/** A command to paste in a terminal: a `$`, the command on as many lines as it needs, Copy. */
export function CommandBox({
  command,
  autoFocus,
  className,
}: {
  command: string;
  autoFocus?: boolean;
  className?: string;
}) {
  return (
    <div
      data-wf="CommandBox"
      className={cn(
        "flex min-h-8 items-start gap-2 rounded-md border border-border bg-subtle py-1 pr-1 pl-2.5",
        className,
      )}
    >
      <span aria-hidden className="select-none pt-[3px] font-mono text-fg-faint text-sm">
        $
      </span>
      <code className="min-w-0 flex-1 select-text whitespace-pre-wrap py-[3px] font-mono text-fg text-sm leading-[18px]">
        {/* A line breaks between arguments, and after a slash if a path is wider than the box; never inside `--agent claude` or at the hyphen of `wf-bridge.mjs`. */}
        {commandUnits(command).map((unit, i, units) => (
          <Fragment key={i}>
            <span className="inline-block max-w-full">
              {unit.split(/(?<=\/)/).map((part, j) => (
                <Fragment key={j}>
                  {j > 0 && <wbr />}
                  <span className="whitespace-nowrap">{part}</span>
                </Fragment>
              ))}
            </span>
            {i < units.length - 1 && " "}
          </Fragment>
        ))}
      </code>
      <CopyAction text={command} autoFocus={autoFocus} className="shrink-0" />
    </div>
  );
}

// ---------------------------------------------------------------- facts

/** Label and value pairs: host, repo, version. Faint labels, plain values. */
export function Facts({ rows, className }: { rows: [string, ReactNode][]; className?: string }) {
  return (
    <dl
      data-wf="AgentFacts"
      className={cn("grid grid-cols-[84px_minmax(0,1fr)] gap-x-3 gap-y-1.5 text-base", className)}
    >
      {rows.map(([label, value]) => (
        <div key={label} className="contents">
          <dt className="text-fg-faint">{label}</dt>
          <dd className="min-w-0 truncate text-fg">{value}</dd>
        </div>
      ))}
    </dl>
  );
}
