// What a summary page says about itself, under its title (spec 3): a codebase summary is "of
// a7f905c, 2 commits behind main" with Refresh; a work summary is stale when its group or issue
// changed after it was written, with Refresh or Summarize this group. Nothing for other pages.
import { Chip } from "@/components/ui";
import type { LibraryPage } from "@/lib/api/types";
import { PERSONAL_ALIAS } from "../address";
import { codebaseFacts, RefreshCodebase } from "./CodebasesSection";
import { behindLine, commitsBehind } from "./codebase";
import { useWorkList } from "./use-work";
import { SummarizeButton } from "./WorkSection";
import { summaryState, targetsUnder } from "./work";

const line = "m-0 flex flex-wrap items-center gap-x-2 gap-y-1.5 text-fg-muted text-sm";

function CodebaseBanner({ page }: { page: LibraryPage }) {
  const facts = codebaseFacts(page.frontmatter);
  const behind = facts.repo && facts.commit ? commitsBehind(facts.repo, facts.commit) : undefined;
  const text = behindLine(behind, facts.ref);
  return (
    <p data-wf="SummaryBanner" data-kind="codebase" className={line}>
      <span>
        Summary of <code className="code-inline">{facts.commit.slice(0, 7)}</code>
      </span>
      {text && <Chip tone={behind === 0 ? "success" : "stale"}>{text}</Chip>}
      <RefreshCodebase path={page.path} repo={facts.repo} />
    </p>
  );
}

function WorkBanner({ page }: { page: LibraryPage }) {
  const { data } = useWorkList();
  const target = data?.targets.find((t) => t.path === page.path);
  if (!data || !target) return null;
  const state = summaryState(target);
  const isGroup = target.kind === "group";
  return (
    <p data-wf="SummaryBanner" data-kind={target.kind} data-state={state} className={line}>
      {state === "stale" ? (
        <>
          <Chip tone="stale">Stale</Chip>
          <span>The work changed after this summary was written.</span>
          <SummarizeButton
            target={target}
            below={isGroup ? targetsUnder(data, target.key) : [target]}
            label={isGroup ? "Summarize this group" : "Refresh"}
          />
        </>
      ) : (
        <span>
          This summary matches {isGroup ? `the group ${target.title}` : target.key} as it is now.
        </span>
      )}
    </p>
  );
}

export function SummaryBanner({ page }: { page: LibraryPage }) {
  if (page.alias !== PERSONAL_ALIAS) return null;
  if (page.kind === "codebase") return <CodebaseBanner page={page} />;
  if (page.kind === "issue-summary" || page.kind === "group-summary")
    return <WorkBanner page={page} />;
  return null;
}
