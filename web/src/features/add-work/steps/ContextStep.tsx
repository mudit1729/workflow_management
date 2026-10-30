// "Context from the Workdatabase": library items and glossary terms found with a search on what
// the person typed, as toggle chips. Skip is always one press away.
import { useMemo } from "react";
import { Skeleton } from "@/components/ui";
import { ContextIcon } from "@/features/context/ContextIcon";
import {
  type ContextItem,
  isDraft,
  itemKey,
  libraryItem,
  termItem,
} from "@/features/context/types";
import { useGlossary, useSearch, useSnapshot } from "@/lib/api";
import { KeyHint, ToggleChip, useDigitKeys } from "../parts";
import type { AddWorkFlow } from "../useAddWorkFlow";
import { Screen } from "./shared";

const MAX_CHIPS = 9;
const MAX_TERMS = 3;
const MAX_COMMON = 4;

/** What the search finds for `query`: library items first, then glossary terms, nine at most. */
export function useContextSuggestions(query: string): {
  items: ContextItem[];
  /** Used most in the workspace: offered when nothing matches the query. */
  common: ContextItem[];
  loading: boolean;
} {
  const snapshot = useSnapshot().data;
  const glossary = useGlossary().data;
  const library = useSearch(query, "library", 8);
  const terms = useSearch(query, "terms", 6);
  const typed = query.trim() !== "";

  return useMemo(() => {
    const byId = new Map((snapshot?.library ?? []).map((l) => [l.id, l]));
    const byTerm = new Map((glossary ?? []).map((t) => [t.term, t]));
    // A retired item is no longer injected into agent context, so it is not offered.
    const libs = (library.data ?? []).flatMap((h) => {
      const l = byId.get(h.id);
      return l && l.status !== "retired" ? [libraryItem(l)] : [];
    });
    const words = (terms.data ?? []).flatMap((h) => {
      const t = byTerm.get(h.id);
      return t ? [termItem(t)] : [];
    });
    const libCount = Math.min(libs.length, MAX_CHIPS - Math.min(words.length, MAX_TERMS));
    const picked = libs.slice(0, libCount);
    const common = (snapshot?.library ?? [])
      .filter((l) => l.status === "reviewed")
      .sort((a, b) => b.used_by - a.used_by || a.title.localeCompare(b.title))
      .slice(0, MAX_COMMON)
      .map(libraryItem);
    return {
      items: [...picked, ...words.slice(0, MAX_CHIPS - picked.length)],
      common,
      loading: typed && (library.isPending || terms.isPending || !snapshot || !glossary),
    };
  }, [snapshot, glossary, library.data, terms.data, library.isPending, terms.isPending, typed]);
}

export function ContextStep({ flow }: { flow: AddWorkFlow }) {
  const { draft } = flow;
  const query = draft.kind === "issue" ? draft.title : draft.outcome;
  const found = useContextSuggestions(query);
  const { loading } = found;
  // With no match, the library items used most are offered instead, and the screen says so.
  const matched = found.items.length > 0;
  const items = matched ? found.items : found.common;
  const picked = new Set(draft.context.map(itemKey));

  const toggle = (item: ContextItem) => {
    const key = itemKey(item);
    flow.patch({
      context: picked.has(key)
        ? draft.context.filter((c) => itemKey(c) !== key)
        : [...draft.context, item],
    });
  };
  useDigitKeys((n) => {
    const item = items[n - 1];
    if (item) toggle(item);
  });

  // Picks that the search no longer offers (the person went back and edited) stay picked.
  const extra = draft.context.filter((c) => !items.some((i) => itemKey(i) === itemKey(c)));
  const all = [...items, ...extra];
  const libs = all.filter((i) => i.kind === "library");
  const terms = all.filter((i) => i.kind === "term");
  const number = (item: ContextItem) => {
    const n = items.findIndex((i) => itemKey(i) === itemKey(item)) + 1;
    return n > 0 ? n : undefined;
  };

  return (
    <Screen
      flow={flow}
      title="Should the agent read anything first?"
      hint="Library items and glossary terms that match what you wrote. They are linked in each goal.md, so any agent finds them."
    >
      {loading ? (
        <div className="flex flex-wrap gap-2" aria-busy>
          {[28, 40, 32, 36].map((w) => (
            <Skeleton key={w} className="h-8 rounded-md" style={{ width: `${w * 4}px` }} />
          ))}
        </div>
      ) : all.length === 0 ? (
        <p className="rounded-md border border-border border-dashed px-3 py-3 text-fg-muted text-sm">
          The Workdatabase has nothing to suggest yet. Skip this; you can add context later from the
          Goal tab.
        </p>
      ) : (
        <div className="flex flex-col gap-4">
          {!matched && (
            <p className="text-fg-muted text-sm">
              Nothing matches what you wrote. These library items are used most:
            </p>
          )}
          <ChipGroup
            heading="Library"
            items={libs}
            picked={picked}
            number={number}
            onToggle={toggle}
          />
          <ChipGroup
            heading="Glossary"
            items={terms}
            picked={picked}
            number={number}
            onToggle={toggle}
          />
        </div>
      )}
      <KeyHint>Press 1 to 9 to toggle a chip, Enter to continue.</KeyHint>
    </Screen>
  );
}

function ChipGroup({
  heading,
  items,
  picked,
  number,
  onToggle,
}: {
  heading: string;
  items: ContextItem[];
  picked: Set<string>;
  number: (item: ContextItem) => number | undefined;
  onToggle: (item: ContextItem) => void;
}) {
  if (items.length === 0) return null;
  return (
    <div data-wf="ContextChips" className="flex min-w-0 flex-col gap-1.5">
      <h3 className="font-medium text-fg-muted text-sm">{heading}</h3>
      <ul className="flex min-w-0 flex-wrap gap-2">
        {items.map((item) => (
          <li key={itemKey(item)} className="min-w-0 max-w-full">
            <ToggleChip
              n={number(item)}
              pressed={picked.has(itemKey(item))}
              onToggle={() => onToggle(item)}
              title={item.detail ? `${item.title}: ${item.detail}` : item.title}
            >
              <ContextIcon item={item} />
              <span className="min-w-0 truncate">{item.title}</span>
              {isDraft(item) && <span className="shrink-0 text-fg-faint text-xs">draft</span>}
            </ToggleChip>
          </li>
        ))}
      </ul>
    </div>
  );
}
