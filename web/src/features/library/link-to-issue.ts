// Link a library page to an issue: one bullet under `## Links` of the issue's goal.md, so the
// page enters the issue's context bundle. The text edit is the same one `wf-edit` makes for any
// link (a bullet at the end of the section, a new section after `## Out of scope`, else after the
// success criteria, else at the end); the write goes through the workspace file API.
import { toast } from "sonner";
import { api, isConflictError } from "@/lib/api";
import { writeWorkspaceFile } from "@/lib/api/files";

const oneLine = (s: string) => s.replace(/\s+/g, " ").trim();

/** `- [[platform:runbooks/x.md]] Rotate signing keys` */
export function pageLinkLine(address: string, label: string): string {
  const words = oneLine(label);
  return `- [[${address}]]${words ? ` ${words}` : ""}`;
}

const LINKS = /^##\s+Links\s*$/i;
const OUT_OF_SCOPE = /^##\s+Out of scope\s*$/i;
const CRITERIA = /^##\s+Success criteria\s*$/i;
const SECTION = /^#{1,2}\s/;

/** Index of the last non-blank line of the section that starts at `head`. */
function lastContent(lines: string[], head: number): number {
  let end = lines.findIndex((l, i) => i > head && SECTION.test(l));
  if (end === -1) end = lines.length;
  let at = end - 1;
  while (at > head && (lines[at] ?? "").trim() === "") at--;
  return at;
}

/**
 * The goal.md with `line` added to `## Links`. `undefined` when the section already links the
 * same page (the bullet's `[[target]]` is there). Nothing else in the file moves.
 */
export function withPageLink(goal: string, line: string): string | undefined {
  const lines = goal.split("\n");
  const target = /\[\[([^\]]+)\]\]/.exec(line)?.[1];
  const head = lines.findIndex((l) => LINKS.test(l));
  if (head !== -1) {
    const end = lastContent(lines, head);
    if (target && lines.slice(head + 1, end + 1).some((l) => l.includes(`[[${target}]]`)))
      return undefined;
    if (end === head) lines.splice(head + 1, 0, "", line);
    else lines.splice(end + 1, 0, ...(/^\s*[-*+]\s/.test(lines[end] ?? "") ? [] : [""]), line);
    return lines.join("\n");
  }
  const before = [OUT_OF_SCOPE, CRITERIA]
    .map((re) => lines.findIndex((l) => re.test(l)))
    .find((i) => i !== -1);
  const at = before !== undefined ? lastContent(lines, before) : lastContent(lines, -1);
  lines.splice(at + 1, 0, "", "## Links", "", line);
  return lines.join("\n");
}

export type LinkResult = "added" | "present";

/** Link a page under `## Links` of an issue's goal.md. Resolves `undefined` after a toast when it failed. */
export async function linkPageToIssue(args: {
  /** Workspace-relative folder of the issue (`IssueSummary.path`). */
  issuePath: string;
  address: string;
  label: string;
}): Promise<LinkResult | undefined> {
  const path = `${args.issuePath}/goal.md`;
  try {
    const file = await api.file(path);
    if (file.text === null) throw new Error("goal.md is not a text file.");
    const next = withPageLink(file.text, pageLinkLine(args.address, args.label));
    if (next === undefined) return "present";
    const saved = await writeWorkspaceFile({ path, text: next, base_rev: file.rev });
    return saved ? "added" : undefined;
  } catch (err) {
    toast.error(isConflictError(err) ? "goal.md changed. Try again." : "Could not link the page", {
      description: err instanceof Error ? err.message : undefined,
    });
    return undefined;
  }
}
