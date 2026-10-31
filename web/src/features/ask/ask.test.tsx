// Ask library without a browser: where the panel looks (chips, their pages, the size line), the
// questions it suggests, the section a citation opens, what the actions write, who answers, and
// the parts as markup. (The test environment has no DOM, so a part renders to markup inside a
// router.)

import { SAMPLE } from "@mock/sample-files";
import { createMockServer } from "@mock/server";
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
import { openAsk, setAskHandler } from "@/features/library/ask-hook";
import type { IssueDetail, IssueSummary } from "@/gen/types";
import { queryClient } from "@/lib/api";
import type { LibraryInfo, LibraryPage, LibraryTree, LibraryTreeNode } from "@/lib/api/types";
import { AnswerView } from "./AnswerView";
import { citedPages, learningSources, linkedLine, planLinks, whyLine } from "./actions";
import {
  type AskAgent,
  prototypeAgent,
  requestFor,
  responderOf,
  setAskAgent,
  useAskAgentStore,
} from "./agent";
import { parseAnswer } from "./answer";
import { recentIssues } from "./IssuePicker";
import { criterionQuestion, suggestQuestions } from "./questions";
import { libraryLabel, ScopeChips } from "./ScopeChips";
import {
  EMPTY_SELECTION,
  LARGE_SCOPE_TOKENS,
  pageOf,
  type Selection,
  scopeAddresses,
  scopeSize,
  sizeLine,
  treePages,
} from "./scope";
import { sectionOf } from "./section";
import { closeAskPanel, openAskPanel, useAsk } from "./store";
import type { ScopeData } from "./useScope";

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

// ---------------------------------------------------------------- the libraries of the tests

const page = (path: string, title: string, chars = 400): LibraryTreeNode => ({
  type: "page",
  path,
  title,
  chars,
});

/** `wf`: home, playbooks/ (own page 300 + two pages), a loose page. */
const WF: LibraryTree = {
  alias: "wf",
  home: "README.md",
  pages: [
    "README.md",
    "playbooks/index.md",
    "playbooks/ears.md",
    "playbooks/resume.md",
    "glossary.md",
  ],
  others: [],
  root: {
    type: "section",
    path: "",
    title: "",
    page: "README.md",
    children: [
      {
        type: "section",
        path: "playbooks",
        title: "Playbooks",
        page: "playbooks/index.md",
        chars: 300 + 800 + 1200,
        children: [
          page("playbooks/ears.md", "Write criteria as EARS", 800),
          page("playbooks/resume.md", "Resume from a handoff", 1200),
        ],
      },
      page("glossary.md", "Glossary", 2000),
    ],
  },
};

const ME: LibraryTree = {
  alias: "me",
  home: null,
  pages: ["topics/agent-context/index.md"],
  others: [],
  root: {
    type: "section",
    path: "",
    title: "",
    children: [page("topics/agent-context/index.md", "Agent-readable issue context", 2400)],
  },
};

const facts = (linked: string[] = []) => {
  const pages = new Map<string, ReturnType<typeof treePages>[number]>();
  const byLibrary = new Map<string, string[]>();
  for (const tree of [WF, ME]) {
    const list = treePages(tree);
    for (const p of list) pages.set(p.address, p);
    byLibrary.set(
      tree.alias,
      list.map((p) => p.address),
    );
  }
  return { linked, pages, byLibrary };
};

const LIBRARIES = [
  { alias: "me", kind: "personal", name: "Shruti's library", pages: 1, loaded: true },
  { alias: "wf", kind: "workspace", name: "This workspace", pages: 5, loaded: true },
] as LibraryInfo[];

// ---------------------------------------------------------------- where to look

describe("the pages a selection stands for", () => {
  it("reads the sizes of a tree: a section's own page is what its section holds beyond its pages", () => {
    const list = treePages(WF);
    expect(list.map((p) => [p.address, p.chars])).toEqual([
      ["wf:README.md", 0],
      ["wf:playbooks/index.md", 300],
      ["wf:playbooks/ears.md", 800],
      ["wf:playbooks/resume.md", 1200],
      ["wf:glossary.md", 2000],
    ]);
    expect(list[2]?.title).toBe("Write criteria as EARS");
  });

  it("is nothing until a chip is on", () => {
    expect(scopeAddresses(EMPTY_SELECTION, facts(["wf:glossary.md"]))).toEqual([]);
  });

  it("linked is the pages of the issue's Links, a library chip is every page of it, a pick is one", () => {
    const f = facts(["wf:glossary.md#term", "me:topics/agent-context/index.md"]);
    expect(scopeAddresses({ ...EMPTY_SELECTION, linked: true }, f)).toEqual([
      "wf:glossary.md",
      "me:topics/agent-context/index.md",
    ]);
    expect(scopeAddresses({ ...EMPTY_SELECTION, libraries: ["me"] }, f)).toEqual([
      "me:topics/agent-context/index.md",
    ]);
    expect(
      scopeAddresses({ ...EMPTY_SELECTION, pages: ["wf:playbooks/ears.md#procedure"] }, f),
    ).toEqual(["wf:playbooks/ears.md"]);
  });

  it("each page counts once, whatever chips reach it, and a chip adds only its own pages", () => {
    const f = facts(["wf:glossary.md"]);
    const all: Selection = {
      linked: true,
      libraries: ["wf", "me"],
      pages: ["wf:glossary.md", "wf:playbooks/ears.md"],
    };
    const pages = scopeAddresses(all, f);
    expect(new Set(pages).size).toBe(pages.length);
    expect(pages).toHaveLength(6);
    // Only a library whose chip is on contributes: no "me" pages without it.
    expect(
      scopeAddresses({ ...EMPTY_SELECTION, libraries: ["wf"] }, f).some((p) => p.startsWith("me:")),
    ).toBe(false);
  });

  it("sums the size, about four characters a token, and says it in words", () => {
    const f = facts();
    const size = scopeSize(["wf:playbooks/ears.md", "wf:playbooks/resume.md"], f);
    expect(size).toEqual({ pages: 2, tokens: 500 });
    expect(sizeLine(size)).toBe("2 pages · ~500 tokens");
    expect(sizeLine({ pages: 1, tokens: 480 })).toBe("1 page · ~480 tokens");
    expect(sizeLine({ pages: 12, tokens: 9000 })).toBe("12 pages · ~9k tokens");
    expect(sizeLine({ pages: 3, tokens: 1500 })).toBe("3 pages · ~1.5k tokens");
  });

  it("an address with a heading is the page", () => {
    expect(pageOf("platform:runbooks/x.md#rotate")).toBe("platform:runbooks/x.md");
    expect(pageOf("me:a.md")).toBe("me:a.md");
  });
});

describe("the chips as markup", () => {
  const data = (over: Partial<ScopeData> = {}): ScopeData => ({
    libraries: LIBRARIES,
    facts: facts(["wf:glossary.md"]),
    loading: false,
    hasLinked: true,
    ...over,
  });
  const show = (selection: Selection, d = data(), pickerOpen = false) => {
    const pages = scopeAddresses(selection, d.facts);
    return render(
      <ScopeChips
        data={d}
        selection={selection}
        onChange={() => {}}
        size={scopeSize(pages, d.facts)}
        pickerOpen={pickerOpen}
        onPickerOpen={() => {}}
        titleOf={(a) => a}
      />,
    );
  };

  it("has Linked to this issue, one chip per library with its page count, and Pick pages", async () => {
    const html = await show({ ...EMPTY_SELECTION, linked: true });
    expect(html).toContain("Linked to this issue");
    expect(html).toContain("My library");
    expect(html).toContain("This workspace");
    expect(html).toContain("Pick pages…");
    // A chip that is on says so with aria-pressed and a check, not with color alone.
    expect(html.match(/aria-pressed="true"/g)).toHaveLength(1);
    expect(html).toContain("1 page · ~500 tokens");
  });

  it("the Linked chip is off, and says why, when the issue links no page", async () => {
    const html = await show(EMPTY_SELECTION, data({ hasLinked: false, facts: facts() }));
    expect(html).toMatch(/<button[^>]*disabled=""[^>]*>[\s\S]*?Linked to this issue/);
    expect(html).toContain("This issue links no library pages yet");
    expect(html).toContain("Choose where to look.");
  });

  it("names the personal library My library and the others by their name", () => {
    expect(libraryLabel({ kind: "personal", name: "Shruti's library" })).toBe("My library");
    expect(libraryLabel({ kind: "workspace", name: "This workspace" })).toBe("This workspace");
    expect(libraryLabel({ kind: "team", name: "Platform handbook" })).toBe("Platform handbook");
  });

  it("warns about a scope that is large", async () => {
    const big = facts();
    big.pages.set("wf:big.md", {
      address: "wf:big.md",
      title: "Big",
      chars: LARGE_SCOPE_TOKENS * 4,
    });
    const html = await show({ ...EMPTY_SELECTION, pages: ["wf:big.md"] }, data({ facts: big }));
    expect(html).toContain("The agent reads these whole");
  });

  it("a page picked one by one is a chip of its own, with a way to take it out", async () => {
    const html = await show({ ...EMPTY_SELECTION, pages: ["wf:glossary.md"] });
    expect(html).toContain('aria-label="Remove wf:glossary.md"');
  });
});

// ---------------------------------------------------------------- the questions

describe("the suggested questions", () => {
  it("turns an EARS criterion into a question about how", () => {
    expect(
      criterionQuestion("When two tabs are open, the dashboard shall hold only one connection."),
    ).toBe("How do we hold only one connection when two tabs are open?");
    expect(
      criterionQuestion(
        "While the event stream is down, the board shall show a reconnecting badge.",
      ),
    ).toBe("How do we show a reconnecting badge while the event stream is down?");
    expect(
      criterionQuestion(
        "If `goal.md` frontmatter is invalid, then the drawer shall show the raw file.",
      ),
    ).toBe("How do we show the raw file if goal.md frontmatter is invalid?");
    expect(criterionQuestion("The daemon shall ignore the watcher echo of its own writes.")).toBe(
      "How do we ignore the watcher echo of its own writes?",
    );
  });

  it("a sentence that is not EARS is asked about, not rewritten", () => {
    expect(criterionQuestion("Docs read well on a phone.")).toBe(
      "What do the pages say about “Docs read well on a phone”?",
    );
  });

  it("draws three from the issue: an open request, the next criterion, the title", async () => {
    const server = createMockServer({ latency: 0, disk: SAMPLE });
    const detail = await server.issue("wf-3k9x2");
    expect(suggestQuestions(detail)).toEqual([
      "Approve keeping SSE instead of WebSocket for the board?",
      "How do we show a reconnecting badge and replay missed events on reconnect while the event stream is down?",
      "What do our pages say about push board updates over SSE?",
    ]);
  });

  it("without a request the second open criterion comes in, and a bare issue still gets three", async () => {
    const server = createMockServer({ latency: 0, disk: SAMPLE });
    const detail = await server.issue("wf-3k9x2");
    const noRequest = { ...detail, state: detail.state && { ...detail.state, needs_you: [] } };
    expect(suggestQuestions(noRequest as IssueDetail)).toHaveLength(3);
    expect(suggestQuestions(noRequest as IssueDetail)[0]).toMatch(/^How do we show a reconnecting/);

    const bare = {
      ...detail,
      criteria: [],
      state: null,
      summary: { ...detail.summary, title: "Fix tab-title count" },
    } as unknown as IssueDetail;
    expect(suggestQuestions(bare)).toEqual([
      "What do our pages say about fix tab-title count?",
      "Which gotchas should I know before I start?",
      "Which decisions already cover this?",
    ]);
  });

  it("an answered request is not asked again", async () => {
    const server = createMockServer({ latency: 0, disk: SAMPLE });
    const detail = await server.issue("wf-3k9x2");
    const answered = {
      ...detail,
      state: detail.state && {
        ...detail.state,
        needs_you: detail.state.needs_you.map((r) => ({ ...r, answered: true })),
      },
    } as IssueDetail;
    expect(suggestQuestions(answered)).not.toContain(
      "Approve keeping SSE instead of WebSocket for the board?",
    );
  });
});

// ---------------------------------------------------------------- the cited section

describe("the section a citation opens", () => {
  const text = [
    "---",
    "title: Rescan",
    "---",
    "",
    "# Rescan subtrees",
    "",
    "Lead of the page.",
    "",
    "## Symptom",
    "",
    "The old path stays.",
    "",
    "## Fix",
    "",
    "1. Treat events as hints.",
    "",
    "### Detail",
    "",
    "Hash the files.",
    "",
    "## Evidence",
    "",
    "- seen once",
  ].join("\n");
  const doc = { text, lineOffset: 4 };

  it("runs from its heading to the next one of the same level or higher", () => {
    const fix = sectionOf(doc, "Fix");
    expect(fix.md).toBe("## Fix\n\n1. Treat events as hints.\n\n### Detail\n\nHash the files.");
    expect(fix).toMatchObject({ heading: "Fix", missing: false, cut: false });
    expect(sectionOf(doc, "Symptom").md).toBe("## Symptom\n\nThe old path stays.");
    expect(sectionOf(doc, "Evidence").md).toBe("## Evidence\n\n- seen once");
  });

  it("finds a heading however the answer wrote it", () => {
    expect(sectionOf(doc, "fix").heading).toBe("Fix");
    expect(sectionOf(doc, "symptom").md).toContain("The old path stays.");
  });

  it("no heading is the lead of the page", () => {
    expect(sectionOf(doc).md).toBe("# Rescan subtrees\n\nLead of the page.");
    expect(sectionOf(doc).heading).toBeUndefined();
  });

  it("a heading the page lost shows the lead and says so", () => {
    const gone = sectionOf(doc, "Cause");
    expect(gone.missing).toBe(true);
    expect(gone.md).toContain("Lead of the page.");
  });

  it("a long section is cut at a line", () => {
    const long = { text: `## A\n\n${"word ".repeat(2000).trim()}\n\nlast line`, lineOffset: 0 };
    const cut = sectionOf(long, "A");
    expect(cut.cut).toBe(true);
    expect(cut.md.endsWith("…")).toBe(true);
    expect(cut.md.length).toBeLessThan(2600);
  });
});

// ---------------------------------------------------------------- what the actions write

describe("link cited pages and save to log", () => {
  const parsed = parseAnswer(
    [
      "Treat each event as a hint [1]. After a rename the old path stays [2]. See also [3].",
      "",
      "## Sources",
      "[1] wf:gotchas/notify.md#Fix",
      "[2] wf:gotchas/notify.md#Symptom",
      "[3] platform:runbooks/rotate.md",
    ].join("\n"),
  );

  it("the why is the question, in one line", () => {
    expect(whyLine("How should the watcher\nhandle renames?")).toBe(
      "Cited for “How should the watcher handle renames”.",
    );
  });

  it("cited pages are each page once, in the order of the sources", () => {
    expect(citedPages(parsed)).toEqual(["wf:gotchas/notify.md", "platform:runbooks/rotate.md"]);
  });

  it("a learning keeps one source per section, as a link to the section", () => {
    expect(learningSources(parsed)).toEqual([
      "wf:gotchas/notify.md#fix",
      "wf:gotchas/notify.md#symptom",
      "platform:runbooks/rotate.md",
    ]);
  });

  const read =
    (pages: Record<string, { item?: string; status?: string }>) =>
    async (alias: string, path: string) => {
      const hit = pages[`${alias}:${path}`];
      if (!hit) throw new Error("missing");
      return {
        item: hit.item,
        frontmatter: hit.status ? { status: hit.status } : {},
      } as unknown as LibraryPage;
    };

  it("a workspace item is linked by its lib- id, any other page by its address", async () => {
    const plan = await planLinks(
      ["wf:gotchas/notify.md", "platform:runbooks/rotate.md"],
      "How should the watcher handle renames?",
      read({
        "wf:gotchas/notify.md": { item: "lib-4tz7c", status: "reviewed" },
        "platform:runbooks/rotate.md": {},
      }),
    );
    expect(plan).toEqual({
      retired: 0,
      links: [
        {
          kind: "library",
          target: "lib-4tz7c",
          label: "Cited for “How should the watcher handle renames”.",
        },
        {
          kind: "page",
          target: "platform:runbooks/rotate.md",
          label: "Cited for “How should the watcher handle renames”.",
        },
      ],
    });
  });

  it("a retired item is left out, because add_links refuses it", async () => {
    const plan = await planLinks(
      ["wf:decisions/poll.md"],
      "Q?",
      read({ "wf:decisions/poll.md": { item: "lib-0rt4e", status: "retired" } }),
    );
    expect(plan).toEqual({ links: [], retired: 1 });
  });

  it("a page that cannot be read is still linked by its address", async () => {
    const plan = await planLinks(["me:gone.md"], "Q?", read({}));
    expect(plan.links.map((l) => `${l.kind}:${l.target}`)).toEqual(["page:me:gone.md"]);
  });

  it("says what was done in one line", () => {
    expect(linkedLine("wf-3k9x2", { added: 2, present: 0, retired: 0 }, 2)).toBe(
      "Linked 2 pages to wf-3k9x2.",
    );
    expect(linkedLine("wf-3k9x2", { added: 1, present: 1, retired: 0 }, 2)).toBe(
      "Linked 1 page to wf-3k9x2. 1 page was already there.",
    );
    expect(linkedLine("wf-3k9x2", { added: 0, present: 2, retired: 0 }, 2)).toBe(
      "wf-3k9x2 already links these pages.",
    );
    expect(linkedLine("wf-3k9x2", { added: 0, present: 1, retired: 0 }, 1)).toBe(
      "wf-3k9x2 already links this page.",
    );
    expect(linkedLine("wf-3k9x2", { added: 1, present: 0, retired: 1 }, 2)).toBe(
      "Linked 1 page to wf-3k9x2. 1 page is retired and left out.",
    );
    expect(linkedLine("wf-3k9x2", { added: 0, present: 0, retired: 1 }, 1)).toBe(
      "Nothing to link in wf-3k9x2. 1 page is retired and left out.",
    );
  });
});

// ---------------------------------------------------------------- who answers

describe("who answers", () => {
  afterEach(() => {
    useAskAgentStore.setState({ agent: undefined, prototype: true });
  });

  const agent: AskAgent = { handle: "@codex", ask: async () => "Not in these pages." };

  it("a connected agent first, then the prototype, then nobody", () => {
    expect(responderOf(agent, true)).toEqual({ mode: "agent", agent });
    expect(responderOf(undefined, true).mode).toBe("prototype");
    expect(responderOf(undefined, false)).toEqual({ mode: "none" });
  });

  it("the agent connection registers itself and gives Ask back when it leaves", () => {
    const off = setAskAgent(agent);
    expect(useAskAgentStore.getState().agent).toBe(agent);
    off();
    expect(useAskAgentStore.getState().agent).toBeUndefined();
    // A later connection is not taken away by the one before it leaving.
    const second: AskAgent = { ...agent, handle: "@claude" };
    const offFirst = setAskAgent(agent);
    setAskAgent(second);
    offFirst();
    expect(useAskAgentStore.getState().agent).toBe(second);
  });

  it("the request an agent gets: the pages, the question and the skill's prompt", () => {
    const request = requestFor("wf-3k9x2", ["wf:gotchas/notify.md"], "How?");
    expect(request).toEqual({
      issue: "wf-3k9x2",
      pages: ["wf:gotchas/notify.md"],
      question: "How?",
      prompt: "Pages:\n- wf:gotchas/notify.md\n<question>\nHow?\n</question>",
    });
  });

  it("the prototype streams its answer and resolves to what querying-library prints", async () => {
    const heard: string[] = [];
    const text = await prototypeAgent.ask(
      requestFor(
        "wf-3k9x2",
        ["wf:gotchas/notify-macos-rescan-subtrees.md"],
        "How should the watcher handle folder renames?",
      ),
      new AbortController().signal,
      (t) => heard.push(t),
    );
    expect(heard.length).toBeGreaterThan(3);
    expect(heard.at(-1)).toBe(text);
    expect(text.startsWith(heard[0] ?? "")).toBe(true);
    const parsed = parseAnswer(text);
    expect(parsed).toMatchObject({ notFound: false, problems: [] });
    expect(
      parsed.sources.every((s) => s.address === "wf:gotchas/notify-macos-rescan-subtrees.md"),
    ).toBe(true);
  });

  it("stopping a stream stops the answer", async () => {
    const control = new AbortController();
    const run = prototypeAgent.ask(
      requestFor(
        "wf-3k9x2",
        ["wf:gotchas/notify-macos-rescan-subtrees.md"],
        "How should the watcher handle folder renames?",
      ),
      control.signal,
      () => control.abort(),
    );
    await expect(run).rejects.toThrow("Stopped");
  });
});

// ---------------------------------------------------------------- the entry points

describe("opening the panel", () => {
  afterEach(() => {
    closeAskPanel();
    useAsk.setState({ issue: undefined, pages: [] });
  });

  it("the issue's button names the issue; the library's names a page", () => {
    openAskPanel({ issue: "wf-3k9x2" });
    expect(useAsk.getState()).toMatchObject({ open: true, issue: "wf-3k9x2", pages: [] });
    openAskPanel({ pages: ["platform:runbooks/rotate.md"] });
    expect(useAsk.getState()).toMatchObject({
      open: true,
      issue: undefined,
      pages: ["platform:runbooks/rotate.md"],
    });
  });

  it("every open starts the panel over, even one that is open already", () => {
    openAskPanel({ issue: "wf-3k9x2" });
    const first = useAsk.getState().nonce;
    openAskPanel({ issue: "wf-3k9x2" });
    expect(useAsk.getState().nonce).toBe(first + 1);
  });

  it("Ask about this page reaches the panel through the library's hook", () => {
    const off = setAskHandler((address) => openAskPanel({ pages: [address] }));
    openAsk("wf:playbooks/ears.md");
    expect(useAsk.getState()).toMatchObject({ open: true, pages: ["wf:playbooks/ears.md"] });
    off();
  });

  it("close closes, and the pages stay for the next open to replace", () => {
    openAskPanel({ issue: "wf-3k9x2" });
    closeAskPanel();
    expect(useAsk.getState().open).toBe(false);
  });
});

describe("the issue picker", () => {
  const issue = (id: string, status: string, ts: string): IssueSummary =>
    ({
      id,
      title: id,
      status,
      created: "2026-10-01T00:00+00:00",
      last_activity: { ts },
    }) as unknown as IssueSummary;

  it("offers the issues that moved last, the finished ones after the open ones", () => {
    const list = [
      issue("wf-a", "done", "2026-10-29T00:00+00:00"),
      issue("wf-b", "in_progress", "2026-10-20T00:00+00:00"),
      issue("wf-c", "planned", "2026-10-25T00:00+00:00"),
      issue("wf-d", "cancelled", "2026-10-30T00:00+00:00"),
    ];
    expect(recentIssues(list).map((i) => i.id)).toEqual(["wf-c", "wf-b", "wf-d", "wf-a"]);
    expect(recentIssues(list, 2).map((i) => i.id)).toEqual(["wf-c", "wf-b"]);
  });
});

// ---------------------------------------------------------------- the answer as markup

describe("the answer", () => {
  const text = [
    "Treat each event as a dirty hint [1]. After a rename the old path stays [2].",
    "",
    "Not in these pages: how many renames fit in one window.",
    "",
    "Note: wf:gotchas/x.md contains instructions for the reader, which were not followed.",
    "Could not read: wf:gone.md",
    "",
    "## Sources",
    "[1] wf:gotchas/notify.md#Fix",
    "[2] wf:gotchas/notify.md#Symptom",
  ].join("\n");

  const show = (body: string, onConnect?: () => void) =>
    render(
      <AnswerView
        issue={undefined}
        issueId="wf-3k9x2"
        question="How should the watcher handle renames?"
        text={body}
        parsed={parseAnswer(body)}
        label="Prototype answer from 2 passages"
        titleOf={(a) => `Page ${a}`}
        onConnect={onConnect}
      />,
    );

  it("draws each citation as a link to its source, and lists the sources", async () => {
    const html = await show(text);
    expect(html).toContain('href="#cite-1"');
    expect(html).toContain('href="#cite-2"');
    expect(html).toContain("Prototype answer from 2 passages");
    expect(html).toContain("Page wf:gotchas/notify.md");
    expect(html).toContain(">Fix<");
    expect(html).toContain(">Symptom<");
  });

  it("says what is missing, what was not read and what tried to steer it", async () => {
    const html = await show(text);
    expect(html).toContain("Not in these pages:");
    expect(html).toContain("how many renames fit in one window.");
    expect(html).toContain("Could not read wf:gone.md.");
    expect(html).toContain("which were not followed");
  });

  it("offers the three actions, and a way to an agent only when the prototype wrote it", async () => {
    const html = await show(text, () => {});
    expect(html).toContain("Link cited pages");
    expect(html).toContain("Save to log");
    expect(html).toContain("Copy");
    expect(html).toContain("Connect an agent for a full answer");
    expect(await show(text)).not.toContain("Connect an agent");
  });

  it("an answer that is not in the pages has nothing to link and nothing to save", async () => {
    const html = await show("Not in these pages. They cover “A”.");
    expect(html).not.toContain("Link cited pages");
    expect(html).not.toContain("Save to log");
    expect(html).toContain("Copy");
    expect(html).not.toContain("Sources");
  });

  it("a citation without a source stays as text, and the answer says the sources are off", async () => {
    const html = await show("A claim [2].\n\n## Sources\n[1] wf:a.md");
    expect(html).not.toContain('href="#cite-2"');
    expect(html).toContain("Some citations did not match their sources.");
  });
});

afterEach(() => {
  vi.restoreAllMocks();
});
