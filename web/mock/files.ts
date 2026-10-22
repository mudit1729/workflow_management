// The file API of the mock server (a prototype endpoint set beyond contract 1.10, see
// `src/lib/api/client.ts`): list the files of the workspace, read one, write one, delete one.
// The text is the working copy of the store; the findings per file are the ones the issue
// views show, so the Workspace files view and the drawer always agree.
import type { Diagnostic } from "@/gen/types";
import { NotFoundError } from "@/lib/api/error";
import type { WorkspaceFile, WorkspaceFileInfo } from "@/lib/api/types";
import { ISSUE_FILES } from "./md/types";
import type { Store } from "./store";
import { byteLength } from "./util";

const IMAGE = /\.(png|jpe?g|gif|svg|webp)$/i;

export function kindOf(path: string): WorkspaceFileInfo["kind"] {
  if (path.endsWith(".md")) return "md";
  if (path.endsWith(".toml")) return "toml";
  if (IMAGE.test(path)) return "image";
  return "other";
}

/** Findings per file: those of the loader, replaced by the fuller lists the issue views hold. */
function diagnosticsByFile(store: Store): Map<string, Diagnostic[]> {
  const out = new Map<string, Diagnostic[]>(Object.entries(store.source.diagnostics));
  for (const detail of store.derived.details.values()) {
    const dir = detail.summary.path;
    for (const name of ISSUE_FILES) out.set(`${dir}/${name}`, []);
    for (const d of detail.diagnostics) out.get(d.file)?.push(d);
  }
  for (const item of store.derived.library.values()) out.set(item.edit.file, [...item.diagnostics]);
  return out;
}

interface Owners {
  issues: [dir: string, id: string][];
  groups: Map<string, string>;
  library: Map<string, string>;
}

function ownersOf(store: Store): Owners {
  const s = store.source;
  return {
    // Longest folder first, so a nested folder never loses a file to its parent.
    issues: Object.entries(s.issueDirs)
      .map(([id, dir]): [string, string] => [dir, id])
      .sort((a, b) => b[0].length - a[0].length),
    groups: new Map(Object.entries(s.groupDirs).map(([id, dir]) => [`${dir}/_group.md`, id])),
    library: new Map(Object.entries(s.libraryPaths).map(([id, path]) => [path, id])),
  };
}

function infoOf(
  store: Store,
  path: string,
  owners: Owners,
  diags: Map<string, Diagnostic[]>,
): WorkspaceFileInfo {
  const text = store.text(path);
  const list = diags.get(path) ?? [];
  const info: WorkspaceFileInfo = {
    path,
    kind: kindOf(path),
    bytes: text === undefined ? (store.assets()[path]?.bytes ?? 0) : byteLength(text),
    rev: store.pathRev(path) ?? "",
    errors: list.filter((d) => d.severity === "error").length,
    warnings: list.filter((d) => d.severity === "warn").length,
    infos: list.filter((d) => d.severity === "info").length,
  };
  const issue = owners.issues.find(([dir]) => path.startsWith(`${dir}/`));
  if (issue) info.issue = issue[1];
  const group = owners.groups.get(path);
  if (group) info.group = group;
  const library = owners.library.get(path);
  if (library) info.library = library;
  return info;
}

/** Every file of the workspace, sorted by path. */
export function listFiles(store: Store): WorkspaceFileInfo[] {
  const owners = ownersOf(store);
  const diags = diagnosticsByFile(store);
  return store.paths().map((path) => infoOf(store, path, owners, diags));
}

/** One file with its text (or URL, for an image) and its findings. */
export function readFile(store: Store, path: string): WorkspaceFile {
  const text = store.text(path);
  const asset = store.assets()[path];
  if (text === undefined && !asset) throw new NotFoundError(`File ${path}`);
  const diags = diagnosticsByFile(store);
  const info = infoOf(store, path, ownersOf(store), diags);
  return {
    path,
    text: text ?? null,
    ...(asset ? { url: asset.url } : {}),
    rev: info.rev,
    bytes: info.bytes,
    diagnostics: (diags.get(path) ?? []).map((d) => ({ ...d })),
  };
}
