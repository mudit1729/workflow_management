// The search behind "Add context": a command list over the Workdatabase, grouped by where an
// item lives (Library, Glossary, Files, Decisions), with counts. Keyboard first: type, ↑↓, ↵.
// The list stays open after a pick so several items can go in one visit.
import { type ReactNode, useMemo, useState } from "react";
import {
  Chip,
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  Kbd,
} from "@/components/ui";
import { cn } from "@/lib/cn";
import { ContextIcon } from "./ContextIcon";
import { type ContextItem, DRAFT_NOTE, isDraft, itemKey } from "./types";
import {
  type Candidate,
  type ContextGroup,
  GROUP_LABEL,
  GROUP_ORDER,
  rank,
  useWorkdatabase,
} from "./useWorkdatabase";

// Rows per group before the person types: the library is the main source, so it shows more.
const IDLE_LIMIT: Record<ContextGroup, number> = {
  library: 8,
  glossary: 4,
  files: 4,
  decisions: 4,
};
const QUERY_LIMIT = 8;

export const AMBER_TEXT = "text-[color-mix(in_srgb,var(--wf-signal-stale)_78%,var(--wf-text))]";

export interface ContextSearchProps {
  onPick: (item: ContextItem) => void;
  /** Keys (`kind:target`) already picked or linked. They are not offered again. */
  exclude?: ReadonlySet<string>;
  /** The issue that holds the links. Its own files and decisions are left out. */
  issueId?: string;
  /** False while the list is closed: holds back the fetches. */
  active?: boolean;
  autoFocus?: boolean;
  className?: string;
}

const NO_KEYS: ReadonlySet<string> = new Set();

export function ContextSearch({
  onPick,
  exclude = NO_KEYS,
  issueId,
  active = true,
  autoFocus = true,
  className,
}: ContextSearchProps) {
  const db = useWorkdatabase({ enabled: active, issueId });
  const [query, setQuery] = useState("");
  const [highlight, setHighlight] = useState("");

  const { groups, taken } = useMemo(() => {
    const typed = query.trim() !== "";
    let taken = 0;
    const groups = GROUP_ORDER.map((group) => {
      const matches = rank(db[group], query);
      const all = matches.filter((c) => !exclude.has(itemKey(c.item)));
      taken += matches.length - all.length;
      return {
        group,
        total: all.length,
        shown: all.slice(0, typed ? QUERY_LIMIT : IDLE_LIMIT[group]),
      };
    }).filter((g) => g.total > 0);
    return { groups, taken };
  }, [db, query, exclude]);

  const current = groups.flatMap((g) => g.shown).find((c) => itemKey(c.item) === highlight)?.item;
  const note = current && isDraft(current) ? DRAFT_NOTE : undefined;

  return (
    <Command
      data-wf="ContextSearch"
      shouldFilter={false}
      loop
      label="Search the Workdatabase"
      value={highlight}
      onValueChange={setHighlight}
      className={cn("h-auto", className)}
    >
      <CommandInput
        value={query}
        onValueChange={setQuery}
        autoFocus={autoFocus}
        placeholder="Search library, glossary, files, decisions"
        aria-label="Search the Workdatabase"
      />
      <CommandList className="max-h-[min(340px,46dvh)]">
        {db.loading && groups.length === 0 ? (
          <p className="px-3 py-8 text-center text-fg-faint text-sm">Loading…</p>
        ) : (
          <CommandEmpty>
            {!query.trim()
              ? "Everything is already added."
              : taken > 0
                ? "Everything that matches is already added."
                : `Nothing matches “${query.trim()}”. Try a title, a tag or a file name.`}
          </CommandEmpty>
        )}
        {groups.map(({ group, total, shown }) => (
          <CommandGroup
            key={group}
            heading={
              <span className="flex items-baseline gap-1.5">
                {GROUP_LABEL[group]}
                <span className="tabular font-normal">{total}</span>
              </span>
            }
          >
            {shown.map((c) => (
              <Row key={itemKey(c.item)} c={c} onPick={onPick} />
            ))}
            {total > shown.length && (
              <p className="px-2 py-1 text-fg-faint text-xs">
                <span className="tabular">{total - shown.length}</span> more. Type to narrow the
                list.
              </p>
            )}
          </CommandGroup>
        ))}
      </CommandList>
      <div className="flex min-h-8 shrink-0 items-center gap-3 border-border border-t px-3 py-1.5 text-fg-faint text-xs">
        {note ? (
          <span className={cn("min-w-0 truncate", AMBER_TEXT)}>{note}.</span>
        ) : (
          <>
            <span className="truncate">Goes under Links in goal.md.</span>
            <span className="ml-auto hidden shrink-0 items-center gap-2.5 sm:flex">
              <Keys keys={["↑", "↓"]} label="move" />
              <Keys keys={["↵"]} label="add" />
              <Keys keys={["Esc"]} label="close" />
            </span>
          </>
        )}
      </div>
    </Command>
  );
}

function Keys({ keys, label }: { keys: string[]; label: string }) {
  return (
    <span className="inline-flex items-center gap-1">
      {keys.map((k) => (
        <Kbd key={k}>{k}</Kbd>
      ))}
      {label}
    </span>
  );
}

function Row({ c, onPick }: { c: Candidate; onPick: (item: ContextItem) => void }) {
  const { item } = c;
  const mono = item.kind === "file";
  const chip: ReactNode =
    item.kind === "library" ? (
      item.status === "draft" ? (
        <Chip tone="stale" size="xs" title={DRAFT_NOTE}>
          Draft
        </Chip>
      ) : (
        <Chip tone="success" size="xs">
          Reviewed
        </Chip>
      )
    ) : undefined;
  return (
    <CommandItem
      value={itemKey(item)}
      onSelect={() => onPick(item)}
      icon={<ContextIcon item={item} />}
      hint={chip}
      className="h-auto min-h-8 items-start py-1.5 [&>span:first-child]:mt-0.5"
    >
      <span className="flex min-w-0 flex-col gap-px">
        <span className="flex min-w-0 items-baseline gap-1.5">
          <span className={cn("truncate", mono && "font-mono text-sm")}>{item.title}</span>
          {item.id && <span className="shrink-0 font-mono text-fg-faint text-xs">{item.id}</span>}
        </span>
        {item.detail && <span className="truncate text-fg-faint text-sm">{item.detail}</span>}
      </span>
    </CommandItem>
  );
}
