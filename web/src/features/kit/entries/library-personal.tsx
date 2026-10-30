// Kit entries for the personal library: the home and its three sections (research topics,
// codebases, work), the cards, the summary banner on a summary page, and the first-visit setup.
// The data is the fixture in web/mock/personal; the Work section shows the sample world's groups
// and issues because the kit holds the sample while it is open.
import type { ReactNode } from "react";
import {
  CodebaseCardView,
  type CodebaseFacts,
  CodebasesSection,
} from "@/features/library/personal/CodebasesSection";
import { PersonalHome } from "@/features/library/personal/PersonalHome";
import { PersonalSetup } from "@/features/library/personal/PersonalSetup";
import { SectionHeader } from "@/features/library/personal/SectionHeader";
import { SummaryBanner } from "@/features/library/personal/SummaryBanner";
import { type Topic, TopicCard, TopicsSection } from "@/features/library/personal/TopicsSection";
import { useWorkList } from "@/features/library/personal/use-work";
import { WorkSectionView } from "@/features/library/personal/WorkSection";
import type { WorkList } from "@/features/library/personal/work";
import { useLibraryPage, useLibraryTree } from "@/lib/api";
import type { LibraryPage, LibraryTree, LibraryTreeNode } from "@/lib/api/types";
import { entry, type KitEntry, Loading, Sandbox, V } from "../kit-ui";

const SRC = "src/features/library/personal";

const CODEBASE = "codebases/mudit1729-workflow_management.md";
const STALE_ISSUE = "work/wf/wf/web/wf-3k9x2.md";
const CURRENT_ISSUE = "work/wf/wf/web/wf-h2tb7.md";
const STALE_GROUP = "work/wf/wf/web/_group.md";

/** The personal library's tree, once it has loaded. */
function WithTree({ children }: { children: (tree: LibraryTree) => ReactNode }) {
  const tree = useLibraryTree("me").data;
  if (!tree) return <Loading height={120} />;
  return <>{children(tree)}</>;
}

/** A page of the personal library, once it has loaded. */
function WithPage({
  path,
  children,
}: {
  path: string;
  children: (page: LibraryPage) => ReactNode;
}) {
  const page = useLibraryPage("me", path).data;
  if (!page) return <Loading height={48} />;
  return <>{children(page)}</>;
}

/** The scrolling document column the home sits in, as WikiView gives it. */
function Column({ children }: { children: ReactNode }) {
  return <div className="h-full overflow-y-auto px-8 py-6">{children}</div>;
}

// ---------------------------------------------------------------- PersonalHome

function PersonalHomeBody() {
  return (
    <>
      <V
        label="Topics, Codebases and Work · the sample world is loaded"
        note="Research you are doing, the codebases you work in, and what your work adds up to by group and status. Everything on it is a page of your private repo."
        fill
        height={820}
      >
        <Sandbox quiet path="/lib/me">
          <Column>
            <PersonalHome />
          </Column>
        </Sandbox>
      </V>
      <V label="phone" width={390} height={760}>
        <Sandbox quiet path="/lib/me">
          <Column>
            <PersonalHome />
          </Column>
        </Sandbox>
      </V>
    </>
  );
}

// ---------------------------------------------------------------- TopicsSection, TopicCard

const node = (path: string, title: string): LibraryTreeNode => ({ type: "page", path, title });

const topic = (over: Partial<Topic> & Pick<Topic, "node">): Topic => ({
  notes: 2,
  status: "active",
  question: "",
  updated: "2026-10-28",
  ...over,
});

function TopicsBody() {
  return (
    <>
      <V
        label="the section"
        note="Cards by status: active first, then paused, then done. New topic starts a page from a template."
        width={760}
      >
        <Sandbox quiet path="/lib/me">
          <WithTree>{(tree) => <TopicsSection tree={tree} />}</WithTree>
        </Sandbox>
      </V>
      <V label="a card for each status" width={760}>
        <Sandbox quiet path="/lib/me">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <TopicCard
              topic={topic({
                node: node("topics/a/index.md", "Agent-readable issue context"),
                question: "How much context does an agent need to resume an issue cold?",
              })}
            />
            <TopicCard
              topic={topic({
                node: node("topics/b/index.md", "Diagrams in specs"),
                status: "paused",
                question: "Does a diagram beat a paragraph for architecture?",
                notes: 1,
              })}
            />
            <TopicCard
              topic={topic({
                node: node("topics/c/index.md", "Live board updates without polling"),
                status: "done",
                notes: 4,
              })}
            />
          </div>
        </Sandbox>
      </V>
    </>
  );
}

// ---------------------------------------------------------------- CodebasesSection

const facts = (over: Partial<CodebaseFacts> = {}): CodebaseFacts => ({
  repo: "https://github.com/mudit1729/workflow_maagement",
  ref: "main",
  commit: "a7f905c",
  at: "2026-10-30T15:10+05:30",
  by: "codex",
  ...over,
});

function CodebasesBody() {
  const card = node(CODEBASE, "workflow_management");
  return (
    <>
      <V label="the section" width={760}>
        <Sandbox quiet path="/lib/me">
          <WithTree>{(tree) => <CodebasesSection tree={tree} />}</WithTree>
        </Sandbox>
      </V>
      <V
        label="a card · behind main"
        note="Stale-yellow says the code moved on. Refresh asks the agent to read the repo again."
        width={360}
      >
        <Sandbox quiet path="/lib/me">
          <CodebaseCardView node={card} facts={facts()} />
        </Sandbox>
      </V>
      <V label="a card · up to date" width={360}>
        <Sandbox quiet path="/lib/me">
          <CodebaseCardView node={card} facts={facts({ commit: "f74a83e" })} />
        </Sandbox>
      </V>
      <V label="a card · the repo's history is not known" width={360}>
        <Sandbox quiet path="/lib/me">
          <CodebaseCardView
            node={node("codebases/acme-api.md", "acme api")}
            facts={facts({
              repo: "https://github.com/acme/api",
              commit: "9c1d2e3",
              by: "claude-opus",
            })}
          />
        </Sandbox>
      </V>
    </>
  );
}

// ---------------------------------------------------------------- WorkSection

function PopulatedWork() {
  const { data } = useWorkList();
  return <WorkSectionView data={data} />;
}

const EMPTY: WorkList = { workspace: "wf", targets: [] };

function WorkBody() {
  return (
    <>
      <V
        label="by group, then by status · stale summaries say so"
        note="Each group is a block with its issues under their status. Stale means the issue or a group above it changed after the summary was written."
        fill
        height={760}
      >
        <Sandbox quiet path="/lib/me">
          <Column>
            <PopulatedWork />
          </Column>
        </Sandbox>
      </V>
      <V label="a workspace with no issues" width={760}>
        <Sandbox quiet path="/lib/me">
          <WorkSectionView data={EMPTY} />
        </Sandbox>
      </V>
      <V label="reading the workspace" width={760}>
        <Sandbox quiet path="/lib/me">
          <WorkSectionView />
        </Sandbox>
      </V>
      <V label="a build that talks to wf serve" width={760}>
        <Sandbox quiet path="/lib/me">
          <WorkSectionView unavailable />
        </Sandbox>
      </V>
    </>
  );
}

// ---------------------------------------------------------------- SummaryBanner

function BannerBody() {
  const rows: { label: string; path: string; note?: string }[] = [
    {
      label: "a codebase summary",
      path: CODEBASE,
      note: "The commit it was written at, how far main moved, and Refresh.",
    },
    { label: "an issue summary that is stale", path: STALE_ISSUE },
    { label: "an issue summary that matches the issue", path: CURRENT_ISSUE },
    {
      label: "a group summary that is stale",
      path: STALE_GROUP,
      note: "Summarize this group refreshes its issues first.",
    },
  ];
  return (
    <>
      {rows.map((r) => (
        <V key={r.path} label={r.label} note={r.note} width={720}>
          <Sandbox quiet path={`/lib/me/${r.path}`}>
            <WithPage path={r.path}>{(page) => <SummaryBanner page={page} />}</WithPage>
          </Sandbox>
        </V>
      ))}
    </>
  );
}

// ---------------------------------------------------------------- PersonalSetup

function SetupBody() {
  return (
    <>
      <V
        label="the first visit"
        note="Two buttons: create the private repo, or use one you have. The link field appears only after the second."
        width={560}
        height={560}
      >
        <Sandbox quiet path="/lib/me">
          <div className="h-full overflow-y-auto px-6">
            <PersonalSetup />
          </div>
        </Sandbox>
      </V>
      <V label="a section header" width={560}>
        <SectionHeader
          id="kit-section"
          title="Research topics"
          count={2}
          hint="What you are finding out, one page per question."
        />
      </V>
    </>
  );
}

export const libraryPersonalEntries: KitEntry[] = [
  entry(
    "Library · Personal",
    "PersonalHome",
    `${SRC}/PersonalHome.tsx`,
    "Your own library opens on what you are researching, the codebases you work in and what your work adds up to, so it is the one place to pick up where you left off.",
    PersonalHomeBody,
  ),
  entry(
    "Library · Personal",
    "TopicsSection",
    `${SRC}/TopicsSection.tsx`,
    "A research topic is a question with a status and its notes, shown as a card so the open questions are visible at a glance.",
    TopicsBody,
  ),
  entry(
    "Library · Personal",
    "CodebasesSection",
    `${SRC}/CodebasesSection.tsx`,
    "A codebase summary says which commit it describes and how far the branch has moved, so you know when to trust it and when to refresh it.",
    CodebasesBody,
  ),
  entry(
    "Library · Personal",
    "WorkSection",
    `${SRC}/WorkSection.tsx`,
    "Summaries of your work are laid out like the group tree and ordered by status, and a stale one is marked where it is, with the button that fixes it.",
    WorkBody,
  ),
  entry(
    "Library · Personal",
    "SummaryBanner",
    `${SRC}/SummaryBanner.tsx`,
    "A summary page says whether it still matches the code or the issue, under its title, with the one button that brings it up to date.",
    BannerBody,
  ),
  entry(
    "Library · Personal",
    "PersonalSetup",
    `${SRC}/PersonalSetup.tsx`,
    "Before there is a personal library, the page offers the two ways to get one and nothing else.",
    SetupBody,
  ),
];
