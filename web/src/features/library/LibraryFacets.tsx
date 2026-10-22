// The 200 px facet pane: kind, status, tags and the review-overdue toggle.
import { Hourglass } from "lucide-react";
import { type ReactNode, useId } from "react";
import { KindIcon } from "@/components/common";
import { Button, Chip, Switch } from "@/components/ui";
import type { LibraryKind, LibraryStatus } from "@/gen/types";
import { cn } from "@/lib/cn";
import type { FacetCounts, FacetState } from "./filters";
import { KIND_PLURAL, LIBRARY_KINDS, LIBRARY_STATUS_LABEL, LIBRARY_STATUSES } from "./meta";

export interface LibraryFacetsProps {
  filters: FacetState;
  counts: FacetCounts;
  tags: string[];
  active: boolean;
  onKind: (kind: LibraryKind | undefined) => void;
  onStatus: (status: LibraryStatus | undefined) => void;
  onTag: (tag: string) => void;
  onOverdue: (on: boolean) => void;
  onClear: () => void;
}

export function LibraryFacets({
  filters,
  counts,
  tags,
  active,
  onKind,
  onStatus,
  onTag,
  onOverdue,
  onClear,
}: LibraryFacetsProps) {
  const overdueId = useId();
  return (
    <nav
      data-wf="LibraryFacets"
      aria-label="Filter the library"
      className="flex w-[200px] shrink-0 flex-col gap-4 overflow-y-auto border-border border-r bg-subtle px-2 py-3"
    >
      <Group title="Kind">
        {LIBRARY_KINDS.map((k) => (
          <FacetRow
            key={k}
            icon={<KindIcon kind={k} size={14} />}
            label={KIND_PLURAL[k]}
            count={counts.kind[k]}
            active={filters.kind === k}
            onClick={() => onKind(filters.kind === k ? undefined : k)}
          />
        ))}
      </Group>

      <Group title="Status">
        {LIBRARY_STATUSES.map((s) => (
          <FacetRow
            key={s}
            label={LIBRARY_STATUS_LABEL[s]}
            count={counts.status[s]}
            active={filters.status === s}
            onClick={() => onStatus(filters.status === s ? undefined : s)}
          />
        ))}
        {/* Review overdue filters the same list: it sits with the statuses it narrows. */}
        <label
          htmlFor={overdueId}
          className="flex h-7 cursor-default items-center gap-2 rounded-md px-2 text-base text-fg-muted transition-colors duration-100 ease-wf hover:bg-muted hover:text-fg"
        >
          <span className="min-w-0 flex-1 truncate">Review overdue</span>
          <span className="font-normal text-fg-faint text-sm tabular">{counts.overdue}</span>
          <Switch
            id={overdueId}
            checked={filters.overdue}
            onCheckedChange={onOverdue}
            disabled={counts.overdue === 0 && !filters.overdue}
          />
        </label>
      </Group>

      {tags.length > 0 && (
        <Group title="Tags">
          <div className="flex flex-wrap gap-1 px-1">
            {tags.map((t) => {
              const n = counts.tags.get(t) ?? 0;
              const on = filters.tags.includes(t);
              return (
                <Chip
                  key={t}
                  size="sm"
                  tone={on ? "accent" : "neutral"}
                  pressed={on}
                  onClick={() => onTag(t)}
                  title={`${n} ${n === 1 ? "item" : "items"} tagged ${t}`}
                  className={cn(!on && n === 0 && "opacity-50")}
                >
                  {t} <span className="font-normal opacity-60">{n}</span>
                </Chip>
              );
            })}
          </div>
        </Group>
      )}

      {active && (
        <div className="mt-auto flex flex-col pt-2">
          <Button variant="ghost" size="sm" onClick={onClear} className="justify-start">
            Clear filters
          </Button>
        </div>
      )}
    </nav>
  );
}

function Group({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-0.5">
      <h2 className="px-2 pb-1 font-medium text-fg-faint text-xs">{title}</h2>
      {children}
    </section>
  );
}

function FacetRow({
  icon,
  label,
  count,
  active,
  onClick,
}: {
  icon?: ReactNode;
  label: string;
  count: number;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      disabled={count === 0 && !active}
      onClick={onClick}
      className={cn(
        "flex h-7 w-full cursor-default items-center gap-2 rounded-md px-2 text-left text-base text-fg-muted",
        "transition-colors duration-100 ease-wf hover:bg-muted hover:text-fg",
        "disabled:pointer-events-none disabled:opacity-50",
        active && "bg-muted font-medium text-fg",
      )}
    >
      {icon && <span className="flex shrink-0">{icon}</span>}
      <span className="min-w-0 flex-1 truncate">{label}</span>
      <span className="font-normal text-fg-faint text-sm tabular">{count}</span>
    </button>
  );
}

/** The narrow-screen replacement for the facet pane: kind chips, drafts and overdue. */
export function LibraryFilterChips({
  filters,
  counts,
  onKind,
  onStatus,
  onOverdue,
}: Pick<LibraryFacetsProps, "filters" | "counts" | "onKind" | "onStatus" | "onOverdue">) {
  return (
    <div
      data-wf="LibraryFilterChips"
      role="toolbar"
      aria-label="Filter the library"
      className="flex shrink-0 gap-1.5 overflow-x-auto border-border border-b bg-subtle px-4 py-2"
    >
      {LIBRARY_KINDS.map((k) => (
        <Chip
          key={k}
          size="sm"
          tone={filters.kind === k ? "accent" : "neutral"}
          pressed={filters.kind === k}
          icon={<KindIcon kind={k} size={12} />}
          onClick={() => onKind(filters.kind === k ? undefined : k)}
        >
          {KIND_PLURAL[k]} <span className="font-normal opacity-60">{counts.kind[k]}</span>
        </Chip>
      ))}
      <Chip
        size="sm"
        tone={filters.status === "draft" ? "accent" : "neutral"}
        pressed={filters.status === "draft"}
        onClick={() => onStatus(filters.status === "draft" ? undefined : "draft")}
      >
        Draft <span className="font-normal opacity-60">{counts.status.draft}</span>
      </Chip>
      <Chip
        size="sm"
        tone={filters.overdue ? "accent" : "neutral"}
        pressed={filters.overdue}
        icon={<Hourglass aria-hidden strokeWidth={1.75} />}
        onClick={() => onOverdue(!filters.overdue)}
      >
        Review overdue <span className="font-normal opacity-60">{counts.overdue}</span>
      </Chip>
    </div>
  );
}
