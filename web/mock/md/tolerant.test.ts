// (f) The tolerant reader (contract 1.1 principle 3): bad input never throws and never hides a
// file. It becomes plain markdown plus the right finding at the right line.
import { describe, expect, test, vi } from "vitest";
import type { Diagnostic } from "@/gen/types";
import { loadWorkspace } from "./index";
import * as goalParser from "./parse-goal";
import { RECORDED_AT } from "./recorded-at";
import { diskFiles } from "./test-support";

const TOML = 'wf_format = 1\n\n[workspace]\nname = "t"\n\n[server]\nauthor = "shruti"\n';
const AUTHORS = "# Authors\n\n## @shruti\n- kind: human\n\n## @codex\n- kind: agent\n";

const goal = (front = "", body?: string) =>
  `---\nid: wf-aaaaa\ntitle: A thing\nstatus: planned\n${front}created: 2026-10-22T10:00+05:30\n---\n\n${
    body ??
    "## Context\n\nWhy this matters.\n\n## Success criteria\n\n- [ ] SC-1: The system shall respond within 2 s.\n"
  }`;

/** A tiny workspace around the given files. */
const ws = (files: Record<string, string>) => ({
  "workflow.toml": TOML,
  "authors.md": AUTHORS,
  ...files,
});

const NOW = Date.parse(RECORDED_AT);
const load = (files: Record<string, string>) => loadWorkspace(ws(files), { now: NOW });
const rules = (list: Diagnostic[] | undefined) => (list ?? []).map((d) => d.rule);
const find = (list: Diagnostic[] | undefined, rule: string) =>
  (list ?? []).filter((d) => d.rule === rule);

const GOAL = "issues/a/goal.md";
const PLAN = "issues/a/plan.md";
const STATE = "issues/a/current_state.md";
const CHANGES = "issues/a/changes.md";

describe("frontmatter", () => {
  test("invalid YAML gives F001 at the error line, keeps the raw text and still reads the body", () => {
    const text = goal("owner: [unclosed\n");
    const l = load({ [GOAL]: text });
    const d = find(l.diagnostics[GOAL], "F001");
    expect(d).toHaveLength(1);
    expect(d[0].severity).toBe("error");
    expect(d[0].line).toBeGreaterThan(1);
    expect(l.frontmatter["wf-aaaaa"].ok).toBe(false);
    expect(l.texts["wf-aaaaa"]["goal.md"]).toBe(text);
    const src = l.world.issues[0];
    expect(src.criteria).toHaveLength(1);
    expect(src.context).toBe("Why this matters.");
    // every key that parses on its own survives
    expect(src.goal).toMatchObject({ id: "wf-aaaaa", title: "A thing", status: "planned" });
  });

  test("a bare @handle is the classic F001 and the fix quotes it", () => {
    const l = load({ [GOAL]: goal("owner: @shruti\n") });
    const d = find(l.diagnostics[GOAL], "F001")[0];
    expect(d.message).toBe(
      "Invalid YAML at line 5, column 8: found character `@` that cannot start any token.",
    );
    expect(d.fix).toBe('Quote the handle: `owner: "@shruti"`.');
    expect(l.world.issues[0].goal.owner).toBe("shruti");
    expect(l.world.issues[0].yaml_error).toMatchObject({ key: "owner" });
  });

  test("an unclosed frontmatter block is F001 and the file still shows", () => {
    const l = load({ [GOAL]: "---\nid: wf-aaaaa\ntitle: x\n\n## Context\n\nText.\n" });
    expect(find(l.diagnostics[GOAL], "F001")[0].line).toBe(1);
    expect(l.world.issues).toHaveLength(1);
  });

  test("unknown keys are kept and reported as F006", () => {
    const l = load({ [GOAL]: goal("epic: payments\nsprint: 4\n") });
    const d = find(l.diagnostics[GOAL], "F006");
    expect(d.map((x) => x.message)).toEqual([
      "Unknown frontmatter key `epic`. wf keeps it and shows it.",
      "Unknown frontmatter key `sprint`. wf keeps it and shows it.",
    ]);
    expect(d.every((x) => x.severity === "info")).toBe(true);
    expect(l.world.issues[0].goal.extra).toEqual({ epic: "payments", sprint: "4" });
  });

  test("unknown meta keys in a change and a task are F006 too", () => {
    const l = load({
      [GOAL]: goal(),
      [CHANGES]:
        "# Changes\n\n## 2026-10-22T10:00+05:30 @codex — Did a thing {#C-aaaaa}\n- kind: fix\n- flavor: sweet\n\nDone.\n",
      [PLAN]:
        '---\nupdated_at: 2026-10-22T10:00+05:30\nupdated_by: "@codex"\n---\n\n## Approach\n\nGo.\n\n## Phase 1: One\n\n### T-1: Do it\n- status: todo\n- colour: red\n',
    });
    expect(find(l.diagnostics[CHANGES], "F006")).toHaveLength(1);
    expect(l.world.issues[0].changes[0].extra).toEqual({ flavor: "sweet" });
    expect(find(l.diagnostics[PLAN], "F006")).toHaveLength(1);
  });

  test("missing required keys are F002 and get usable defaults", () => {
    const l = load({
      [GOAL]:
        "---\nstatus: planned\n---\n\n## Context\n\nHi.\n\n## Success criteria\n\n- [ ] SC-1: The system shall x.\n",
    });
    const msgs = find(l.diagnostics[GOAL], "F002").map((d) => d.message);
    expect(msgs.some((m) => m.includes("`id`"))).toBe(true);
    expect(msgs.some((m) => m.includes("`title`"))).toBe(true);
    expect(msgs.some((m) => m.includes("`created`"))).toBe(true);
    const g = l.world.issues[0].goal;
    expect(g.id).toMatch(/^wf-[0-9a-z]{5}$/);
    expect(g.title).toBe("a");
    expect(g.created).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  test("a goal.md with no frontmatter at all still becomes an issue", () => {
    const l = load({ [GOAL]: "# Fix the thing\n\nJust text.\n" });
    expect(l.world.issues).toHaveLength(1);
    expect(find(l.diagnostics[GOAL], "F002").length).toBeGreaterThanOrEqual(3);
    expect(l.world.issues[0].context).toBe("Just text.");
  });

  test("a colon in a plain title is F001 on that line, and the issue still shows", () => {
    const l = load({ [GOAL]: goal().replace("title: A thing", "title: Fix: the thing") });
    const d = find(l.diagnostics[GOAL], "F001");
    expect(d).toHaveLength(1);
    expect(d[0].line).toBe(3);
    expect(d[0].fix).toBe("Fix the YAML on this line, or quote the value.");
    expect(l.world.issues).toHaveLength(1);
    expect(l.world.issues[0].goal.status).toBe("planned");
  });

  test("a byte order mark and Windows line endings do not break the frontmatter", () => {
    const text = `\uFEFF${goal().replace(/\n/g, "\r\n")}`;
    const l = load({ [GOAL]: text });
    expect(find(l.diagnostics[GOAL], "F001")).toEqual([]);
    expect(l.world.issues[0].goal).toMatchObject({ id: "wf-aaaaa", title: "A thing" });
    expect(l.world.issues[0].criteria).toHaveLength(1);
    // byte spans count the BOM and every \r
    const a = l.anchors[GOAL].status;
    const bytes = new TextEncoder().encode(text);
    expect(new TextDecoder().decode(bytes.slice(a.span[0], a.span[1]))).toBe("status: planned");
  });

  test("an alias bomb in the frontmatter is F001, not a crash", () => {
    const bomb = [
      "a: &a [x, x, x, x, x, x, x, x, x, x]",
      "b: &b [*a, *a, *a, *a, *a, *a, *a, *a, *a, *a]",
      "c: &c [*b, *b, *b, *b, *b, *b, *b, *b, *b, *b]",
      "d: &d [*c, *c, *c, *c, *c, *c, *c, *c, *c, *c]",
      "e: &e [*d, *d, *d, *d, *d, *d, *d, *d, *d, *d]",
      "f: &f [*e, *e, *e, *e, *e, *e, *e, *e, *e, *e]",
      "g: &g [*f, *f, *f, *f, *f, *f, *f, *f, *f, *f]",
      "h: &h [*g, *g, *g, *g, *g, *g, *g, *g, *g, *g]",
    ].join("\n");
    const l = load({ [GOAL]: `---\n${bomb}\nid: wf-aaaaa\ntitle: T\n---\n\n## Context\n\nx\n` });
    expect(find(l.diagnostics[GOAL], "F001").length).toBeGreaterThanOrEqual(1);
    expect(l.world.issues).toHaveLength(1);
  });

  test("a duplicate key is F001", () => {
    const l = load({ [GOAL]: goal("status: done\n") });
    expect(find(l.diagnostics[GOAL], "F001")).toHaveLength(1);
  });

  test("a bad enum is F003 and falls back to the default", () => {
    const l = load({
      [GOAL]: goal("priority: sooner\n").replace("status: planned", "status: sleeping"),
    });
    const d = find(l.diagnostics[GOAL], "F003");
    expect(d).toHaveLength(2);
    expect(d[0].message).toContain("is not one of");
    expect(l.world.issues[0].goal).toMatchObject({ status: "backlog", priority: "none" });
  });

  test("a duplicate issue id is F004 and the second issue gets another id", () => {
    const l = load({ [GOAL]: goal(), "issues/b/goal.md": goal() });
    expect(find(l.diagnostics["issues/b/goal.md"], "F004")).toHaveLength(1);
    const ids = l.world.issues.map((i) => i.goal.id);
    expect(new Set(ids).size).toBe(2);
  });

  test("F007 for another wf_format and F001 for broken TOML", () => {
    const l = loadWorkspace({ "workflow.toml": "wf_format = 2\n", [GOAL]: goal() }, { now: NOW });
    expect(find(l.diagnostics["workflow.toml"], "F007")).toHaveLength(1);
    const bad = loadWorkspace(
      { "workflow.toml": "wf_format = \n[oops", [GOAL]: goal() },
      { now: NOW },
    );
    expect(find(bad.diagnostics["workflow.toml"], "F001")).toHaveLength(1);
    expect(bad.world.config.issues_dir).toBe("issues");
    expect(bad.world.issues).toHaveLength(1);
  });
});

describe("body", () => {
  test("a missing Context or Success criteria section is F002", () => {
    const l = load({ [GOAL]: goal("", "Only text, no sections.\n") });
    const msgs = find(l.diagnostics[GOAL], "F002").map((d) => d.message);
    expect(msgs).toContain("Required section `## Context` is missing.");
    expect(msgs).toContain("Required section `## Success criteria` is missing.");
    expect(l.world.issues[0].context).toBe("Only text, no sections.");
  });

  test("criteria out of sequence are F005", () => {
    const l = load({
      [GOAL]: goal(
        "",
        "## Context\n\nx\n\n## Success criteria\n\n- [ ] SC-1: The system shall a.\n- [ ] SC-3: The system shall b.\n- [ ] No id here shall c.\n",
      ),
    });
    const d = find(l.diagnostics[GOAL], "F005");
    expect(d).toHaveLength(2);
    expect(d[0].message).toContain("Expected SC-2, found SC-3");
    expect(l.world.issues[0].criteria).toHaveLength(3);
  });

  test("a dangling reference is F009, a good one is not", () => {
    const l = load({
      [GOAL]: goal(
        "",
        "## Context\n\nSee [[wf-zzzzz]], [[#T-9]], [[lib-zzzzz]] and [[#SC-1]].\n\n## Success criteria\n\n- [ ] SC-1: The system shall x.\n",
      ),
    });
    const d = find(l.diagnostics[GOAL], "F009");
    expect(d.map((x) => x.message.split(" ")[0])).toEqual([
      "[[wf-zzzzz]]",
      "[[#T-9]]",
      "[[lib-zzzzz]]",
    ]);
    expect(d.every((x) => x.severity === "warn" && x.line === 10)).toBe(true);
  });

  test("a reference written as an example in code is not a link", () => {
    const l = load({
      [GOAL]: goal(
        "",
        "## Context\n\nWrite `[[wf-zzzzz]]` to link.\n\n```md\nSee [[wf-yyyyy#D-aaaaa]]\n```\n\n## Success criteria\n\n- [ ] SC-1: The system shall x.\n",
      ),
    });
    expect(find(l.diagnostics[GOAL], "F009")).toEqual([]);
  });

  test("a stray heading in changes.md folds into the entry above and gets F005", () => {
    const l = load({
      [GOAL]: goal(),
      [CHANGES]:
        "# Changes\n\n## 2026-10-22T10:00+05:30 @codex — One {#C-aaaaa}\n- kind: fix\n\nFirst.\n\n## Notes to self\n\nA stray block.\n\n## 2026-10-22T11:00+05:30 @codex — Two {#C-bbbbb}\n\nSecond.\n",
    });
    const changes = l.world.issues[0].changes;
    expect(changes.map((c) => c.id)).toEqual(["C-aaaaa", "C-bbbbb"]);
    expect(changes[0].body).toContain("## Notes to self");
    expect(changes[0].body).toContain("A stray block.");
    const d = find(l.diagnostics[CHANGES], "F005");
    expect(d).toHaveLength(1);
    expect(d[0].line).toBe(8);
  });

  test("an entry without an author is F016, a duplicate id is F004", () => {
    const l = load({
      [GOAL]: goal(),
      [CHANGES]:
        "# Changes\n\n## 2026-10-22T10:00+05:30 — No author {#C-aaaaa}\n\nA.\n\n## 2026-10-22T11:00+05:30 @codex — Same id {#C-aaaaa}\n\nB.\n",
    });
    expect(find(l.diagnostics[CHANGES], "F016")).toHaveLength(1);
    expect(find(l.diagnostics[CHANGES], "F004")).toHaveLength(1);
    expect(l.world.issues[0].changes).toHaveLength(2);
  });

  test("a meta list after a blank line is read and flagged F017", () => {
    const l = load({
      [GOAL]: goal(),
      [CHANGES]:
        "# Changes\n\n## 2026-10-22T10:00+05:30 @codex — One {#C-aaaaa}\n\n- kind: fix\n- task: T-1\n\nBody.\n",
    });
    expect(find(l.diagnostics[CHANGES], "F017")).toHaveLength(1);
    expect(l.world.issues[0].changes[0]).toMatchObject({ kind: "fix", task: "T-1", body: "Body." });
  });

  test("a heading with an invalid timestamp is F005, a date-only one is S13", () => {
    const l = load({
      [GOAL]: goal(),
      [CHANGES]:
        "# Changes\n\n## yesterday @codex — One {#C-aaaaa}\n\nA.\n\n## 2026-10-22 @codex — Two {#C-bbbbb}\n\nB.\n",
    });
    expect(find(l.diagnostics[CHANGES], "F005")).toHaveLength(1);
    expect(find(l.diagnostics[CHANGES], "S13")).toHaveLength(1);
    expect(l.world.issues[0].changes.every((c) => c.ts.length > 0)).toBe(true);
  });

  test("current_state.md: an unknown or misplaced section is F005 and the rest is read", () => {
    const l = load({
      [GOAL]: goal(),
      [STATE]:
        '---\nsummary: "Doing it."\nupdated_at: 2026-10-22T10:00+05:30\nupdated_by: "@codex"\n---\n\n## Next steps\n1. Go.\n\n## Done\n- It.\n\n## Wishes\n- None.\n',
    });
    expect(find(l.diagnostics[STATE], "F005")).toHaveLength(2);
    const s = l.world.issues[0].state;
    expect(s?.next_steps).toEqual(["Go."]);
    expect(s?.done).toEqual(["It."]);
  });

  test("a task heading that is not T-n: is F005", () => {
    const l = load({
      [GOAL]: goal(),
      [PLAN]:
        '---\nupdated_at: 2026-10-22T10:00+05:30\nupdated_by: "@codex"\n---\n\n## Phase 1: One\n\n### T-1 Missing colon\n- status: todo\n\n### T-2: Fine\n- status: todo\n',
    });
    expect(find(l.diagnostics[PLAN], "F005")).toHaveLength(1);
    expect(l.world.issues[0].plan?.phases[0].tasks.map((t) => t.id)).toEqual(["T-2"]);
  });

  test("tasks before the first phase are Unphased", () => {
    const l = load({
      [GOAL]: goal(),
      [PLAN]:
        '---\nupdated_at: 2026-10-22T10:00+05:30\nupdated_by: "@codex"\n---\n\n## Approach\n\nGo.\n\n### T-1: Loose task\n- status: todo\n\n## Phase 1: One\n\n### T-2: In a phase\n',
    });
    const phases = l.world.issues[0].plan?.phases ?? [];
    expect(phases.map((p) => [p.index, p.name, p.tasks.map((t) => t.id)])).toEqual([
      [0, "Unphased", ["T-1"]],
      [1, "One", ["T-2"]],
    ]);
  });

  test("F013 for an unknown dependency and a cycle, F014 for overlapping owns", () => {
    const l = load({
      [GOAL]: goal(),
      [PLAN]:
        '---\nupdated_at: 2026-10-22T10:00+05:30\nupdated_by: "@codex"\n---\n\n## Phase 1: One\n\n### T-1: A\n- status: todo\n- depends_on: T-2, T-9\n- owns: `src/a/**`\n\n### T-2: B\n- status: todo\n- depends_on: T-1\n- owns: `src/b/**`\n\n### T-3: C\n- status: todo\n- owns: `src/a/x.rs`\n',
    });
    const f13 = find(l.diagnostics[PLAN], "F013").map((d) => d.message);
    expect(f13.some((m) => m.includes("T-9"))).toBe(true);
    expect(f13.some((m) => m.startsWith("Dependency cycle"))).toBe(true);
    const f14 = find(l.diagnostics[PLAN], "F014");
    expect(f14).toHaveLength(1);
    expect(f14[0].message).toContain("T-3 owns paths that overlap T-1");
  });

  test("F012 for git conflict markers", () => {
    const l = load({ [GOAL]: `${goal()}\n<<<<<<< HEAD\nours\n=======\ntheirs\n>>>>>>> branch\n` });
    expect(find(l.diagnostics[GOAL], "F012")).toHaveLength(3);
  });
});

describe("archify blocks", () => {
  const block = (info: string, body: string) =>
    goal(
      "",
      `## Context\n\n\`\`\`${info}\n${body}\n\`\`\`\n\n## Success criteria\n\n- [ ] SC-1: The system shall x.\n`,
    );

  test("invalid JSON is F010 and the diagram is invalid", () => {
    const l = load({ [GOAL]: block("archify workflow id=bad", '{ "nodes": [') });
    expect(find(l.diagnostics[GOAL], "F010")).toHaveLength(1);
    expect(l.diagrams.bad.status).toBe("invalid");
    expect(l.world.issues[0].context).toContain("```wf-diagram\nbad\n```");
  });

  test("a wrong type is F010", () => {
    const l = load({ [GOAL]: block("archify swimlane id=x", '{ "nodes": [], "edges": [] }') });
    expect(find(l.diagnostics[GOAL], "F010")[0].message).toContain("unknown type `swimlane`");
  });

  test("a candidate that fails the checks is F011 with the validator errors", () => {
    const json = JSON.stringify({
      meta: { title: "T" },
      nodes: [{ id: "a", label: "A" }, { id: "b" }],
      edges: [{ from: "a", to: "zzz" }],
    });
    const l = load({ [GOAL]: block("archify workflow id=oops", json) });
    const d = find(l.diagnostics[GOAL], "F011");
    expect(d).toHaveLength(1);
    expect(d[0].message).toMatch(
      /^Archify render failed with 2 errors\. nodes\[1\]\.label: missing required property$/,
    );
    expect(l.diagrams.oops.errors.map((e) => e.path)).toEqual(["nodes[1].label", "edges[0].to"]);
    expect(l.diagrams.oops).toMatchObject({
      type: "workflow",
      title: "T",
      nodes: 2,
      status: "invalid",
    });
  });

  test("a valid block is unavailable, has no finding and keeps its source", () => {
    const json = JSON.stringify(
      { meta: { title: "Ok" }, nodes: [{ id: "a", label: "A" }], edges: [] },
      null,
      2,
    );
    const l = load({ [GOAL]: block("archify architecture id=ok", json) });
    expect(rules(l.diagnostics[GOAL]).filter((r) => r.startsWith("F01"))).toEqual([]);
    expect(l.diagrams.ok).toMatchObject({
      status: "unavailable",
      source: json,
      url: "",
      type: "architecture",
    });
  });

  test("a block without id= gets the hash as its id", () => {
    const l = load({
      [GOAL]: block("archify workflow", '{ "nodes": [{ "id": "a", "label": "A" }], "edges": [] }'),
    });
    const ids = Object.keys(l.diagrams);
    expect(ids).toHaveLength(1);
    expect(ids[0]).toMatch(/^[0-9a-f]{12}$/);
  });
});

describe("folders", () => {
  test("a folder with goal.md and _group.md is an issue with F008", () => {
    const l = load({ [GOAL]: goal(), "issues/a/_group.md": "---\nid: g-aaaaa\ntitle: A\n---\n" });
    expect(find(l.diagnostics[GOAL], "F008")).toHaveLength(1);
    expect(l.world.issues).toHaveLength(1);
    expect(l.world.groups.find((g) => g.id === "g-aaaaa")).toBeUndefined();
  });

  test("folders inside an issue are not scanned for issues", () => {
    const l = load({ [GOAL]: goal(), "issues/a/notes/goal.md": goal() });
    expect(l.world.issues).toHaveLength(1);
    expect(l.world.issues[0].docs?.map((d) => d.path)).toEqual(["notes/goal.md"]);
  });

  test("a folder with _group.md is an explicit group, one without is implicit", () => {
    const l = load({
      "issues/team/_group.md":
        '---\nid: g-team1\ntitle: The team\norder: 2\ncolor: 4\nowner: "@shruti"\n---\n',
      "issues/team/a/goal.md": goal(),
      "issues/loose/b/goal.md": goal().replace("wf-aaaaa", "wf-bbbbb"),
    });
    const byslug = Object.fromEntries(l.world.groups.map((g) => [g.slug, g]));
    expect(byslug.team).toMatchObject({
      id: "g-team1",
      title: "The team",
      implicit: false,
      order: 2,
      color: 4,
      owner: "shruti",
    });
    expect(byslug.loose).toMatchObject({ title: "loose", implicit: true });
    expect(byslug.loose.id).toMatch(/^g-[0-9a-hjkmnp-tv-z]{5}$/);
    expect(byslug.loose.order).toBeGreaterThan(byslug.team.order);
    expect(l.world.issues.find((i) => i.goal.id === "wf-bbbbb")?.group).toBe(byslug.loose.id);
    // implicit ids are stable: the same folder gives the same id again
    const again = load({ "issues/loose/b/goal.md": goal() });
    expect(again.world.groups.find((g) => g.slug === "loose")?.id).toBe(byslug.loose.id);
  });

  test("scanner ignores .git, .wf, node_modules and editor files", () => {
    const l = load({
      [GOAL]: goal(),
      "issues/a/.goal.md.swp": "x",
      "issues/a/goal.md~": "x",
      "issues/.git/b/goal.md": goal(),
      "issues/node_modules/c/goal.md": goal(),
      "issues/a/notes/.#lock": "x",
      "issues/a/notes/4913": "x",
    });
    expect(l.world.issues).toHaveLength(1);
    expect(l.world.issues[0].docs).toBeUndefined();
  });

  test("an empty or nearly empty workspace loads", () => {
    const empty = loadWorkspace({}, { now: NOW });
    expect(empty.world.issues).toEqual([]);
    expect(empty.world.groups).toHaveLength(1);
    expect(empty.world.config.issues_dir).toBe("issues");
    const only = loadWorkspace({ "issues/x/goal.md": "" }, { now: NOW });
    expect(only.world.issues).toHaveLength(1);
  });

  test("a library item in the wrong folder takes the folder's kind with F005", () => {
    const l = load({
      "library/gotchas/x.md":
        '---\nid: lib-aaaaa\ntitle: X\nkind: pattern\ndescription: Use when x.\nstatus: draft\nsource: ["[[wf-aaaaa]]"]\nauthors: ["@codex"]\ncreated: 2026-10-22\n---\n\n## Rule\n\nDo x.\n',
      [GOAL]: goal(),
    });
    expect(l.world.library[0].kind).toBe("gotcha");
    expect(find(l.diagnostics["library/gotchas/x.md"], "F005")).toHaveLength(1);
  });

  test("library source written without quotes still reads as references", () => {
    const l = load({
      "library/patterns/x.md":
        "---\nid: lib-aaaaa\ntitle: X\nkind: pattern\ndescription: Use when x.\nstatus: draft\nsource: [[wf-aaaaa]]\nauthors: [codex]\ncreated: 2026-10-22\n---\n\n## Rule\n\nDo x.\n",
      [GOAL]: goal(),
    });
    expect(l.world.library[0].source).toEqual(["[[wf-aaaaa]]"]);
    expect(l.world.library[0].authors).toEqual(["codex"]);
  });
});

describe("a parser that fails", () => {
  test("a goal.md the parser cannot read still shows as an issue, with F005", () => {
    const spy = vi.spyOn(goalParser, "parseGoal").mockImplementationOnce(() => {
      throw new Error("boom");
    });
    const text = goal();
    const l = load({ [GOAL]: text, "issues/b/goal.md": goal().replace("wf-aaaaa", "wf-bbbbb") });
    spy.mockRestore();
    expect(l.world.issues).toHaveLength(2);
    const broken = l.world.issues.find((i) => i.slug === "a");
    expect(broken?.context).toBe(text);
    expect(find(l.diagnostics[GOAL], "F005")[0].message).toBe("Could not read this file: boom");
    expect(l.texts[broken?.goal.id as string]["goal.md"]).toBe(text);
  });

  test("a failure of the whole loader returns an empty workspace with a finding", () => {
    // A file text that is not a string breaks `toLines` outside every per-file wrapper.
    const l = loadWorkspace(
      { "workflow.toml": TOML, [GOAL]: { not: "text" } as never },
      { now: NOW },
    );
    expect(l.world.issues).toEqual([]);
    expect(l.world.groups).toEqual([]);
    expect(find(l.diagnostics["workflow.toml"], "F005")[0].message).toMatch(
      /^Could not read the workspace: /,
    );
    expect(l.ignored).toContain(GOAL);
  });
});

describe("never throws", () => {
  /** A small deterministic generator. */
  function rng(seed: number) {
    let s = seed;
    return () => {
      s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
      return s / 2 ** 32;
    };
  }

  const files = diskFiles();
  const paths = Object.keys(files);

  function mutate(text: string, r: () => number): string {
    const lines = text.split("\n");
    const kind = Math.floor(r() * 7);
    const i = Math.floor(r() * lines.length);
    switch (kind) {
      case 0:
        return text.slice(0, Math.floor(r() * text.length));
      case 1:
        lines.splice(i, 1 + Math.floor(r() * 3));
        return lines.join("\n");
      case 2:
        lines.splice(i, 0, lines[Math.floor(r() * lines.length)] ?? "");
        return lines.join("\n");
      case 3:
        return text.replace(/---/g, r() < 0.5 ? "--" : "----");
      case 4:
        return text.replace(/[:[\]{}]/g, (c) => (r() < 0.1 ? "" : c));
      case 5:
        lines[i] =
          `${lines[i] ?? ""}${["`", "```", "[[", "{#", "**", "\t", "\u0000", "@"][Math.floor(r() * 8)]}`;
        return lines.join("\n");
      default:
        return text.replace(/\n/g, "\r\n");
    }
  }

  test("random damage to the seed workspace never throws and keeps the invariants", {
    timeout: 30_000,
  }, () => {
    const r = rng(42);
    for (let n = 0; n < 60; n++) {
      const damaged: Record<string, string> = { ...files };
      for (let k = 0; k < 1 + Math.floor(r() * 4); k++) {
        const p = paths[Math.floor(r() * paths.length)];
        damaged[p] = mutate(damaged[p], r);
      }
      let loaded: ReturnType<typeof loadWorkspace> | undefined;
      expect(() => {
        loaded = loadWorkspace(damaged, { now: NOW });
      }, `round ${n}`).not.toThrow();
      const w = (loaded as NonNullable<typeof loaded>).world;
      const ids = w.issues.map((i) => i.goal.id);
      expect(new Set(ids).size).toBe(ids.length);
      const groupIds = new Set(w.groups.map((g) => g.id));
      expect(groupIds.size).toBe(w.groups.length);
      for (const i of w.issues) expect(groupIds.has(i.group)).toBe(true);
      expect(w.groups.filter((g) => !g.parent)).toHaveLength(1);
    }
  });

  test("garbage in every known file name never throws", () => {
    const garbage = [
      "",
      "\n\n\n",
      "---",
      "---\n---",
      "## ",
      "### T-1:",
      "- [ ]",
      "\u0000\u0001",
      "```archify",
      "# ".repeat(500),
      "x".repeat(50_000),
    ];
    for (const g of garbage) {
      const damaged: Record<string, string> = {
        "workflow.toml": g,
        "authors.md": g,
        "glossary.md": g,
        "issues/_group.md": g,
        "issues/a/_group.md": g,
        "library/patterns/x.md": g,
      };
      for (const f of ["goal", "plan", "current_state", "changes", "decisions", "learnings"])
        damaged[`issues/a/b/${f}.md`] = g;
      expect(() => loadWorkspace(damaged, { now: NOW })).not.toThrow();
    }
  });
});

describe("configuration", () => {
  test("[lint] disable and severity change what is reported", () => {
    const body =
      "## Context\n\nThis is probably fine.\n\n## Success criteria\n\n- [ ] SC-1: The system shall x.\n";
    const base = loadWorkspace({ "workflow.toml": TOML, [GOAL]: goal("", body) }, { now: NOW });
    const hedge = find(base.diagnostics[GOAL], "S06");
    expect(hedge).toHaveLength(1);
    expect(hedge[0].severity).toBe("warn");

    const off = loadWorkspace(
      { "workflow.toml": `${TOML}\n[lint]\ndisable = ["S06"]\n`, [GOAL]: goal("", body) },
      { now: NOW },
    );
    expect(find(off.diagnostics[GOAL], "S06")).toHaveLength(0);

    const err = loadWorkspace(
      {
        "workflow.toml": `${TOML}\n[lint]\nseverity = { S06 = "error" }\n`,
        [GOAL]: goal("", body),
      },
      { now: NOW },
    );
    expect(find(err.diagnostics[GOAL], "S06")[0].severity).toBe("error");
  });

  test("the config maps to WorkspaceConfig", () => {
    const l = loadWorkspace(
      {
        "workflow.toml":
          'wf_format = 1\n[workspace]\nname = "demo"\nissues_dir = "work"\nid_prefix = "dm"\n[leases]\nminutes = 30\n[staleness]\nissue_hours = 12\ntask_hours = 2\n[server]\nauthor = "codex"\n',
        "work/x/goal.md": goal(),
      },
      { now: NOW },
    );
    expect(l.world.config).toMatchObject({
      name: "demo",
      issues_dir: "work",
      id_prefix: "dm",
      leases_minutes: 30,
      staleness: { issue_hours: 12, task_hours: 2 },
      author: "codex",
    });
    expect(l.issueDirs["wf-aaaaa"]).toBe("work/x");
  });
});
