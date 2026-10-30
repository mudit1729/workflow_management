// What GitHub said about the commit a team library was read at: when it was made, its message and
// who made it. The page footer shows "a1b2c3d · 2 days ago" from it. The library model keeps only
// the short sha (`LibraryInfo.commit`), so the facts are kept here, by alias, for the life of the page.
// (A library added in an earlier session is read again, and its facts come back with it.)

export interface CommitFacts {
  /** The full sha. */
  commit: string;
  committedAt?: string;
  message?: string;
  author?: string;
}

const facts = new Map<string, CommitFacts>();

/** Remember the commit a library was read at. */
export function rememberCommit(alias: string, f: CommitFacts): void {
  facts.set(alias, f);
}

/** The commit of a library, if this page read it. */
export function commitFacts(alias: string): CommitFacts | undefined {
  return facts.get(alias);
}

/** Forget a library that was removed. */
export function forgetCommit(alias: string): void {
  facts.delete(alias);
}
