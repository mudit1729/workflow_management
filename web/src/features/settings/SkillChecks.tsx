// The live check list beside the editor of a skill (spec 5.4): the rules of check-skills.mjs,
// applied to the text as it is typed, so a copy that would be refused is seen before it is saved.
import { Check, CircleAlert } from "lucide-react";
import type { SkillProblem } from "@/lib/api";
import { cn } from "@/lib/cn";

/** The one line that sums the list up: "Passes the skill rules" or "2 problems". */
export function checksSummary(problems: readonly SkillProblem[]): string {
  return problems.length === 0
    ? "Passes the skill rules"
    : `${problems.length} ${problems.length === 1 ? "problem" : "problems"}`;
}

export function SkillChecks({
  problems,
  className,
}: {
  problems: readonly SkillProblem[];
  className?: string;
}) {
  return (
    <section
      data-wf="SkillChecks"
      aria-label="Skill checks"
      className={cn("flex min-w-0 flex-col gap-2", className)}
    >
      <h3 className="font-semibold text-fg text-sm">Checks</h3>
      {/* The list changes as the text does: a screen reader hears the count, not every keystroke. */}
      <div aria-live="polite" className="flex flex-col gap-2">
        {problems.length === 0 ? (
          <p className="flex items-center gap-1.5 text-sm text-success-text">
            <Check aria-hidden size={14} strokeWidth={1.75} className="shrink-0" />
            {checksSummary(problems)}
          </p>
        ) : (
          <>
            <p className="sr-only">{checksSummary(problems)}</p>
            <ul className="m-0 flex list-none flex-col gap-1.5 p-0">
              {problems.map((p) => (
                <li
                  key={`${p.line ?? "x"}:${p.message}`}
                  className="flex min-w-0 items-start gap-1.5 text-sm"
                >
                  <CircleAlert
                    aria-hidden
                    size={14}
                    strokeWidth={1.75}
                    className="mt-px shrink-0 text-danger"
                  />
                  <span className="min-w-0 text-fg">
                    {p.line !== undefined && (
                      <span className="tabular text-fg-faint">Line {p.line + 1} · </span>
                    )}
                    {p.message}
                  </span>
                </li>
              ))}
            </ul>
          </>
        )}
      </div>
      <p className="text-fg-faint text-xs">The same rules as check-skills.mjs.</p>
    </section>
  );
}
