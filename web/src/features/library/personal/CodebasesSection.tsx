// Codebase summaries (spec 3): a card for each page of `codebases/`. It says which repository and
// commit the summary is of and how far `main` has moved, and offers Refresh, which asks the
// connected agent to run `summarizing-codebase`.
import { GitCommitHorizontal, Loader2, RefreshCw } from "lucide-react";
import { AuthorChip, EmptyState, RelativeTime } from "@/components/common";
import { Button, Chip } from "@/components/ui";
import { useLibraryPage } from "@/lib/api";
import type { LibraryTree, LibraryTreeNode } from "@/lib/api/types";
import { cn } from "@/lib/cn";
import { libraryHref, useOpenPage } from "@/lib/nav";
import { PERSONAL_ALIAS } from "../address";
import { asTimestamp } from "../page-text";
import { behindLine, commitsBehind, repoSlug } from "./codebase";
import { SectionHeader } from "./SectionHeader";
import { summarize, useSummarizing } from "./summarize";

const ICON = { size: 14, strokeWidth: 1.75 } as const;

/** The codebase pages of the tree: the pages of `codebases/` that are not its own page. */
export function codebasesOf(tree: LibraryTree | undefined): LibraryTreeNode[] {
  const folder = tree?.root.children?.find((n) => n.type === "section" && n.path === "codebases");
  return (folder?.children ?? []).filter((n) => n.type === "page");
}

const str = (v: unknown) => (typeof v === "string" ? v : typeof v === "number" ? String(v) : "");

/** What a codebase page says about itself. */
export interface CodebaseFacts {
  repo: string;
  ref: string;
  commit: string;
  at: string;
  by: string;
}

export function codebaseFacts(frontmatter: Record<string, unknown> | undefined): CodebaseFacts {
  const f = frontmatter ?? {};
  return {
    repo: str(f.repo),
    ref: str(f.ref) || "main",
    commit: str(f.commit),
    at: str(f.summarized_at),
    by: str(f.summarized_by).replace(/^@/, ""),
  };
}

/** The Refresh button of a codebase summary: it reads "Summarizing…" while the page is written. */
export function RefreshCodebase({
  path,
  repo,
  className,
}: {
  path: string;
  repo: string;
  className?: string;
}) {
  const busy = useSummarizing(path);
  return (
    <Button
      variant="secondary"
      size="sm"
      disabled={busy}
      className={className}
      onClick={() => void summarize({ kind: "codebase", path, repo })}
    >
      {busy ? (
        <Loader2 aria-hidden {...ICON} className="animate-spin motion-reduce:animate-none" />
      ) : (
        <RefreshCw aria-hidden {...ICON} />
      )}
      {busy ? "Summarizing…" : "Refresh"}
    </Button>
  );
}

function CodebaseCard({ node }: { node: LibraryTreeNode }) {
  const page = useLibraryPage(PERSONAL_ALIAS, node.path).data;
  return <CodebaseCardView node={node} facts={codebaseFacts(page?.frontmatter)} />;
}

/** The card of one codebase summary: the repo, the commit, how far `main` moved, and Refresh. */
export function CodebaseCardView({ node, facts }: { node: LibraryTreeNode; facts: CodebaseFacts }) {
  const open = useOpenPage();
  const behind = facts.repo && facts.commit ? commitsBehind(facts.repo, facts.commit) : undefined;
  const line = behindLine(behind, facts.ref);
  return (
    <article
      data-wf="CodebaseCard"
      data-behind={behind}
      className="relative flex min-w-0 flex-col gap-2 rounded-lg border border-border bg-bg p-4 transition-colors duration-100 ease-wf focus-within:border-border-strong hover:border-border-strong hover:bg-subtle"
    >
      <p className="m-0 flex min-w-0 items-center gap-1.5 text-fg-muted text-sm">
        <GitCommitHorizontal aria-hidden {...ICON} className="shrink-0" />
        <span className="min-w-0 truncate font-mono text-xs">
          {facts.repo ? repoSlug(facts.repo) : node.path}
        </span>
      </p>
      <h3 className="m-0 min-w-0 font-semibold text-fg text-md leading-snug">
        <a
          href={libraryHref(PERSONAL_ALIAS, node.path)}
          onClick={(e) => {
            if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
            e.preventDefault();
            open({ alias: PERSONAL_ALIAS, path: node.path });
          }}
          className="after:absolute after:inset-0 after:rounded-lg"
        >
          {node.title}
        </a>
      </h3>
      <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
        {facts.commit && <Chip className="font-mono">{facts.commit.slice(0, 7)}</Chip>}
        {line && (
          <Chip
            tone={behind === 0 ? "success" : "stale"}
            title={`The summary is of ${facts.commit}`}
          >
            {line}
          </Chip>
        )}
      </div>
      <div className="mt-auto flex min-w-0 items-end justify-between gap-2 pt-1">
        <p className="m-0 min-w-0 text-fg-faint text-sm leading-snug">
          {facts.at ? (
            <>
              Summarized <RelativeTime ts={asTimestamp(facts.at)} long />
            </>
          ) : (
            "Not summarized yet"
          )}
          {facts.by && (
            <>
              {" by "}
              <AuthorChip handle={facts.by} variant="text" />
            </>
          )}
        </p>
        <RefreshCodebase
          path={node.path}
          repo={facts.repo}
          className={cn("relative z-[1]", !facts.repo && "hidden")}
        />
      </div>
    </article>
  );
}

export function CodebasesSection({ tree }: { tree: LibraryTree | undefined }) {
  const nodes = codebasesOf(tree);
  return (
    <section
      data-wf="CodebasesSection"
      aria-labelledby="personal-codebases"
      className="flex flex-col gap-3"
    >
      <SectionHeader
        id="personal-codebases"
        title="Codebases"
        count={nodes.length || undefined}
        hint="The repositories you work in, summarized: what is where, how to run it, where to start."
      />
      {nodes.length === 0 ? (
        <EmptyState
          compact
          title="No codebase summaries yet"
          hint="A summary lets an agent that meets the repository cold start in the right file."
          skill="summarizing-codebase"
        />
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {nodes.map((n) => (
            <CodebaseCard key={n.path} node={n} />
          ))}
        </div>
      )}
    </section>
  );
}
