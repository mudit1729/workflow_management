// The library's one search box with its scope: All, Personal, or one team library (spec 5, Search).
// Few scopes are buttons; more than four are a menu (buttons before multiple choice before menus).
import { ChevronDown } from "lucide-react";
import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
  SearchInput,
  Segmented,
} from "@/components/ui";
import { useLibraries } from "@/lib/api";
import type { LibraryInfo } from "@/lib/api/types";
import { cn } from "@/lib/cn";
import { PERSONAL_ALIAS } from "./address";
import { useLibrarySearchState } from "./useLibrarySearchState";
import { useSearchBox } from "./useSearchBox";

/** At most this many scopes are shown as buttons. */
const BUTTONS_UP_TO = 4;

/** The scopes of a set of libraries: All, then Personal, then each team library. */
export function scopeOptions(libraries: LibraryInfo[]): { value: string; label: string }[] {
  const personal = libraries.find((l) => l.kind === "personal");
  const teams = libraries.filter((l) => l.kind !== "personal");
  return [
    { value: "all", label: "All" },
    ...(personal ? [{ value: PERSONAL_ALIAS, label: "Personal" }] : []),
    ...teams.map((l) => ({ value: l.alias, label: l.name })),
  ];
}

export function LibrarySearchBox({
  className,
  compact,
}: {
  className?: string;
  /** One row: the scope is a menu beside the box (a phone has no room for buttons). */
  compact?: boolean;
}) {
  const state = useLibrarySearchState();
  const libraries = useLibraries().data ?? [];
  const { input, setInput } = useSearchBox(state.q, state.setQuery);
  const options = scopeOptions(libraries);
  const current = options.find((o) => o.value === state.scope) ?? options[0];

  const scope =
    options.length <= 1 ? null : options.length <= BUTTONS_UP_TO && !compact ? (
      <Segmented
        size="sm"
        aria-label="Where to search"
        value={state.scope}
        onChange={state.setScope}
        options={options}
      />
    ) : (
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="secondary" size="sm" aria-label={`Search in: ${current?.label}`}>
            <span className="max-w-32 truncate">{current?.label}</span>
            <ChevronDown aria-hidden size={14} strokeWidth={1.75} />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuRadioGroup value={state.scope} onValueChange={state.setScope}>
            {options.map((o) => (
              <DropdownMenuRadioItem key={o.value} value={o.value}>
                {o.label}
              </DropdownMenuRadioItem>
            ))}
          </DropdownMenuRadioGroup>
        </DropdownMenuContent>
      </DropdownMenu>
    );

  return (
    <div data-wf="LibrarySearchBox" className={cn("flex min-w-0 items-center gap-2", className)}>
      <SearchInput
        value={input}
        onChange={setInput}
        placeholder="Search the libraries"
        shortcut={compact ? undefined : "/"}
        className="min-w-0 flex-1"
      />
      {scope && <div className="shrink-0">{scope}</div>}
    </div>
  );
}
