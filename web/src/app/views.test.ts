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
    expect(subViewForPath("/lib/lib-4tz7c")).toBe("library");
    expect(subViewForPath("/glossary")).toBe("glossary");
    expect(subViewForPath("/files")).toBe("files");
    expect(subViewForPath("/skills")).toBe("skills");
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

  it("lists every sub-view under exactly one view, and the view's home is one of them", () => {
    for (const sub of subs) {
      const owners = views.filter((v) => VIEWS[v].subs.includes(sub));
      expect(owners).toEqual([SUBVIEWS[sub].view]);
    }
    for (const view of views) expect(VIEWS[view].subs).toContain(VIEWS[view].home);
  });

  it("gives every sub-view its own route and its own shortcut", () => {
    expect(new Set(subs.map((s) => SUBVIEWS[s].to)).size).toBe(subs.length);
    expect(new Set(subs.map((s) => SUBVIEWS[s].shortcut)).size).toBe(subs.length);
  });

  it("opens a view on its home with the home's route", () => {
    expect(SUBVIEWS[VIEWS.workflow.home].to).toBe("/w");
    expect(SUBVIEWS[VIEWS.workdatabase.home].to).toBe("/lib");
  });

  it("says Workflow holds Board, Workdatabase Library, Glossary, Files and Skills", () => {
    expect(VIEWS.workflow.subs).toEqual(["board"]);
    expect(VIEWS.workdatabase.subs).toEqual(["library", "glossary", "files", "skills"]);
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
    expect(tabTitle("/skills", "wf", 0)).toBe("Workdatabase · Skills · wf");
    expect(tabTitle("/lib", "wf", 0)).toBe("Workdatabase · wf");
    expect(tabTitle("/glossary", "wf", 0)).toBe("Workdatabase · Glossary · wf");
    expect(tabTitle("/files", "wf", 0)).toBe("Workdatabase · Files · wf");
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
