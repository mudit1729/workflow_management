// Mono code block: subtle surface, hairline, horizontal scroll, language label and copy.
import { cn } from "@/lib/cn";
import { CopyButton } from "./CopyButton";

export interface CodeBlockProps {
  code: string;
  lang?: string;
  /** Highlight one 1-based line (e.g. the line a lint finding points at). */
  highlightLine?: number;
  /** Cap the height; the block scrolls vertically beyond it. */
  maxHeight?: number;
  compact?: boolean;
  className?: string;
}

export function CodeBlock({
  code,
  lang,
  highlightLine,
  maxHeight,
  compact = false,
  className,
}: CodeBlockProps) {
  const lines = highlightLine ? code.split("\n") : null;
  return (
    <div
      data-wf="CodeBlock"
      className={cn(
        "group/code relative min-w-0 rounded-md border border-border bg-subtle",
        className,
      )}
    >
      <div className="absolute top-1 right-1 z-10 flex items-center gap-1 rounded-sm bg-subtle pl-1.5">
        {lang && (
          <span className="select-none font-mono text-[10px] text-fg-faint lowercase">{lang}</span>
        )}
        <span className="opacity-0 transition-opacity duration-100 focus-within:opacity-100 group-hover/code:opacity-100">
          <CopyButton text={code} label="Copy code" />
        </span>
      </div>
      <pre
        className={cn(
          "overflow-x-auto py-2.5 pl-3 font-mono text-fg leading-[1.6]",
          compact ? "text-[11px]" : "text-[12px]",
          lang ? "pr-20" : "pr-10",
        )}
        style={maxHeight ? { maxHeight, overflowY: "auto" } : undefined}
      >
        {lines ? (
          <code className="block min-w-max">
            {lines.map((line, i) => (
              <span
                key={i}
                data-line={i + 1}
                className={cn(
                  "-ml-3 block pl-3",
                  i + 1 === highlightLine &&
                    "-mr-20 bg-danger/10 shadow-[inset_2px_0_0_var(--wf-signal-danger)]",
                )}
              >
                {line || " "}
              </span>
            ))}
          </code>
        ) : (
          <code>{code}</code>
        )}
      </pre>
    </div>
  );
}
