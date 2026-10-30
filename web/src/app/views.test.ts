import { describe, expect, it } from "vitest";
import { SUBVIEWS, subViewForPath, VIEWS, type WfSubView, type WfView } from "@/components/common";
import { validateGlossarySearch, validateLibrarySearch } from "./search";
import { SHORTCUTS } from "./shortcuts";
import { tabTitle } from "./tab-title";

describe("which sub-view a route belongs to", () => {
  it("counts the board, its drawer and the full issue page as Board", () => {
    for (const path of ["/w", "/w/i/wf-3k9x2", "/i/wf-3k9x2"]) {
      expect(subViewForPath(path)).toBe("board");
    }
  });

  it("maps the other pages, with or without a child path", () => {
    expect(subViewForPath("/lib")).toBe("library");
    expect(subViewForPath("/files")).toBe("files");
    expect(subViewForPath("/skills")).toBe("skills");
  });

  it("splits the Library into the personal library and the team libraries", () => {
    for (const path of ["/lib/me", "/lib/me/topics/agent-context/index.md"])
      expect(subViewForPath(path)).toBe("personal");
    for (const path of ["/lib/t", "/lib/t/wf", "/lib/t/wf/playbooks/write-criteria-as-ears.md"])
      expect(subViewForPath(path)).toBe("team");
    // The old addresses redirect before anything renders; until then they sit where they land.
    expect(subViewForPath("/glossary")).toBe("team");
    expect(subViewForPath("/lib/lib-4tz7c")).toBe("library");
  });

  it("does not take a longer word for a library route", () => {
    expect(subViewForPath("/lib/mean")).toBe("library");
    expect(subViewForPath("/lib/tx")).toBe("library");
  });

  it("has no inbox: /inbox belongs to no view (the router sends it to the board)", () => {
    expect(subViewForPath("/inbox")).toBeUndefined();
    expect(subViewForPath("/inbox/anything")).toBeUndefined();
  });

  it("does not match a longer word that only starts the same way", () => {
    expect(subViewForPath("/workshop")).toBeUndefined();
    expect(subViewForPath("/library")).toBeUndefined();
    expect(subViewForPath("/skills-old")).toBeUndefined();
    expect(subViewForPath("/kit")).toBeUndefined();
    expect(subViewForPath("/")).toBeUndefined();
  });
});

describe("the view tables", () => {
  const views = Object.keys(VIEWS) as WfView[];
  const subs = Object.keys(SUBVIEWS) as WfSubView[];

  it("lists every sub-view as a tab of its own view, except a home that is a page of its own", () => {
    for (const sub of subs) {
      const def = SUBVIEWS[sub];
      const listed = views.filter((v) => VIEWS[v].subs.includes(sub));
      // The Library home (/lib) is the page the view's name opens, not one of its tabs.
      const page = VIEWS[def.view].home === sub && !VIEWS[def.view].subs.includes(sub);
      expect(listed).toEqual(page ? [] : [def.view]);
    }
    for (const view of views) expect(SUBVIEWS[VIEWS[view].home].view).toBe(view);
  });

  it("gives every sub-view its own route and its own shortcut", () => {
    expect(new Set(subs.map((s) => SUBVIEWS[s].to)).size).toBe(subs.length);
    expect(new Set(subs.map((s) => SUBVIEWS[s].shortcut)).size).toBe(subs.length);
  });

  it("opens a view on its home with the home's route", () => {
    expect(SUBVIEWS[VIEWS.workflow.home].to).toBe("/w");
    expect(SUBVIEWS[VIEWS.workdatabase.home].to).toBe("/lib");
  });

  it("says Workflow holds Board, and the Library holds Personal, Team libraries, Files and Skills", () => {
    expect(VIEWS.workflow.subs).toEqual(["board"]);
    expect(VIEWS.workdatabase.label).toBe("Library");
    expect(VIEWS.workdatabase.subs).toEqual(["personal", "team", "files", "skills"]);
    expect(SUBVIEWS.personal.to).toBe("/lib/me");
    expect(SUBVIEWS.team.to).toBe("/lib/t");
  });

  it("gives Skills the route /skills and the shortcut g s, which nothing else uses", () => {
    expect(SUBVIEWS.skills).toMatchObject({ view: "workdatabase", to: "/skills", shortcut: "g s" });
    const taken = SHORTCUTS.flatMap((s) => s.items.flatMap((i) => i.combos)).filter(
      (c) => c === "g s",
    );
    expect(taken).toHaveLength(1);
  });
});

describe("tab title", () => {
  it("leads with the view and ends with the workspace", () => {
    expect(tabTitle("/w", "wf", 3)).toBe("(3) Workflow · wf");
    expect(tabTitle("/w/i/wf-3k9x2", "wf", 0)).toBe("Workflow · wf");
    expect(tabTitle("/i/wf-3k9x2", "wf", 0)).toBe("Workflow · wf");
  });

  it("names a sub-view that is not its view's home", () => {
    expect(tabTitle("/skills", "wf", 0)).toBe("Library · Skills · wf");
    expect(tabTitle("/lib", "wf", 0)).toBe("Library · wf");
    expect(tabTitle("/lib/me/topics/a.md", "wf", 0)).toBe("Library · Personal · wf");
    expect(tabTitle("/lib/t/wf/glossary.md", "wf", 0)).toBe("Library · Team libraries · wf");
    expect(tabTitle("/files", "wf", 0)).toBe("Library · Files · wf");
  });

  it("covers the kit, unknown paths and a workspace that has not loaded", () => {
    expect(tabTitle("/kit", "wf", 0)).toBe("Kit · wf");
    expect(tabTitle("/nope", "wf", 0)).toBe("wf");
    expect(tabTitle("/w", undefined, 0)).toBe("Workflow · wf");
  });
});

describe("the shortcuts", () => {
  const combos = SHORTCUTS.flatMap((s) => s.items.flatMap((i) => i.combos));

  it("lists no inbox shortcut and opens Add work with n", () => {
    expect(combos).not.toContain("g i");
    const general = SHORTCUTS.find((s) => s.title === "General");
    expect(general?.items.find((i) => i.combos.includes("n"))?.label).toBe("Add work");
  });

  it("names the eight issue tabs", () => {
    const tabs = SHORTCUTS.find((s) => s.title === "Issue")?.items.find((i) => i.range);
    expect(tabs?.combos).toEqual(["1", "8"]);
    expect(tabs?.label).toBe("Switch tab: Now, Goal, Criteria, Plan, Log, Git, CI, Files");
  });
});

describe("the library routes", () => {
  it("keeps the search text, its scope and the page view, and nothing else", () => {
    expect(
      validateLibrarySearch({ q: "rotate keys ", scope: "me", view: "source", kind: "pattern" }),
    ).toEqual({ q: "rotate keys ", scope: "me", view: "source", tab: undefined });
    expect(validateLibrarySearch({ view: "wide", q: "  " })).toEqual({
      q: undefined,
      scope: undefined,
      view: undefined,
      tab: undefined,
    });
  });
});

describe("the glossary route", () => {
  it("keeps only the filter text, exactly as typed", () => {
    expect(validateGlossarySearch({ q: "avoid ", tab: "glossary", kind: "pattern" })).toEqual({
      q: "avoid ",
    });
    expect(validateGlossarySearch({ q: "   " }).q).toBeUndefined();
  });

  it("is what /lib?tab=glossary hands over: the library search still carries tab and q", () => {
    expect(validateLibrarySearch({ tab: "glossary", q: "hedge" })).toMatchObject({
      tab: "glossary",
      q: "hedge",
    });
  });
});
