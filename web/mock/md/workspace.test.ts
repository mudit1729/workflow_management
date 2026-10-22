// The markdown layer against the workspace files under mock/workspace (the seed world):
//  (a) the files follow the grammar of contract 1.3–1.5 and the layout of 1.2;
//  (b) every lint finding the seed world is meant to show is found in the text;
//  (c) what the loader reports about the files: groups, anchors, diagrams, docs, assets.
//
// The files are the only source of the mock world and people edit them. These tests describe
// the files as they ship: a hand edit that breaks one of them is a reason to read the test.
import { describe, expect, test } from "vitest";
import { posOf, rev } from "../util";
import { loadWorkspace } from "./index";
import { ENTRY_HEADING } from "./parse-log";
import { RECORDED_AT } from "./recorded-at";
import { diagramIds, libraryPath, stateBody } from "./render";
import { diskFiles } from "./test-support";

const RECORDED = Date.parse(RECORDED_AT);

const SC2 = "issues/wf/web/live-board-updates/evidence/sc2.png";
const BINARY = { [SC2]: { url: `/files/${SC2}`, bytes: 95362 } };

const disk = diskFiles();
/** The workspace as the grammar checks and the finding checks read it. */
const exported = disk;

// ---------------------------------------------------------------- (c) grammar

const CROCKFORD = /^[0-9a-hjkmnp-tv-z]{5}$/;
/** IDs fixed by UI_BUILD.md that predate the Crockford rule (they hold i, l, o or u). */
const FIXED_IDS = new Set([
  "wf-ss0lo",
  "g-wf001",
  "g-core1",
  "g-web01",
  "g-skl01",
  "g-plat1",
  "g-auth1",
]);

const META_KEYS: Record<string, string[]> = {
  "changes.md": [
    "kind",
    "task",
    "criteria",
    "result",
    "evidence",
    "commit",
    "pr",
    "files",
    "session",
    "model",
  ],
  "decisions.md": ["status", "topic", "supersedes", "affects", "decided_by"],
  "learnings.md": ["kind", "tags", "applies_to", "promote"],
};
const TASK_KEYS = [
  "status",
  "lane",
  "depends_on",
  "owns",
  "satisfies",
  "assignee",
  "claimed_by",
  "lease_until",
  "verify",
];
const REQUEST_KEYS = [
  "from",
  "to",
  "kind",
  "urgency",
  "asked",
  "options",
  "ref",
  "answer",
  "answered_by",
  "answered_at",
];
const CRITERION_KEYS = ["verify", "evidence", "verified_by", "scenario"];
const STATE_ORDER = [
  "Done",
  "In flight",
  "Blocked",
  "Needs you",
  "Failed attempts",
  "Handoff notes",
  "Next steps",
];
const LIBRARY_SECTIONS: Record<string, string[]> = {
  pattern: ["Rule", "When to use", "Example", "Evidence"],
  gotcha: ["Symptom", "Cause", "Fix", "Evidence"],
  playbook: ["Overview", "Procedure", "Done when", "Forbidden"],
  decision: ["Decision", "Because", "Rejected", "Revisit when"],
};

const base = (p: string) => p.slice(p.lastIndexOf("/") + 1);

/** Lines outside fenced blocks, with their 1-based number. */
function bodyLines(text: string): { n: number; line: string }[] {
  const out: { n: number; line: string }[] = [];
  let fence = false;
  text.split("\n").forEach((line, i) => {
    if (/^```/.test(line)) {
      fence = !fence;
      return;
    }
    if (!fence) out.push({ n: i + 1, line });
  });
  return out;
}

function checkGrammar(files: Record<string, string>): string[] {
  const problems: string[] = [];
  const bad = (path: string, n: number, msg: string) => problems.push(`${path}:${n} ${msg}`);

  for (const [path, text] of Object.entries(files)) {
    if (!text.endsWith("\n") || text.endsWith("\n\n"))
      bad(path, 1, "must end with exactly one line break");
    text.split("\n").forEach((l, i) => {
      if (/\s+$/.test(l)) bad(path, i + 1, "trailing whitespace");
      if (l.includes("\t")) bad(path, i + 1, "tab");
    });
    const name = base(path);
    const lines = bodyLines(text);

    if (name in META_KEYS) {
      const prefix = name === "changes.md" ? "C" : name === "decisions.md" ? "D" : "L";
      const heads = lines.filter((l) => /^## /.test(l.line));
      for (const h of heads) {
        const m = ENTRY_HEADING.exec(h.line);
        if (!m) bad(path, h.n, `entry heading does not match the grammar: ${h.line}`);
        else if (!m[4].startsWith(`${prefix}-`)) bad(path, h.n, `id ${m[4]} has the wrong prefix`);
        if (m && !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2})?[+-]\d{2}:\d{2}$/.test(m[1]))
          bad(path, h.n, `timestamp ${m[1]} is not RFC 3339 with an offset`);
      }
      // The meta list sits directly under the heading and uses known keys only.
      const all = text.split("\n");
      for (const h of heads) {
        for (let i = h.n; i < all.length && /^- [a-z_]+:/.test(all[i]); i++) {
          const key = /^- ([a-z_]+):/.exec(all[i])?.[1] as string;
          if (!META_KEYS[name].includes(key)) bad(path, i + 1, `unknown meta key ${key}`);
        }
      }
      if (heads.length > 1) {
        const ids = heads.map((h) => ENTRY_HEADING.exec(h.line)?.[4]);
        if (new Set(ids).size !== ids.length) bad(path, 1, "duplicate entry id");
      }
    }

    if (name === "current_state.md") {
      const sections = lines.filter((l) => /^## /.test(l.line)).map((l) => l.line.slice(3));
      const ranks = sections.map((s) => STATE_ORDER.indexOf(s));
      if (ranks.includes(-1)) bad(path, 1, `unknown section in ${sections.join(", ")}`);
      if (ranks.some((r, i) => i > 0 && r <= ranks[i - 1]))
        bad(path, 1, `sections out of order: ${sections.join(", ")}`);
      const front = text.split("\n").slice(1, text.split("\n").indexOf("---", 1));
      for (const k of ["summary", "updated_at", "updated_by"])
        if (!front.some((l) => l.startsWith(`${k}:`))) bad(path, 1, `missing frontmatter key ${k}`);
      lines.forEach(({ n, line }) => {
        const q = /^- \[([ x])\] (Q-[0-9a-hjkmnp-tv-z]{5}): /.exec(line);
        if (!q) return;
        const all = text.split("\n");
        const keys: string[] = [];
        for (let i = n; i < all.length && /^ {2}- [a-z_]+:/.test(all[i]); i++)
          keys.push(/^ {2}- ([a-z_]+):/.exec(all[i])?.[1] as string);
        for (const k of ["from", "to", "kind", "urgency", "asked", "answer"])
          if (!keys.includes(k)) bad(path, n, `request ${q[2]} lacks ${k}`);
        for (const k of keys)
          if (!REQUEST_KEYS.includes(k)) bad(path, n, `request ${q[2]} has unknown key ${k}`);
        if (q[1] === "x" && !keys.includes("answered_by"))
          bad(path, n, `answered request ${q[2]} lacks answered_by`);
      });
    }

    if (name === "plan.md") {
      const tasks = lines.filter((l) => /^### /.test(l.line));
      tasks.forEach((t, i) => {
        const m = /^### T-(\d+): \S/.exec(t.line);
        if (!m) bad(path, t.n, `task heading does not match: ${t.line}`);
        else if (Number(m[1]) !== i + 1)
          bad(path, t.n, `task ids must run T-1, T-2…; found T-${m[1]}`);
      });
      const phases = lines.filter((l) => /^## Phase /.test(l.line));
      phases.forEach((p, i) => {
        if (!new RegExp(`^## Phase ${i + 1}: \\S`).test(p.line))
          bad(path, p.n, `phase heading ${p.line}`);
      });
      const all = text.split("\n");
      for (const t of tasks) {
        for (let i = t.n; i < all.length && /^- [a-z_]+:/.test(all[i]); i++) {
          const key = /^- ([a-z_]+):/.exec(all[i])?.[1] as string;
          if (!TASK_KEYS.includes(key)) bad(path, i + 1, `task has unknown key ${key}`);
        }
      }
    }

    if (name === "goal.md") {
      const sections = lines.filter((l) => /^## /.test(l.line)).map((l) => l.line.slice(3));
      const order = ["Context", "Success criteria", "Out of scope", "Links"];
      const ranks = sections.map((s) => order.indexOf(s));
      if (ranks.includes(-1) || ranks.some((r, i) => i > 0 && r <= ranks[i - 1]))
        bad(path, 1, `sections ${sections.join(", ")}`);
      const crit = lines.filter((l) => /^- \[[ x]\] /.test(l.line));
      crit.forEach((c, i) => {
        if (!new RegExp(`^- \\[[ x]\\] SC-${i + 1}: \\S`).test(c.line))
          bad(path, c.n, `criterion ${c.line}`);
      });
      const all = text.split("\n");
      for (const c of crit) {
        for (let i = c.n; i < all.length && /^ {2}- [a-z_]+:/.test(all[i]); i++) {
          const key = /^ {2}- ([a-z_]+):/.exec(all[i])?.[1] as string;
          if (!CRITERION_KEYS.includes(key)) bad(path, i + 1, `criterion has unknown key ${key}`);
        }
      }
      const id = /^id: (\S+)$/m.exec(text)?.[1] ?? "";
      if (!/^wf-[0-9a-z]{5}$/.test(id)) bad(path, 2, `issue id ${id}`);
      else if (!FIXED_IDS.has(id) && !CROCKFORD.test(id.slice(3)))
        bad(path, 2, `issue id ${id} is not Crockford base32`);
    }

    if (name === "_group.md") {
      const id = /^id: (\S+)$/m.exec(text)?.[1] ?? "";
      if (!/^g-[0-9a-z]{5}$/.test(id)) bad(path, 2, `group id ${id}`);
      else if (!FIXED_IDS.has(id) && !CROCKFORD.test(id.slice(2)))
        bad(path, 2, `group id ${id} is not Crockford base32`);
    }

    if (path.startsWith("library/")) {
      const kind = /^kind: (\S+)$/m.exec(text)?.[1] ?? "";
      const sections = lines.filter((l) => /^## /.test(l.line)).map((l) => l.line.slice(3));
      if (JSON.stringify(sections) !== JSON.stringify(LIBRARY_SECTIONS[kind]))
        bad(path, 1, `sections of a ${kind}: ${sections.join(", ")}`);
      if (path !== `library/${kind}s/${base(path)}`)
        bad(path, 1, `a ${kind} belongs in library/${kind}s/`);
      const id = /^id: (\S+)$/m.exec(text)?.[1] ?? "";
      if (!/^lib-[0-9a-hjkmnp-tv-z]{5}$/.test(id)) bad(path, 2, `library id ${id}`);
    }

    // Archify blocks: the info string names a valid type and an id; the body is JSON.
    const fences = [...text.matchAll(/^```archify (\S+) id=(\S+)\n([\s\S]*?)\n```$/gm)];
    for (const f of fences) {
      if (!["architecture", "workflow", "sequence", "dataflow", "lifecycle"].includes(f[1]))
        bad(path, 1, `archify type ${f[1]}`);
      try {
        JSON.parse(f[3]);
      } catch {
        bad(path, 1, `archify block ${f[2]} is not JSON`);
      }
    }
    if (/```wf-diagram/.test(text)) bad(path, 1, "an API-form wf-diagram fence leaked into a file");
  }
  return problems;
}

describe("(a) grammar of every file", () => {
  test("every file follows contract 1.3–1.5", () => {
    expect(checkGrammar(disk)).toEqual([]);
  });

  test("the layout matches contract 1.2", () => {
    const paths = Object.keys(exported);
    expect(paths).toContain("workflow.toml");
    expect(paths).toContain("authors.md");
    expect(paths).toContain("glossary.md");
    // explicit groups have _group.md, the implicit docs group and the root have none
    expect(paths).toContain("issues/wf/_group.md");
    expect(paths).toContain("issues/platform/auth/_group.md");
    expect(paths.some((p) => p === "issues/_group.md")).toBe(false);
    expect(paths.some((p) => p === "issues/docs/_group.md")).toBe(false);
    // issues are folders with goal.md; extra docs live inside
    expect(paths).toContain("issues/wf/web/live-board-updates/goal.md");
    expect(paths).toContain("issues/wf/web/live-board-updates/notes/research.md");
    expect(
      paths
        .filter((p) => p.startsWith("library/"))
        .every((p) => /^library\/(patterns|playbooks|gotchas|decisions)\/[a-z0-9-]+\.md$/.test(p)),
    ).toBe(true);
    expect(paths.filter((p) => p.endsWith("/goal.md")).length).toBe(26);
  });

  test("workflow.toml holds the keys of contract 1.4", () => {
    const toml = exported["workflow.toml"];
    expect(toml).toContain("wf_format = 1");
    for (const table of [
      "workspace",
      "leases",
      "staleness",
      "context",
      "archify",
      "lint",
      "server",
    ])
      expect(toml).toContain(`[${table}]`);
    expect(toml).toContain('author = "shruti"');
    expect(toml).toContain('id_prefix = "wf"');
  });

  test("an archify block replaces every wf-diagram fence, with its type and pretty JSON", () => {
    const goal = exported["issues/wf/web/live-board-updates/goal.md"];
    expect(goal).toContain('```archify architecture id=live-board-architecture\n{\n  "meta"');
    const plan = exported["issues/wf/web/live-board-updates/plan.md"];
    expect(plan).toContain("```archify workflow id=sse-delivery-flow\n");
    // every diagram of the world appears as a block in some file, and no file holds a fence
    // of the API form (the daemon sends those, files never hold them)
    const loaded = loadWorkspace(exported, { now: RECORDED, binary: BINARY });
    for (const id of Object.keys(loaded.diagrams))
      expect(Object.values(exported).some((t) => t.includes(` id=${id}\n`))).toBe(true);
    for (const t of Object.values(exported)) expect(diagramIds(t)).toEqual([]);
  });

  test("the bad-YAML issue keeps its invalid frontmatter", () => {
    const text = exported["issues/wf/web/tab-title-count/goal.md"];
    expect(text.split("\n")[6]).toBe("owner: @shruti");
  });
});

// ---------------------------------------------------------------- (b) findings

/** The nine findings the seed world is meant to show: issue, file, rule, severity, text, message. */
const DECLARED: [string, string, string, string, string, string][] = [
  [
    "wf-3k9x2",
    "plan.md",
    "S06",
    "warn",
    "probably",
    "Hedge word “probably”. State the fact, or list it as an assumption.",
  ],
  [
    "wf-3k9x2",
    "current_state.md",
    "S01",
    "warn",
    "The mock server in `web/mock/` plays",
    "Sentence has 32 words (limit 25). Split it into two sentences.",
  ],
  [
    "wf-k8dv6",
    "goal.md",
    "S06",
    "warn",
    "probably the cheapest",
    "Hedge word “probably”. State the fact, or list it as an assumption.",
  ],
  [
    "wf-k8dv6",
    "goal.md",
    "S06",
    "warn",
    "may want to extend",
    "Hedge word “may”. Say who decides, and when.",
  ],
  [
    "wf-k8dv6",
    "goal.md",
    "S01",
    "warn",
    "The writing standard bans them, but no rule enforces the ban",
    "Sentence has 33 words (limit 25). Split it into two sentences.",
  ],
  ["wf-k8dv6", "goal.md", "S03", "info", "are being skipped by the matcher", "passive"],
  [
    "wf-k8dv6",
    "plan.md",
    "S06",
    "warn",
    "is probably short",
    "Hedge word “probably”. State the fact, or list it as an assumption.",
  ],
  [
    "wf-k8dv6",
    "plan.md",
    "S05",
    "warn",
    "The list gets read from the writing standard.",
    "Step does not start with an imperative verb.",
  ],
  [
    "wf-k8dv6",
    "plan.md",
    "S01",
    "warn",
    "Match every word of the list with the matcher of S09, print the line",
    "Sentence has 31 words (limit 25). Split it into two sentences.",
  ],
];

describe("(b) every finding the seed world shows is found in the text", () => {
  const files = exported;
  const loaded = loadWorkspace(files, { now: RECORDED, binary: BINARY });
  const dirs = loaded.issueDirs;

  test("nine findings in two issues", () => {
    expect(DECLARED.length).toBe(9);
    expect(new Set(DECLARED.map((d) => d[0]))).toEqual(new Set(["wf-3k9x2", "wf-k8dv6"]));
  });

  for (const [id, file, rule, severity, find, message] of DECLARED) {
    test(`${id} ${file} ${rule}: ${find.slice(0, 40)}`, () => {
      const path = `${dirs[id]}/${file}`;
      const line = posOf(files[path], find).line;
      const found = (loaded.diagnostics[path] ?? []).filter(
        (d) => d.rule === rule && d.line === line,
      );
      expect(found.length).toBeGreaterThanOrEqual(1);
      // S03 words its own rewrite; the other messages are fixed text.
      const hit = rule === "S03" ? found[0] : found.find((d) => d.message === message);
      expect(hit, `${rule} on line ${line}`).toBeDefined();
      expect(hit?.severity).toBe(severity);
      if (rule === "S03")
        expect(hit?.message).toMatch(/^Passive voice\. Name the actor: “the matcher \w+ …”\.$/);
    });
  }

  test("the rules find nothing else in the S01/S03/S05/S06 family", () => {
    const rules = new Set(["S01", "S03", "S05", "S06"]);
    const found = Object.values(loaded.diagnostics)
      .flat()
      .filter((d) => rules.has(d.rule));
    expect(found.length).toBe(DECLARED.length);
  });

  test("F001 for wf-7yq2m sits at the YAML error position", () => {
    const d = loaded.diagnostics["issues/wf/web/tab-title-count/goal.md"].find(
      (x) => x.rule === "F001",
    );
    expect(d).toMatchObject({
      severity: "error",
      line: 7,
      col: 8,
      message: "Invalid YAML at line 7, column 8: found character `@` that cannot start any token.",
      fix: 'Quote the handle: `owner: "@shruti"`.',
    });
    expect(loaded.frontmatter["wf-7yq2m"]).toEqual({ ok: false, line: 7 });
    expect(loaded.world.issues.find((i) => i.goal.id === "wf-7yq2m")?.goal.owner).toBe("shruti");
  });

  test("F011 for the broken diagram points at its block", () => {
    const hits = Object.entries(loaded.diagnostics).flatMap(([p, l]) =>
      l.filter((d) => d.rule === "F011").map((d) => ({ p, d })),
    );
    expect(hits).toHaveLength(1);
    const text = files[hits[0].p];
    expect(text.split("\n")[hits[0].d.line - 1]).toContain(
      "```archify workflow id=broken-release-flow",
    );
    expect(hits[0].d.message).toMatch(/^Archify render failed with 3 errors\. /);
    expect(loaded.diagrams["broken-release-flow"].status).toBe("invalid");
    expect(loaded.diagrams["broken-release-flow"].errors.length).toBe(3);
  });

  test("S07 and S08 come from the EARS parser, on the criterion line", () => {
    const path = `${dirs["wf-k8dv6"]}/goal.md`;
    const list = loaded.diagnostics[path];
    const s07 = list.filter((d) => d.rule === "S07").map((d) => d.message);
    expect(s07).toEqual(["SC-1 cannot be measured.", "SC-2 cannot be measured."]);
    expect(list.filter((d) => d.rule === "S08").map((d) => d.message)).toEqual([
      "SC-2 does not match an EARS pattern.",
    ]);
    const d = list.find((x) => x.rule === "S07");
    expect(files[path].split("\n")[(d?.line ?? 1) - 1]).toMatch(/^- \[ \] SC-1: /);
  });

  test("S09 is off in the seed workspace, and turning it on finds only the word card", () => {
    expect(
      Object.values(loaded.diagnostics)
        .flat()
        .filter((d) => d.rule === "S09"),
    ).toEqual([]);
    expect(files["workflow.toml"]).toContain('disable = ["S09"]');
    const on = loadWorkspace(
      {
        ...files,
        "workflow.toml": files["workflow.toml"].replace('disable = ["S09"]', "disable = []"),
      },
      { now: RECORDED },
    );
    const hits = Object.values(on.diagnostics)
      .flat()
      .filter((d) => d.rule === "S09");
    expect(hits.length).toBeGreaterThan(20);
    expect(hits.every((d) => /^“cards?” is on the avoid list\./.test(d.message))).toBe(true);
  });

  test("the libraries and the dangling references of the seeds give no F009", () => {
    expect(
      Object.values(loaded.diagnostics)
        .flat()
        .filter((d) => d.rule === "F009"),
    ).toEqual([]);
  });

  test("diagnostics carry only F and S rules", () => {
    for (const d of Object.values(loaded.diagnostics).flat())
      expect(d.rule).toMatch(/^(F\d{3}|S\d{2})$/);
  });
});

// ---------------------------------------------------------------- the loaded workspace

describe("(c) the loaded workspace", () => {
  const loaded = loadWorkspace(exported, { now: RECORDED, binary: BINARY });

  test("has the groups, issues and library items of the seed world", () => {
    expect(loaded.world.issues.length).toBe(26);
    expect(loaded.world.library.length).toBe(10);
    expect(loaded.world.groups.map((g) => g.slug).sort()).toEqual(
      ["auth", "core", "docs", "issues", "platform", "skills", "web", "wf"].sort(),
    );
    const docs = loaded.world.groups.find((g) => g.slug === "docs");
    expect(docs?.implicit).toBe(true);
    expect(loaded.world.groups.find((g) => g.slug === "wf")?.implicit).toBe(false);
  });

  test("explicit groups keep their ids and implicit groups get a stable one", () => {
    const byId = new Map(loaded.world.groups.map((g) => [g.id, g]));
    for (const [id, slug, parent] of [
      ["g-wf001", "wf", "issues"],
      ["g-core1", "core", "wf"],
      ["g-web01", "web", "wf"],
      ["g-skl01", "skills", "wf"],
      ["g-plat1", "platform", "issues"],
      ["g-auth1", "auth", "platform"],
    ] as const) {
      const g = byId.get(id);
      expect(g?.slug, id).toBe(slug);
      expect(g?.implicit, id).toBe(false);
      expect(byId.get(g?.parent ?? "")?.slug, id).toBe(parent);
    }
    // `docs` has no `_group.md`: its id is a hash of its folder, and it sorts last.
    const docs = loaded.world.groups.find((g) => g.slug === "docs");
    expect(docs?.id).toMatch(/^g-[0-9a-hjkmnp-tv-z]{5}$/);
    expect(docs?.order).toBe(3);
    const again = loadWorkspace(exported, { now: RECORDED, binary: BINARY });
    expect(again.world.groups.map((g) => g.id)).toEqual(loaded.world.groups.map((g) => g.id));
  });

  test("keeps the text of every issue file and reports where things sit", () => {
    const id = "wf-3k9x2";
    expect(Object.keys(loaded.texts[id]).sort()).toEqual([
      "changes.md",
      "current_state.md",
      "decisions.md",
      "goal.md",
      "learnings.md",
      "plan.md",
    ]);
    const goal = `${loaded.issueDirs[id]}/goal.md`;
    const a = loaded.anchors[goal];
    const lines = loaded.texts[id]["goal.md"]?.split("\n") ?? [];
    expect(lines[a.status.line - 1]).toBe("status: in_progress");
    expect(lines[a["SC-3"].line - 1]).toMatch(/^- \[x\] SC-3: /);
    expect(a["SC-4"].end).toBeGreaterThan(a["SC-4"].line);
    const plan = loaded.anchors[`${loaded.issueDirs[id]}/plan.md`];
    expect(Object.keys(plan)).toEqual(
      expect.arrayContaining(["T-1", "T-3", "T-3.1", "T-3.2", "A1"]),
    );
    const state = loaded.anchors[`${loaded.issueDirs[id]}/current_state.md`];
    expect(Object.keys(state)).toEqual(expect.arrayContaining(["Q-4m2pz", "state"]));
    const changes = loaded.anchors[`${loaded.issueDirs[id]}/changes.md`];
    expect(Object.keys(changes)).toContain("C-7k2q9");
    // the byte span covers the line
    const text = loaded.texts[id]["goal.md"] ?? "";
    const bytes = new TextEncoder().encode(text);
    const s = a.status.span;
    expect(new TextDecoder().decode(bytes.slice(s[0], s[1]))).toBe("status: in_progress");
  });

  test("builds the diagrams from the archify blocks", () => {
    expect(Object.keys(loaded.diagrams).sort()).toEqual([
      "broken-release-flow",
      "live-board-architecture",
      "skills-flow",
      "sse-delivery-flow",
    ]);
    const d = loaded.diagrams["live-board-architecture"];
    expect(d).toMatchObject({
      type: "architecture",
      title: "Live board architecture",
      file: "goal.md",
      status: "unavailable",
      nodes: 14,
      url: "",
    });
    const text = loaded.texts["wf-3k9x2"]["goal.md"] ?? "";
    expect(text.split("\n")[d.line - 1]).toBe("```archify architecture id=live-board-architecture");
    expect(JSON.parse(d.source).meta.title).toBe("Live board architecture");
    // the prose the API sends names the diagram
    expect(loaded.world.issues.find((i) => i.goal.id === "wf-3k9x2")?.context).toContain(
      "```wf-diagram\nlive-board-architecture\n```",
    );
  });

  test("lists docs with markdown first and the binary after it", () => {
    const src = loaded.world.issues.find((i) => i.goal.id === "wf-3k9x2");
    expect(src?.docs?.map((d) => d.path)).toEqual(["notes/research.md", "evidence/sc2.png"]);
    expect(src?.docs?.[0].title).toBe("Delivering board updates");
    expect(src?.docs?.[1].bytes).toBe(95362);
    expect(loaded.assets[SC2]).toEqual({ url: `/files/${SC2}`, bytes: 95362 });
  });

  test("the text of a library item and its path are reported", () => {
    const item = loaded.world.library[0];
    expect(loaded.libraryPaths[item.id]).toBe(libraryPath(item));
    expect(loaded.libraryTexts[item.id]).toContain(`id: ${item.id}`);
  });

  test("state bodies keep their word count", () => {
    const id = "wf-3k9x2";
    const words = stateBody(loaded.texts[id]["current_state.md"] ?? "")
      .split(/\s+/)
      .filter(Boolean).length;
    expect(words).toBeGreaterThan(100);
    expect(rev(loaded.texts[id]["goal.md"] ?? "")).toHaveLength(8);
  });
});
