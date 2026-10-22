// Types shared by the client, the mock server and the hooks.
import type { Diagnostic, Op, Size } from "@/gen/types";

/** Where `search` looks. `all` mixes every kind of hit. */
export type SearchScope = "all" | "issues" | "entries" | "docs" | "library" | "terms";

/** `new_issue` also carries the size picked in the dialog (the generated type predates it). */
export type NewIssueOp = Extract<Op, { op: "new_issue" }> & { size?: Size };

/** Every op the client may send. */
export type WfOp = Exclude<Op, { op: "new_issue" }> | NewIssueOp;

/** An op without its tag and revision: what a write hook takes. */
export type OpArgs<N extends Op["op"]> = Omit<Extract<WfOp, { op: N }>, "op" | "base_rev"> & {
  base_rev?: string;
};

// ---------------------------------------------------------------- workspace files
// Prototype endpoints beyond contract 1.10: `GET /api/files`, `GET|PUT|DELETE /api/files/{path}`.
// The Workdatabase · Files view reads and edits the markdown the board is built from.

/** One file of the workspace, as the file tree lists it. */
export interface WorkspaceFileInfo {
  path: string;
  kind: "md" | "toml" | "image" | "other";
  bytes: number;
  /** Content hash: changes whenever the text does. */
  rev: string;
  /** The issue whose folder holds the file. */
  issue?: string;
  /** The group this file (`_group.md`) describes. */
  group?: string;
  /** The library item this file holds. */
  library?: string;
  /** Lint findings in this file, by severity. */
  errors: number;
  warnings: number;
  infos: number;
}

/** One file with its content. `text` is null for a binary file (see `url`). */
export interface WorkspaceFile {
  path: string;
  text: string | null;
  /** Where an image is served. */
  url?: string;
  rev: string;
  bytes: number;
  /** Findings of this file, with line numbers. */
  diagnostics: Diagnostic[];
}
