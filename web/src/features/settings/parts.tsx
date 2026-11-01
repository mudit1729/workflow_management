// Small pieces the Settings pages share: the source chip, the override mark and a warning line.
import { TriangleAlert } from "lucide-react";
import type { ReactNode } from "react";
import { Chip } from "@/components/ui";
import type { SkillSource, SkillsCatalog } from "@/lib/api";
import { cn } from "@/lib/cn";
import { sourceLabel, sourceTone } from "./labels";

/** Where a skill lives: Built-in, This workspace, a team library's name, Yours. */
export function SourceChip({
  source,
  alias,
  catalog,
  className,
}: {
  source: SkillSource;
  alias?: string;
  catalog: SkillsCatalog | undefined;
  className?: string;
}) {
  return (
    <Chip tone={sourceTone(source)} className={className}>
      {sourceLabel(source, alias, catalog)}
    </Chip>
  );
}

/** A dot and "Your override": the person's own value is in effect over the team's. */
export function OverrideMark({ children = "Your override" }: { children?: ReactNode }) {
  return (
    <span
      data-wf="OverrideMark"
      className="inline-flex shrink-0 items-center gap-1 whitespace-nowrap text-accent text-xs"
    >
      <span aria-hidden className="size-1.5 rounded-full bg-accent" />
      {children}
    </span>
  );
}

/** A reference that does not resolve, a skill that is not valid: amber, with the sentence. */
export function Warning({
  children,
  className,
  role,
  title,
}: {
  children: ReactNode;
  className?: string;
  role?: "alert" | "status";
  /** The full sentence, when the line shows a short one. */
  title?: string;
}) {
  return (
    <p
      data-wf="Warning"
      role={role}
      title={title}
      className={cn("flex min-w-0 items-start gap-1.5 text-stale-text text-xs", className)}
    >
      <TriangleAlert
        aria-hidden
        size={12}
        strokeWidth={1.75}
        className="mt-px shrink-0 text-stale"
      />
      <span className="min-w-0">{children}</span>
    </p>
  );
}
