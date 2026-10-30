// Is a team library behind its repo, and read it again. The page footer shows "Update" when the
// branch has a newer commit than the one the library was read at (spec 4.3); the library menu has
// the same action. The check is one GitHub call kept by ETag; for the example library the move is
// simulated with `window.__wf.teams.moveRemote()`.
import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { addLibrary } from "@/lib/api/library";
import type { LibraryInfo } from "@/lib/api/types";
import { rememberCommit } from "./commits";

const github = () => import("@mock/libraries/github");

/** The link that reads a library again: its repo, its ref and its folder. */
export function readLink(library: Pick<LibraryInfo, "url" | "ref" | "root">): string {
  const root = library.root ? `/${library.root}` : "";
  return `${library.url}/tree/${library.ref ?? "HEAD"}${root}`;
}

export interface TeamUpdate {
  /** The branch has a newer commit than the one read. */
  behind: boolean;
  /** The sha of that newer commit. */
  head?: string;
  busy: boolean;
  /** Read the library again at the branch's tip. */
  run: () => Promise<void>;
}

export function useTeamUpdate(library: LibraryInfo | undefined): TeamUpdate {
  const [busy, setBusy] = useState(false);
  const watched =
    library?.kind === "team" && library.access === "public" && !!library.url && !!library.ref;
  const url = library?.url;
  const ref = library?.ref;

  const head = useQuery({
    queryKey: ["team-head", library?.alias, url, ref],
    enabled: watched,
    staleTime: 5 * 60_000,
    retry: false,
    refetchOnWindowFocus: false,
    queryFn: async () => {
      const result = await (await github()).remoteHead(url as string, ref as string);
      return result.ok ? result.value : null;
    },
  });

  // A simulated push on the example repo: ask again at once.
  const refetch = head.refetch;
  useEffect(() => {
    if (!watched) return;
    let dead = false;
    let off: (() => void) | undefined;
    void github().then((gh) => {
      if (!dead) off = gh.onRemoteMoved(() => void refetch());
    });
    return () => {
      dead = true;
      off?.();
    };
  }, [watched, refetch]);

  const tip = head.data?.commit;
  const behind = !!tip && !!library?.commit && !tip.startsWith(library.commit);

  async function run() {
    if (!library?.url || busy) return;
    setBusy(true);
    try {
      const gh = await github();
      const found = await gh.findLibrary(readLink(library));
      if (!found.ok) throw new Error(found.failure.message);
      const choice =
        found.value.choices.find((c) => c.root === (library.root ?? "")) ?? found.value.choices[0];
      if (!choice) throw new Error("The repo no longer has pages to read.");
      const read = await gh.readLibrary(found.value, choice, library.alias);
      if (!read.ok) throw new Error(read.failure.message);
      await addLibrary(read.value.source);
      const { repo } = found.value;
      rememberCommit(library.alias, {
        commit: repo.commit,
        ...(repo.committedAt ? { committedAt: repo.committedAt } : {}),
        ...(repo.message ? { message: repo.message } : {}),
        ...(repo.author ? { author: repo.author } : {}),
      });
      toast.success(`Updated ${library.name}`, {
        description: `Now at ${repo.commit.slice(0, 7)}.`,
      });
    } catch (err) {
      toast.error("Could not update the library", {
        description: err instanceof Error ? err.message : "Try again in a moment.",
      });
    } finally {
      setBusy(false);
    }
  }

  return { behind, ...(tip ? { head: tip } : {}), busy, run };
}
