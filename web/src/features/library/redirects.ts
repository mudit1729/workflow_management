// Where the old library addresses go now: `/lib/<lib-id>` to that item's page in the workspace
// library, `/glossary` to the Glossary page of the workspace library, and `/lib/t` to the first
// team library. Plain async functions, so the router calls them in `beforeLoad` and the tests call
// them without a router.
import { api } from "@/lib/api/client";
import { resolveAddress } from "@/lib/api/library";
import { isItemRef } from "./address";
import { slugify } from "./anchors";

export interface PageTarget {
  alias: string;
  /** Root-relative page path; empty for the library's home. */
  path: string;
  anchor?: string;
}

/** The page of an old `/lib/<lib-id>` address. `undefined` for an id the workspace does not have. */
export async function itemTarget(id: string): Promise<PageTarget | undefined> {
  if (!isItemRef(id)) return undefined;
  const found = await resolveAddress(id);
  return found.ok && found.alias && found.path
    ? { alias: found.alias, path: found.path }
    : undefined;
}

/** The workspace library: the first team library, which the workspace always has. */
export async function workspaceLibrary(): Promise<string | undefined> {
  const libraries = await api.libraries();
  return libraries.find((l) => l.kind === "workspace")?.alias;
}

/**
 * The page of the old `/glossary`. A term in `?q=` (the palette sent one) becomes the heading to
 * open at: each term is a `##` heading of glossary.md, so its anchor is the term's slug.
 */
export async function glossaryTarget(term?: string): Promise<PageTarget | undefined> {
  const alias = await workspaceLibrary();
  if (!alias) return undefined;
  const anchor = term ? slugify(term) : "";
  return { alias, path: "glossary.md", ...(anchor ? { anchor } : {}) };
}
