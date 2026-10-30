// The home of the personal library (spec 3): its three sections, the first-visit screen, the
// Work tree with its stale marks, and what Refresh and Summarize do with and without an agent.
// (The test environment has no DOM, so the parts render to markup inside a router.)
import { QueryClientProvider } from "@tanstack/react-query";
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  RouterProvider,
} from "@tanstack/react-router";
import type { ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { TooltipProvider } from "@/components/ui";
import { queryClient } from "@/lib/api";
import { loadMock } from "@/lib/api/mock-bridge";
import type { LibraryTree, LibraryTreeNode } from "@/lib/api/types";
import { CodebaseCardView, codebaseFacts, codebasesOf } from "./CodebasesSection";
import { behindLine, commitsBehind, movedTo, repoHead, repoSlug } from "./codebase";
import { PersonalHome } from "./PersonalHome";
import { PersonalSetup } from "./PersonalSetup";
import { parseRepo, usePersonalSetup } from "./setup";
import { isSummarizing, setPersonalAgent, summarize } from "./summarize";
import {
  newTopicPath,
  newTopicText,
  readTopic,
  sortTopics,
  TopicCard,
  topicsOf,
} from "./TopicsSection";
import { WorkSectionView } from "./WorkSection";
import {
  needsLine,
  summaryState,
  targetsBelow,
  targetsUnder,
  type WorkList,
  type WorkTarget,
  workTree,
} from "./work";

async function render(node: ReactElement): Promise<string> {
  const root = createRootRoute({ component: () => node });
  const router = createRouter({
    routeTree: root.addChildren([createRoute({ getParentRoute: () => root, path: "/" })]),
    history: createMemoryHistory({ initialEntries: ["/"] }),
  });
  await router.load();
  return renderToStaticMarkup(
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <RouterProvider router={router} />
      </TooltipProvider>
    </QueryClientProvider>,
  );
}

// ---------------------------------------------------------------- the trees

const section = (path: string, children: LibraryTreeNode[], extra = {}): LibraryTreeNode => ({
  type: "section",
  path,
  title: path.split("/").pop() ?? path,
  count: children.length,
  children,
  ...extra,
});
const page = (path: string, title: string): LibraryTreeNode => ({ type: "page", path, title });

const TREE: LibraryTree = {
  alias: "me",
  home: null,
  pages: [],
  others: [],
  root: section("", [
    section(
      "topics",
      [
        section(
          "topics/a",
          [
            page("topics/a/index.md", "A"),
            page("topics/a/n1.md", "N1"),
            page("topics/a/n2.md", "N2"),
          ],
          { title: "Topic A", page: "topics/a/index.md", count: 3 },
        ),
        section("topics/loose", [page("topics/loose/x.md", "X")], { title: "No index page" }),
        // A topic with no notes yet is a folder of one page: the tree shows the page.
        page("topics/fresh/index.md", "Fresh"),
      ],
      { title: "Research topics", page: "topics/index.md" },
    ),
    section("codebases", [page("codebases/o-r.md", "r"), page("codebases/o-q.md", "q")]),
  ]),
};

describe("the topics", () => {
  it("are the folders of topics/ that have an index page", () => {
    expect(topicsOf(TREE).map((n) => n.path)).toEqual(["topics/a", "topics/fresh/index.md"]);
    expect(topicsOf(undefined)).toEqual([]);
  });

  it("read the question, status and date from the frontmatter, and count the notes", () => {
    const node = topicsOf(TREE)[0] as LibraryTreeNode;
    const topic = readTopic(node, {
      frontmatter: { status: "paused", question: " Why? ", updated: "2026-10-01" },
      updated: "2026-10-01",
    } as never);
    expect(topic).toMatchObject({
      notes: 2,
      status: "paused",
      question: "Why?",
      updated: "2026-10-01",
    });
    expect(readTopic(page("topics/fresh/index.md", "Fresh"), undefined).notes).toBe(0);
    // A page that did not load, or a status nobody knows: active, no question.
    expect(readTopic(node, undefined)).toMatchObject({ status: "active", question: "", notes: 2 });
    expect(readTopic(node, { frontmatter: { status: "maybe" } } as never).status).toBe("active");
  });

  it("are shown active first, then paused, then done, the newest first within a status", () => {
    const node = (title: string) => ({ type: "section", path: title, title }) as LibraryTreeNode;
    const t = (title: string, status: string, updated: string) =>
      readTopic(node(title), { frontmatter: { status }, updated } as never);
    const order = sortTopics([
      t("done new", "done", "2026-10-30"),
      t("active old", "active", "2026-10-01"),
      t("paused", "paused", "2026-10-29"),
      t("active new", "active", "2026-10-20"),
    ]).map((x) => x.node.title);
    expect(order).toEqual(["active new", "active old", "paused", "done new"]);
  });

  it("draw a card with the status, the question, the notes and when it was updated", async () => {
    const node = topicsOf(TREE)[0] as LibraryTreeNode;
    const html = await render(
      <TopicCard
        topic={readTopic(node, {
          frontmatter: { status: "active", question: "How much context?" },
          updated: "2026-10-30",
        } as never)}
      />,
    );
    expect(html).toContain('data-wf="TopicCard"');
    expect(html).toContain("Active");
    expect(html).toContain("How much context?");
    expect(html).toContain("2 notes");
    expect(html).toContain("Updated");
    expect(html).toContain("/lib/me/topics/a/index.md");
    const bare = await render(<TopicCard topic={readTopic(node, undefined)} />);
    expect(bare).toContain("No question yet.");
  });

  it("start from a template with the sections of the spec, at a path that is free", () => {
    const text = newTopicText("Rate limits: what works?", "2026-10-30");
    expect(text).toContain('title: "Rate limits: what works?"');
    expect(text).toContain("kind: topic");
    expect(text).toContain("status: active");
    expect(text.match(/^## .+$/gm)).toEqual([
      "## Summary",
      "## Findings",
      "## Open questions",
      "## Notes",
    ]);
    expect(newTopicPath("Rate limits", new Set())).toBe("topics/rate-limits/index.md");
    expect(newTopicPath("Rate limits", new Set(["rate-limits"]))).toBe(
      "topics/rate-limits-2/index.md",
    );
    expect(newTopicPath("???", new Set())).toBe("topics/topic/index.md");
  });
});

describe("the codebases", () => {
  it("are the pages of codebases/", () => {
    expect(codebasesOf(TREE).map((n) => n.path)).toEqual(["codebases/o-r.md", "codebases/o-q.md"]);
  });

  it("know how far main has moved from git", () => {
    expect(repoSlug("https://github.com/Mudit1729/workflow_maagement.git/")).toBe(
      "Mudit1729/workflow_maagement",
    );
    const repo = "https://github.com/mudit1729/workflow_maagement";
    expect(repoHead(repo)).toBe("f74a83e");
    expect(commitsBehind(repo, "a7f905c")).toBe(2);
    expect(commitsBehind(repo, "f74a83e")).toBe(0);
    expect(commitsBehind(repo, "1234567")).toBeUndefined();
    expect(commitsBehind("https://github.com/someone/else", "a7f905c")).toBeUndefined();
    expect(behindLine(2)).toBe("2 commits behind main");
    expect(behindLine(1)).toBe("1 commit behind main");
    expect(behindLine(0)).toBe("Up to date with main");
    expect(behindLine(undefined)).toBeUndefined();
  });

  it("move the commit and the time of a page and keep everything else", () => {
    const text =
      '---\ntitle: x\ncommit: "a7f905c"\nsummarized_at: 2026-10-01T10:00+05:30\n---\n\ncommit: "keep"\n';
    expect(movedTo(text, "f74a83e", "2026-10-30T16:00+05:30")).toBe(
      '---\ntitle: x\ncommit: "f74a83e"\nsummarized_at: 2026-10-30T16:00+05:30\n---\n\ncommit: "keep"\n',
    );
    expect(movedTo("no frontmatter", "f74a83e", "now")).toBe("no frontmatter");
  });

  it("draw a card with the repo, the commit, how far main moved and Refresh", async () => {
    const facts = codebaseFacts({
      repo: "https://github.com/mudit1729/workflow_maagement",
      ref: "main",
      commit: "a7f905c",
      summarized_at: "2026-10-30T16:05+05:30",
      summarized_by: "@claude-sonnet",
    });
    expect(facts).toMatchObject({ commit: "a7f905c", by: "claude-sonnet", ref: "main" });
    const html = await render(
      <CodebaseCardView node={page("codebases/o-r.md", "workflow_management")} facts={facts} />,
    );
    expect(html).toContain("mudit1729/workflow_maagement");
    expect(html).toContain("a7f905c");
    expect(html).toContain("2 commits behind main");
    expect(html).toContain("Summarized");
    expect(html).toContain("Refresh");
    expect(html).toContain('data-behind="2"');
  });
});

// ---------------------------------------------------------------- the work

const issue = (
  key: string,
  status: WorkTarget["status"],
  parent: string,
  over: Partial<WorkTarget> = {},
): WorkTarget => ({
  kind: "issue",
  key,
  title: `Issue ${key}`,
  path: `work/wf/${parent}/${key}.md`,
  parent,
  status,
  rev: "aaaaaaa",
  summary: { rev: "aaaaaaa", summarizedAt: "2026-10-30T16:20+05:30" },
  ...over,
});
const group = (key: string, parent: string, over: Partial<WorkTarget> = {}): WorkTarget => ({
  kind: "group",
  key,
  title: key.split("/").pop() ?? key,
  path: `work/wf/${key}/_group.md`,
  parent,
  issues: 3,
  rev: "bbbbbbb",
  summary: { rev: "bbbbbbb", summarizedAt: "2026-10-30T16:20+05:30" },
  ...over,
});

const LIST: WorkList = {
  workspace: "wf",
  targets: [
    group("wf", ""),
    issue("wf-1", "done", "wf"),
    issue("wf-2", "in_progress", "wf", { summary: { rev: "stale00" } }),
    issue("wf-3", "review", "wf", { summary: undefined }),
    group("wf/web", "wf", { summary: { rev: "old0000" } }),
    issue("wf-4", "backlog", "wf/web"),
    group("platform", "", { issues: 0, summary: undefined }),
    issue("wf-5", "planned", ""),
  ],
};

describe("the work tree", () => {
  it("nests the groups, puts the issues under their status in the order of the work", () => {
    const tree = workTree(LIST);
    expect(tree.groups.map((g) => g.target.key)).toEqual(["wf", "platform"]);
    expect(tree.groups[0]?.groups.map((g) => g.target.key)).toEqual(["wf/web"]);
    expect(tree.groups[0]?.byStatus.map((b) => b.status)).toEqual([
      "in_progress",
      "review",
      "done",
    ]);
    expect(tree.loose.map((i) => i.key)).toEqual(["wf-5"]);
  });

  it("counts what is stale and what has no summary, below each group", () => {
    const [wf, platform] = workTree(LIST).groups;
    // Stale: wf-2, wf/web. Not summarized: wf-3.
    expect(wf).toMatchObject({ stale: 2, missing: 1 });
    expect(wf?.groups[0]).toMatchObject({ stale: 1, missing: 0 });
    expect(platform).toMatchObject({ stale: 0, missing: 1 });
    expect(needsLine(2, 1)).toBe("2 stale · 1 not summarized");
    expect(needsLine(0, 0)).toBe("");
  });

  it("knows a summary is stale when its rev is not the rev of the folder", () => {
    const states = LIST.targets.map((t) => summaryState(t));
    expect(states).toEqual([
      "current",
      "current",
      "stale",
      "none",
      "stale",
      "current",
      "none",
      "current",
    ]);
  });

  it("lists the targets of a run: issues, then the groups below deepest first, then the group", () => {
    const wf = workTree(LIST).groups[0];
    expect(wf && targetsBelow(wf).map((t) => t.key)).toEqual([
      "wf-4",
      "wf/web",
      "wf-2",
      "wf-3",
      "wf-1",
      "wf",
    ]);
    expect(targetsUnder(LIST, "wf/web").map((t) => t.key)).toEqual(["wf-4", "wf/web"]);
    expect(targetsUnder(LIST, "nope")).toEqual([]);
  });
});

describe("the Work section", () => {
  it("draws the groups with their issues under a status, and a button for each group", async () => {
    const html = await render(<WorkSectionView data={LIST} />);
    expect(html).toContain('data-wf="WorkSection"');
    expect(html.match(/Summarize this group/g)).toHaveLength(3);
    // Statuses are headings in the order of the work.
    expect(html.indexOf("In progress")).toBeLessThan(html.indexOf("Review"));
    expect(html.indexOf("Review")).toBeLessThan(html.indexOf("Done"));
    expect(html).toContain("Issue wf-1");
  });

  it("marks a stale summary and offers Refresh; a missing one offers Summarize", async () => {
    const html = await render(<WorkSectionView data={LIST} />);
    expect(html).toContain('data-state="stale"');
    expect(html).toContain("Stale");
    expect(html).toContain("Refresh");
    expect(html).toContain("Not summarized");
    expect(html).toContain("Summarize</button>");
    expect(html).toContain("2 stale · 1 not summarized");
    // A current issue has neither button: it shows when it was summarized.
    const current = html.split('data-wf="WorkIssueRow"').find((r) => r.includes("Issue wf-1"));
    expect(current).toBeDefined();
    expect(current).not.toContain("Refresh");
  });

  it("links to a summary page only when there is one", async () => {
    const html = await render(<WorkSectionView data={LIST} />);
    expect(html).toContain("/lib/me/work/wf/wf/wf-1.md");
    expect(html).not.toContain("/lib/me/work/wf/wf/wf-3.md");
  });

  it("says so when the workspace has no issues, and names the skill", async () => {
    const empty: WorkList = { workspace: "wf", targets: [group("wf", "", { issues: 0 })] };
    const html = await render(<WorkSectionView data={empty} />);
    expect(html).toContain("No work to summarize yet");
    expect(html).toContain("wf has no issues");
    expect(html).toContain("summarizing-work");
    expect(html).not.toContain("Summarize this group");
  });

  it("says it is reading, or that this build cannot list summaries", async () => {
    expect(await render(<WorkSectionView />)).toContain("Reading the workspace");
    expect(await render(<WorkSectionView unavailable />)).toContain(
      "Work summaries need the daemon",
    );
  });
});

// ---------------------------------------------------------------- the first visit

describe("the first visit", () => {
  afterEach(() => usePersonalSetup.setState({ ready: true, repo: undefined }));

  it("reads a repo from a link in the forms of spec 4.1, or says nothing", () => {
    expect(parseRepo("https://github.com/acme/notes")).toBe("acme/notes");
    expect(parseRepo("https://www.github.com/acme/notes.git/")).toBe("acme/notes");
    expect(parseRepo("git@github.com:acme/notes.git")).toBe("acme/notes");
    expect(parseRepo(" acme/notes ")).toBe("acme/notes");
    expect(parseRepo("https://gitlab.com/acme/notes")).toBeUndefined();
    expect(parseRepo("notes")).toBeUndefined();
    expect(parseRepo("")).toBeUndefined();
  });

  it("offers two buttons, create first, and says that the prototype only simulates", async () => {
    const html = await render(<PersonalSetup />);
    expect(html).toContain('data-wf="PersonalSetup"');
    expect(html).toMatch(/Create github\.com\/\w+\/wf-library \(private\)/);
    expect(html).toContain("Use a repo I already have");
    expect(html.indexOf("Create github.com")).toBeLessThan(
      html.indexOf("Use a repo I already have"),
    );
    expect(html).toContain("Prototype");
    // Typing waits until the person asks for it.
    expect(html).not.toContain("<input");
  });

  it("is shown until the library is set up; a reset brings it back and setting up hides it", () => {
    // (The server render of a store reads its first state, so the flag is checked on the store.)
    const flag = () => usePersonalSetup.getState().ready;
    expect(flag()).toBe(true);
    usePersonalSetup.getState().reset();
    expect(flag()).toBe(false);
    usePersonalSetup.getState().setUp("acme/notes");
    expect(usePersonalSetup.getState()).toMatchObject({ ready: true, repo: "acme/notes" });
  });

  it("puts Research topics, Codebases and Work on the home of a library that is set up", async () => {
    const home = await render(<PersonalHome />);
    expect(home).toContain('data-wf="PersonalHome"');
    for (const title of ["Research topics", "Codebases", "Work"]) expect(home).toContain(title);
    expect(home).toContain("Personal library");
    expect(home.indexOf("Research topics")).toBeLessThan(home.indexOf("Codebases"));
    expect(home.indexOf("Codebases")).toBeLessThan(home.indexOf(">Work<"));
    expect(home).not.toContain("Set up your personal library");
    expect(home).toContain("No agent is connected");
  });
});

// ---------------------------------------------------------------- Refresh and Summarize

describe("Summarize", () => {
  afterEach(() => vi.useRealTimers());

  it("hands the request to the connected agent, and marks the pages while it runs", async () => {
    const seen: string[] = [];
    let during = false;
    const stop = setPersonalAgent({
      summarize: async (request) => {
        during = isSummarizing("work/wf/wf/web/wf-3k9x2.md");
        seen.push(request.kind === "work" ? request.target.key : request.path);
      },
    });
    const target = issue("wf-3k9x2", "in_progress", "wf/web", {
      path: "work/wf/wf/web/wf-3k9x2.md",
    });
    await summarize({ kind: "work", target, pages: [target.path] });
    stop();
    expect(seen).toEqual(["wf-3k9x2"]);
    expect(during).toBe(true);
    expect(isSummarizing(target.path)).toBe(false);
  });

  it("writes the page itself without an agent, so a stale summary is current again", async () => {
    vi.useFakeTimers();
    const [mock, work] = await Promise.all([loadMock(), import("@mock/libraries/work-summaries")]);
    mock.server.controls.loadSample();
    const read = () =>
      work.workList(work.workWorld(mock.server.store), (path) => {
        try {
          return mock.server.libraryRegistry.page("me", path).text;
        } catch {
          return undefined;
        }
      });
    const before = read().targets.find((t) => t.key === "wf-3k9x2") as WorkTarget;
    expect(summaryState(before)).toBe("stale");
    const run = summarize({ kind: "work", target: before, pages: [before.path] });
    expect(isSummarizing(before.path)).toBe(true);
    await vi.advanceTimersByTimeAsync(3000);
    await run;
    expect(isSummarizing(before.path)).toBe(false);
    const after = read().targets.find((t) => t.key === "wf-3k9x2") as WorkTarget;
    expect(summaryState(after)).toBe("current");
    // The group above it waits for its own button.
    expect(summaryState(read().targets.find((t) => t.key === "wf/web") as WorkTarget)).toBe(
      "stale",
    );
    mock.server.controls.reset();
  });

  it("moves the commit of a codebase summary to the head of main, and keeps its sections", async () => {
    vi.useFakeTimers();
    const mock = await loadMock();
    const path = "codebases/mudit1729-workflow_management.md";
    const before = mock.server.libraryRegistry.page("me", path).text;
    expect(before).toContain('commit: "a7f905c"');
    const run = summarize({
      kind: "codebase",
      path,
      repo: "https://github.com/mudit1729/workflow_maagement",
    });
    await vi.advanceTimersByTimeAsync(3000);
    await run;
    const after = mock.server.libraryRegistry.page("me", path).text;
    expect(after).toContain('commit: "f74a83e"');
    expect(after.replace(/^---[\s\S]*?\n---/, "")).toBe(before.replace(/^---[\s\S]*?\n---/, ""));
    mock.server.libraryRegistry.reset();
  });
});
