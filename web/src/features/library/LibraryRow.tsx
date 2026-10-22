// One library item in the list: what it is, when to use it, and how much to trust it.
import { Hourglass } from "lucide-react";
import type { MouseEvent } from "react";
import { KIND_LABEL, KindIcon } from "@/components/common";
import { Chip } from "@/components/ui";
import type { LibId, LibrarySummary } from "@/gen/types";
import { cn } from "@/lib/cn";
import { hrefFor } from "@/lib/nav";
import { InlineCode, LibraryStatusChip, rowDomId } from "./meta";

export interface LibraryRowProps {
  item: LibrarySummary;
  selected: boolean;
  onSelect: (id: LibId) => void;
}

export function LibraryRow({ item, selected, onSelect }: LibraryRowProps) {
  const retired = item.status === "retired";

  const open = (e: MouseEvent<HTMLAnchorElement>) => {
    // Let the browser handle new-tab clicks.
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
    e.preventDefault();
    onSelect(item.id);
  };

  return (
    <li data-wf="LibraryRow" data-status={item.status}>
      <a
        id={rowDomId(item.id)}
        data-lib-row=""
        href={hrefFor(`/lib/${item.id}`)}
        onClick={open}
        aria-current={selected ? "true" : undefined}
        className={cn(
          "flex items-start gap-2.5 px-4 py-2.5 outline-none transition-colors duration-100 ease-wf",
          "hover:bg-subtle focus-visible:bg-subtle focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-focus",
          selected && "bg-muted hover:bg-muted focus-visible:bg-muted",
        )}
      >
        <span
          className="mt-[3px] flex shrink-0 text-fg-muted"
          role="img"
          aria-label={KIND_LABEL[item.kind]}
        >
          <KindIcon kind={item.kind} size={14} />
        </span>

        <span className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span
            className={cn(
              "truncate font-medium text-base leading-5",
              retired ? "text-fg-muted" : "text-fg",
            )}
          >
            {item.title}
          </span>
          <span className={cn("line-clamp-2 text-sm", retired ? "text-fg-faint" : "text-fg-muted")}>
            <InlineCode text={item.description} className="text-[11px] text-fg-muted" />
          </span>
        </span>

        <span className="flex shrink-0 flex-col items-end gap-1 pt-px">
          <LibraryStatusChip status={item.status} />
          <span className="text-fg-faint text-xs tabular">
            {item.used_by > 0 ? `Used by ${item.used_by}` : "Not used yet"}
          </span>
          {item.review_overdue && (
            <Chip
              tone="stale"
              icon={<Hourglass aria-hidden strokeWidth={1.75} />}
              title="Past its review date (Q013)"
            >
              Review overdue
            </Chip>
          )}
        </span>
      </a>
    </li>
  );
}
