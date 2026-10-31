// The workspace's own library as a library source (decision L4): its `library/` folder, and
// `glossary.md` as the page "Glossary". It is read from the store's working copy every time, so an
// edit in Files or on disk shows at once. The workspace has no repo manifest, so the source brings
// a small one for the order of its sections.
import { parseLinks } from "@/features/context/links";
import type { LibrarySource } from "@/lib/api/types";
import type { Store } from "../store";
import type { WorkspaceFacts } from "./corpus";

const GLOSSARY = "glossary.md";

/** The alias of the workspace library: the workspace's name, as a link can write it. */
export function workspaceAlias(store: Store): string {
  const name = store.derived.snapshot.config.name;
  return (
    name
      .toLowerCase()
      .replace(/[^a-z0-9_-]+/g, "-")
      .replace(/^-+|-+$/g, "") || "workspace"
  );
}

export function workspaceSource(store: Store): LibrarySource {
  const config = store.derived.snapshot.config;
  const dir = config.library_dir;
  const files: Record<string, string> = {
    "wf-library.toml": [
      `name = "This workspace"`,
      `root = "${dir}"`,
      "[nav]",
      `order = ["playbooks", "patterns", "gotchas", "decisions", "glossary"]`,
      "",
    ].join("\n"),
  };
  const media: LibrarySource["media"] = {};
  for (const path of store.paths()) {
    if (!path.startsWith(`${dir}/`)) continue;
    const text = store.text(path);
    if (text !== undefined) files[path] = text;
  }
  for (const [path, asset] of Object.entries(store.assets()))
    if (path.startsWith(`${dir}/`)) media[path] = asset;

  const origin: Record<string, string> = {};
  const glossary = store.text(GLOSSARY);
  if (glossary !== undefined && files[`${dir}/${GLOSSARY}`] === undefined) {
    files[`${dir}/${GLOSSARY}`] = glossary;
    origin[GLOSSARY] = GLOSSARY;
  }
  return {
    alias: workspaceAlias(store),
    kind: "workspace",
    name: "This workspace",
    description: `What ${config.name} has learned: playbooks, patterns, gotchas and decisions, and its glossary.`,
    root: dir,
    access: "local",
    files,
    media,
    origin,
  };
}

/** What the corpus needs from the issues: their titles and what their `## Links` name. */
export function workspaceFacts(store: Store): WorkspaceFacts {
  const issues = store.derived.snapshot.issues;
  const byId = new Map(issues.map((i) => [i.id, i]));
  return {
    alias: workspaceAlias(store),
    issues: store.world.issues.flatMap((src) => {
      const summary = byId.get(src.goal.id);
      if (!summary) return [];
      const links = parseLinks(src.links)
        .filter(
          (l) =>
            l.kind === "library" || l.kind === "entry" || l.kind === "issue" || l.kind === "page",
        )
        .map((l) => l.target);
      return [
        {
          id: summary.id,
          title: summary.title,
          status: summary.status,
          group_path: summary.group_path,
          links,
        },
      ];
    }),
    cites: Object.fromEntries(
      [...store.derived.library].map(([id, detail]) => [
        id,
        detail.backlinks.map((r) => r.issue ?? r.target),
      ]),
    ),
  };
}

/**
 * A fingerprint of everything the workspace library reads from the store: the library files, the
 * glossary and every goal.md (its Links). It changes exactly when a library page, its media or the
 * set of issues that name it may have changed, so the registry rebuilds and tells the clients only then.
 */
export function workspaceSignature(store: Store): string {
  const dir = store.derived.snapshot.config.library_dir;
  const parts: string[] = [];
  for (const path of store.paths()) {
    if (path.startsWith(`${dir}/`) || path === GLOSSARY || path.endsWith("/goal.md"))
      parts.push(`${path}:${store.pathRev(path) ?? ""}`);
  }
  for (const issue of store.derived.snapshot.issues) parts.push(`${issue.id}:${issue.status}`);
  return parts.join("|");
}
