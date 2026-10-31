// The library's search box and its scope live in the URL (`?q=`, `?scope=`), like the board's
// filter, so a search can be linked and the back button undoes it. The page view (`?view=source`)
// lives there too.
import { useNavigate, useSearch } from "@tanstack/react-router";
import { useCallback, useMemo } from "react";
import type { LibraryScope } from "@/lib/api/types";
import { type LibrarySearch, usePathname } from "@/lib/nav";

type Navigate = (o: {
  to: string;
  search?: unknown;
  hash?: string;
  replace?: boolean;
}) => Promise<void>;

/** The scope a `?scope=` value names: `all`, or the alias of one library. */
export function scopeOf(value: string | undefined): LibraryScope {
  return !value || value === "all" ? "all" : { alias: value };
}

function clean(search: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(search)) if (v !== undefined && v !== "") out[k] = v;
  return out;
}

export interface LibrarySearchState {
  q: string;
  /** `all` or the alias of a library. */
  scope: string;
  scopeValue: LibraryScope;
  view: "source" | undefined;
  setQuery: (q: string | undefined) => void;
  setScope: (scope: string) => void;
  setView: (view: "source" | undefined) => void;
}

export function useLibrarySearchState(): LibrarySearchState {
  const navigate = useNavigate() as unknown as Navigate;
  const raw = useSearch({ strict: false }) as LibrarySearch & Record<string, unknown>;
  const path = usePathname();
  const patch = useCallback(
    (next: Partial<LibrarySearch>) =>
      void navigate({ to: path, search: clean({ ...raw, ...next }), replace: true }),
    [navigate, raw, path],
  );
  const scope = raw.scope || "all";
  return useMemo(
    () => ({
      q: raw.q ?? "",
      scope,
      scopeValue: scopeOf(scope),
      view: raw.view,
      setQuery: (q) => patch({ q }),
      setScope: (next) => patch({ scope: next === "all" ? undefined : next }),
      setView: (view) => patch({ view }),
    }),
    [raw.q, raw.view, scope, patch],
  );
}
