// The redirects of the library routes, as the `beforeLoad` functions the router uses: the old
// `/lib/<lib-id>` and `/glossary` addresses and `/lib?tab=glossary` go to pages of the workspace
// library, and `/lib/t` to its home. They throw TanStack's `redirect`, so a test can run them in a
// small router without the app.
import { redirect } from "@tanstack/react-router";
import {
  glossaryTarget,
  itemTarget,
  type PageTarget,
  workspaceLibrary,
} from "@/features/library/redirects";

/** Send the visitor to a page of a library. */
function toPage(target: PageTarget): never {
  throw redirect({
    to: "/lib/t/$alias/$",
    params: { alias: target.alias, _splat: target.path },
    hash: target.anchor,
    replace: true,
  });
}

/** `/lib/<lib-id>`: the item's page. An id the workspace does not have goes to the Library home. */
export async function redirectLibraryItem(id: string): Promise<never> {
  const target = await itemTarget(id);
  if (target) toPage(target);
  throw redirect({ to: "/lib", replace: true });
}

/** `/glossary`, with `?q=<term>` opening at that term. */
export async function redirectGlossary(term?: string): Promise<never> {
  const target = await glossaryTarget(term);
  if (target) toPage(target);
  throw redirect({ to: "/lib", replace: true });
}

/** `/lib?tab=glossary` was the old address of the glossary; any other `/lib` stays. */
export async function redirectLibraryTab(search: { tab?: string; q?: string }): Promise<void> {
  if (search.tab === "glossary") await redirectGlossary(search.q);
}

/** `/lib/t` has no page of its own: the team libraries open on the workspace's. */
export async function redirectTeams(): Promise<never> {
  const alias = await workspaceLibrary();
  if (alias) throw redirect({ to: "/lib/t/$alias", params: { alias }, replace: true });
  throw redirect({ to: "/lib", replace: true });
}
