// The text of a SKILL.md with line numbers: what the "Source" switch shows. Read only; a skill is
// edited in the repository (the board and the skills read the same markdown files).
// Prose wraps and the numbers stay one per file line; the frontmatter is dimmed.
import { useEffect, useMemo, useRef } from "react";
import { cn } from "@/lib/cn";

export interface SkillSourceProps {
  path: string;
  text: string;
  /** A 1-based line to scroll to and mark (a clicked source tag). */
  line?: number;
}

export function SkillSource({ path, text, line }: SkillSourceProps) {
  const root = useRef<HTMLDivElement>(null);
  const { lines, frontmatterEnd } = useMemo(() => {
    const all = text.replace(/\n$/, "").split("\n");
    const close =
      all[0]?.trim() === "---" ? all.findIndex((l, i) => i > 0 && l.trim() === "---") : -1;
    return { lines: all, frontmatterEnd: close };
  }, [text]);

  useEffect(() => {
    if (!line) return;
    root.current?.querySelector(`[data-line="${line}"]`)?.scrollIntoView({ block: "center" });
  }, [line]);

  return (
    <section
      ref={root}
      data-wf="SkillSource"
      aria-label={`Source of ${path}`}
      className="min-h-0 flex-1 overflow-auto py-3 font-mono text-sm leading-[1.6]"
    >
      <ol className="m-0 list-none p-0">
        {lines.map((text, i) => {
          const n = i + 1;
          const meta = i <= frontmatterEnd;
          return (
            <li
              key={n}
              data-line={n}
              className={cn("flex gap-3 pr-5", n === line && "bg-accent-subtle")}
            >
              <span
                aria-hidden
                className="tabular w-11 shrink-0 select-none pr-1 text-right text-fg-faint"
              >
                {n}
              </span>
              <span
                className={cn(
                  "min-w-0 whitespace-pre-wrap break-words",
                  meta ? "text-fg-muted" : "text-fg",
                  !meta && text.startsWith("#") && "font-semibold",
                )}
              >
                {text || " "}
              </span>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
