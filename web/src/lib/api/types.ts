// Types shared by the client, the mock server and the hooks.
import type { Op, Size } from "@/gen/types";

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
