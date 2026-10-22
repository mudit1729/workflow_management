// "Context from Workdatabase": a field in the New issue dialog (and the New file dialog) that
// collects library items, glossary terms, files and decisions an agent should read with the
// issue. The Add button opens a command-style search; picks show as removable chips below.
import { Plus, X } from "lucide-react";
import { useMemo, useState } from "react";
import { Button, Chip, Popover, PopoverContent, PopoverTrigger, Tooltip } from "@/components/ui";
import { cn } from "@/lib/cn";
import { ContextIcon } from "./ContextIcon";
import { ContextSearch } from "./ContextSearch";
import { type ContextItem, DRAFT_NOTE, isDraft, itemKey } from "./types";

export interface ContextPickerProps {
  value: ContextItem[];
  onChange: (items: ContextItem[]) => void;
  /** Keys (`kind:target`) that are linked already and must not be offered. */
  exclude?: ReadonlySet<string>;
  /** Tighter: no intro line. */
  compact?: boolean;
  /** The issue that holds the links, when it exists. */
  issueId?: string;
  /** Open the list on first render (the component gallery). */
  defaultOpen?: boolean;
  className?: string;
}

export const POPOVER_CLASS = "w-[min(460px,calc(100vw-32px))] overflow-hidden p-0";

export function ContextPicker({
  value,
  onChange,
  exclude,
  compact = false,
  issueId,
  defaultOpen = false,
  className,
}: ContextPickerProps) {
  const [open, setOpen] = useState(defaultOpen);

  // What the list hides: the picks and whatever the caller says is linked already.
  const taken = useMemo(() => {
    const keys = new Set(exclude);
    for (const item of value) keys.add(itemKey(item));
    return keys;
  }, [exclude, value]);

  const add = (item: ContextItem) => {
    if (!taken.has(itemKey(item))) onChange([...value, item]);
  };
  const remove = (item: ContextItem) => onChange(value.filter((v) => itemKey(v) !== itemKey(item)));

  return (
    <div data-wf="ContextPicker" className={cn("flex min-w-0 flex-col gap-1.5", className)}>
      <div className="flex min-h-7 items-center gap-2">
        <span className="font-medium text-fg-muted text-sm">Context from Workdatabase</span>
        {value.length > 0 && <span className="tabular text-fg-faint text-xs">{value.length}</span>}
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger asChild>
            <Button
              variant="secondary"
              size="sm"
              className="ml-auto"
              aria-label="Add context from the Workdatabase"
              aria-haspopup="dialog"
            >
              <Plus aria-hidden size={14} strokeWidth={1.75} />
              Add
            </Button>
          </PopoverTrigger>
          <PopoverContent align="end" className={POPOVER_CLASS}>
            <ContextSearch onPick={add} exclude={taken} issueId={issueId} active={open} />
          </PopoverContent>
        </Popover>
      </div>
      {value.length === 0 ? (
        !compact && (
          <p className="text-fg-faint text-sm">
            Library items, glossary terms, files and decisions the agent should read.
          </p>
        )
      ) : (
        <ul aria-label="Context picked" className="flex min-w-0 flex-wrap gap-1.5">
          {value.map((item) => (
            <li key={itemKey(item)} className="min-w-0 max-w-full">
              <ContextChip item={item} onRemove={() => remove(item)} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** One picked item: its glyph, its title, the faint id, and a button that takes it out. */
export function ContextChip({
  item,
  onRemove,
  className,
}: {
  item: ContextItem;
  onRemove?: () => void;
  className?: string;
}) {
  const draft = isDraft(item);
  return (
    <span
      data-wf="ContextChip"
      className={cn(
        "inline-flex h-6 max-w-full items-center gap-1.5 rounded-md border border-border bg-subtle pl-1.5 text-sm",
        onRemove ? "pr-0.5" : "pr-1.5",
        className,
      )}
    >
      <ContextIcon item={item} size={12} />
      <span className={cn("min-w-0 truncate", item.kind === "file" && "font-mono text-xs")}>
        {item.title}
      </span>
      {item.id && item.kind !== "term" && (
        <span className="shrink-0 font-mono text-fg-faint text-xs">{item.id}</span>
      )}
      {draft && (
        <Tooltip content={DRAFT_NOTE}>
          <span className="shrink-0">
            <Chip tone="stale" size="xs">
              Draft
            </Chip>
          </span>
        </Tooltip>
      )}
      {onRemove && (
        <button
          type="button"
          aria-label={`Remove ${item.title}`}
          onClick={onRemove}
          className="flex size-5 shrink-0 items-center justify-center rounded-sm text-fg-faint transition-colors duration-100 hover:bg-muted hover:text-fg"
        >
          <X aria-hidden size={12} strokeWidth={1.75} />
        </button>
      )}
    </span>
  );
}
