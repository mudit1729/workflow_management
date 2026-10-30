// "Where to look": chips that stand for sets of pages (spec section 6), any number of them, and
// a size line beside them. Linked to this issue is the default when the issue links pages; one
// chip per library; Pick pages… opens a tree with checkboxes for a group of documents.
import { Check, Link2, ListChecks, X } from "lucide-react";
import type { ReactNode } from "react";
import type { LibraryInfo } from "@/lib/api/types";
import { cn } from "@/lib/cn";
import { PagePicker } from "./PagePicker";
import {
  LARGE_SCOPE_TOKENS,
  MAX_SCOPE_PAGES,
  type ScopeSize,
  type Selection,
  sizeLine,
} from "./scope";
import type { ScopeData } from "./useScope";

const ICON = { size: 14, strokeWidth: 1.75 } as const;

/** One chip: a toggle button, 28 px tall. A check marks it as on (color is never alone). */
function ScopeChip({
  pressed,
  disabled,
  onClick,
  title,
  icon,
  count,
  children,
}: {
  pressed: boolean;
  disabled?: boolean;
  onClick: () => void;
  title?: string;
  icon?: ReactNode;
  count?: number;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      data-wf="ScopeChip"
      aria-pressed={pressed}
      disabled={disabled}
      title={title}
      onClick={onClick}
      className={cn(
        "inline-flex h-7 max-w-full cursor-default items-center gap-1.5 rounded-md border px-2.5 text-base",
        "transition-[background-color,border-color,color] duration-100 ease-wf",
        "disabled:cursor-not-allowed disabled:opacity-50",
        pressed
          ? "border-accent/40 bg-accent-subtle text-accent"
          : "border-border bg-bg text-fg-muted hover:border-border-strong hover:bg-subtle hover:text-fg",
      )}
    >
      {pressed ? <Check aria-hidden {...ICON} /> : icon}
      <span className="min-w-0 truncate">{children}</span>
      {count !== undefined && <span className="tabular text-fg-faint text-sm">{count}</span>}
    </button>
  );
}

/** What a library chip says: the personal library is "My library", the others go by their name. */
export const libraryLabel = (l: Pick<LibraryInfo, "kind" | "name">): string =>
  l.kind === "personal" ? "My library" : l.name;

export interface ScopeChipsProps {
  data: ScopeData;
  selection: Selection;
  onChange: (next: Selection) => void;
  size: ScopeSize;
  pickerOpen: boolean;
  onPickerOpen: (open: boolean) => void;
  /** Title of a page by address, for the pages picked one by one. */
  titleOf: (address: string) => string;
}

export function ScopeChips({
  data,
  selection,
  onChange,
  size,
  pickerOpen,
  onPickerOpen,
  titleOf,
}: ScopeChipsProps) {
  const toggleLibrary = (alias: string) =>
    onChange({
      ...selection,
      libraries: selection.libraries.includes(alias)
        ? selection.libraries.filter((a) => a !== alias)
        : [...selection.libraries, alias],
    });
  const dropPage = (address: string) =>
    onChange({ ...selection, pages: selection.pages.filter((p) => p !== address) });
  const large = size.tokens >= LARGE_SCOPE_TOKENS || size.pages > MAX_SCOPE_PAGES;
  const shown = selection.pages.slice(0, 3);

  return (
    <section data-wf="AskScope" aria-label="Where to look" className="flex flex-col gap-2">
      <h3 className="m-0 font-medium text-fg-muted text-sm">Where to look</h3>
      <div className="flex flex-wrap gap-1.5">
        <ScopeChip
          pressed={selection.linked}
          disabled={!data.hasLinked}
          icon={<Link2 aria-hidden {...ICON} />}
          count={data.facts.linked.length}
          title={
            data.hasLinked
              ? "The pages in this issue's Links"
              : "This issue links no library pages yet"
          }
          onClick={() => onChange({ ...selection, linked: !selection.linked })}
        >
          Linked to this issue
        </ScopeChip>
        {data.libraries.map((l) => (
          <ScopeChip
            key={l.alias}
            pressed={selection.libraries.includes(l.alias)}
            count={l.pages}
            title={`Every page of ${l.name}`}
            onClick={() => toggleLibrary(l.alias)}
          >
            {libraryLabel(l)}
          </ScopeChip>
        ))}
        <ScopeChip
          pressed={pickerOpen}
          icon={<ListChecks aria-hidden {...ICON} />}
          count={selection.pages.length || undefined}
          title="Choose single pages or a folder of them"
          onClick={() => onPickerOpen(!pickerOpen)}
        >
          Pick pages…
        </ScopeChip>
      </div>

      {selection.pages.length > 0 && !pickerOpen && (
        <ul className="m-0 flex list-none flex-wrap gap-1.5 p-0" aria-label="Picked pages">
          {shown.map((a) => (
            <li
              key={a}
              className="inline-flex h-6 max-w-full items-center gap-1 rounded-md bg-muted pr-0.5 pl-2 text-fg-muted text-sm"
            >
              <span className="min-w-0 truncate">{titleOf(a)}</span>
              <button
                type="button"
                aria-label={`Remove ${titleOf(a)}`}
                onClick={() => dropPage(a)}
                className="flex size-5 shrink-0 cursor-default items-center justify-center rounded-sm text-fg-faint hover:bg-border hover:text-fg"
              >
                <X aria-hidden size={12} strokeWidth={1.75} />
              </button>
            </li>
          ))}
          {selection.pages.length > shown.length && (
            <li className="inline-flex h-6 items-center text-fg-faint text-sm">
              +{selection.pages.length - shown.length} more
            </li>
          )}
        </ul>
      )}

      {pickerOpen && (
        <PagePicker
          libraries={data.libraries}
          facts={data.facts}
          selection={selection}
          onChange={onChange}
        />
      )}

      <p
        data-wf="ScopeSize"
        aria-live="polite"
        className={cn("m-0 text-sm tabular", large ? "text-stale-text" : "text-fg-faint")}
      >
        {size.pages === 0
          ? data.loading
            ? "Reading the libraries…"
            : "Choose where to look."
          : sizeLine(size)}
        {large && size.pages > 0 && (
          <span> · The agent reads these whole. Narrow them if you can.</span>
        )}
      </p>
    </section>
  );
}
