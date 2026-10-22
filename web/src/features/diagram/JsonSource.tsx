// The archify JSON candidate in a mono block. Scrolls, copies on hover, and can fill its parent.
// `highlight` marks lines (1-based) in the danger tint and scrolls the first one into view.
import { useEffect, useMemo, useRef } from "react";
import { CopyButton } from "@/components/common";
import { cn } from "@/lib/cn";

export interface JsonSourceProps {
  source: string;
  /** Cap the height in px; the block scrolls beyond it. */
  maxHeight?: number;
  /** Fill the parent's height (the dialog). */
  fill?: boolean;
  /** Lines to mark, 1-based. */
  highlight?: number[];
  className?: string;
}

export function JsonSource({
  source,
  maxHeight,
  fill = false,
  highlight,
  className,
}: JsonSourceProps) {
  const preRef = useRef<HTMLPreElement>(null);
  const lines = useMemo(() => source.split("\n"), [source]);
  const marked = useMemo(() => new Set(highlight), [highlight]);

  // Show the first marked line without making the reader scroll for it.
  useEffect(() => {
    const pre = preRef.current;
    const first = pre?.querySelector<HTMLElement>("[data-marked]");
    if (pre && first) pre.scrollTop = Math.max(0, first.offsetTop - 28);
  }, []);

  return (
    <div
      data-wf="JsonSource"
      className={cn(
        "group/json relative min-w-0 rounded-md border border-border bg-subtle",
        fill && "h-full min-h-0",
        className,
      )}
    >
      <pre
        ref={preRef}
        className={cn(
          "relative overflow-auto py-3 font-mono text-fg text-xs leading-[1.6]",
          fill && "h-full",
        )}
        style={maxHeight ? { maxHeight } : undefined}
      >
        <code className="block min-w-max pr-11">
          {lines.map((text, i) => (
            <span
              key={i}
              data-marked={marked.has(i + 1) ? "" : undefined}
              className={cn(
                "block border-transparent border-l-2 pr-3 pl-2.5",
                marked.has(i + 1) && "border-danger bg-danger/10",
              )}
            >
              {text || " "}
            </span>
          ))}
        </code>
      </pre>
      <div className="absolute top-1.5 right-2.5 rounded-sm bg-subtle opacity-0 transition-opacity duration-100 focus-within:opacity-100 group-hover/json:opacity-100">
        <CopyButton text={source} label="Copy JSON" />
      </div>
    </div>
  );
}
