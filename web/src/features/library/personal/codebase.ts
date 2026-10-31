// What the Personal home knows about a codebase summary (spec 3): which repository it is of, the
// commit it was written at, and how far `main` has moved. The count of commits comes from git; the
// bridge would run `git rev-list --count <commit>..origin/main` in its clone. The prototype has no
// git, so it reads the recent history of the fixture repository from a list below. Pure, no React.

/** `https://github.com/acme/app.git` → `acme/app`. */
export function repoSlug(url: string): string {
  return url
    .trim()
    .replace(/^https?:\/\/(www\.)?github\.com\//i, "")
    .replace(/\/+$/, "")
    .replace(/\.git$/i, "");
}

/**
 * The newest commits of `main` of the fixture repository, newest first (`git log --format=%h`).
 * The fixture's codebase summary is written at a7f905c, two commits before the head.
 */
const MAIN: Record<string, string[]> = {
  "mudit1729/workflow_maagement": [
    "f74a83e",
    "d103459",
    "a7f905c",
    "0d1a92f",
    "6a28a04",
    "7d62f37",
    "296102d",
    "375c854",
    "51ce6ee",
    "c02d967",
    "410e468",
    "0abe89a",
    "39a52d0",
    "fb4ada1",
    "c4e979b",
    "c7d47b7",
  ],
};

const logOf = (repo: string) => MAIN[repoSlug(repo).toLowerCase()];

/** The head of `main`, when the history of the repository is known. */
export function repoHead(repo: string): string | undefined {
  return logOf(repo)?.[0];
}

/** How many commits `main` is ahead of `commit`; `undefined` when git cannot say. */
export function commitsBehind(repo: string, commit: string): number | undefined {
  const at = logOf(repo)?.findIndex((c) => c.startsWith(commit.slice(0, 7)));
  return at === undefined || at < 0 ? undefined : at;
}

/** "2 commits behind main", "up to date with main", or nothing when the count is unknown. */
export function behindLine(behind: number | undefined, ref = "main"): string | undefined {
  if (behind === undefined) return undefined;
  if (behind === 0) return `Up to date with ${ref}`;
  return `${behind} ${behind === 1 ? "commit" : "commits"} behind ${ref}`;
}

/**
 * The page of a codebase summary after a refresh that only moved the commit and the time: the two
 * lines of the frontmatter change and the body stays. The prototype uses it for Refresh; an agent
 * would re-read the repository and rewrite the sections too.
 */
export function movedTo(text: string, commit: string, at: string): string {
  const lines = text.split("\n");
  if (lines[0]?.trim() !== "---") return text;
  const end = lines.indexOf("---", 1);
  for (let i = 1; i < (end === -1 ? lines.length : end); i++) {
    if (/^commit:/.test(lines[i] ?? "")) lines[i] = `commit: "${commit}"`;
    else if (/^summarized_at:/.test(lines[i] ?? "")) lines[i] = `summarized_at: ${at}`;
  }
  return lines.join("\n");
}
