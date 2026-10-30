// Guards the seed world, which lives in the markdown files under mock/workspace: every roster
// issue exists with its status, IDs follow the grammar, every signal of the contract appears on
// the issue that is meant to show it, the inbox holds the six requests, and every [[ref]] and
// diagram reference resolves. The world is what the store reads from those files.
import { beforeAll, describe, expect, it } from "vitest";
import type { Derived } from "./derive";
import { EVENT_TARGETS } from "./events";
import { diagramIds } from "./md/render";
import type { LoadedWorkspace } from "./md/types";
import { SAMPLE } from "./sample-files";
import type { IssueSrc, WorldSrc } from "./source";
import { createStore } from "./store";
import { toDate } from "./time";
import { CROCKFORD } from "./util";

const NOW = Date.now();
const CROCKFORD_5 = new RegExp(`^[${CROCKFORD}]{5}$`);

/** Roster of UI_BUILD.md and the task brief: id → status. */
const ROSTER: Record<string, string> = {
  "wf-3k9x2": "in_progress",
  "wf-b1d7v": "in_progress",
  "wf-skf01": "in_progress",
  "wf-x5hd3": "in_progress",
  "wf-t3jp5": "in_progress",
  "wf-m3tq8": "done",
  "wf-9gr4k": "review",
  "wf-q4fs9": "in_progress",
  "wf-w8vz4": "blocked",
  "wf-k8dv6": "planned",
  "wf-r6jk2": "in_progress",
  "wf-a7ne5": "in_progress",
  "wf-f6qa2": "backlog",
  "wf-c2pn6": "done",
  "wf-h2tb7": "in_progress",
  "wf-e6kc1": "planned",
  "wf-7yq2m": "planned",
  "wf-z9mw2": "review",
  "wf-v1cm9": "backlog",
  "wf-p2hs4": "review",
  "wf-g5rx8": "planned",
  "wf-n7vy3": "cancelled",
  "wf-ss0lo": "backlog",
  "wf-y4bz7": "planned",
};

/** priority, size, owner, coordinator (`claimed_by`) per roster issue, from the brief. */
const ATTRS: Record<string, [string, string, string | undefined, string | undefined]> = {
  "wf-3k9x2": ["high", "m", "shruti", "claude-opus"],
  "wf-b1d7v": ["high", "l", "mudit", "claude-opus"],
  "wf-skf01": ["medium", "s", "shruti", "claude-sonnet"],
  "wf-x5hd3": ["medium", "m", "shruti", "claude-sonnet"],
  "wf-t3jp5": ["high", "m", "mudit", "codex"],
  "wf-m3tq8": ["high", "m", "mudit", "codex"],
  "wf-9gr4k": ["medium", "s", "mudit", "claude-sonnet"],
  "wf-q4fs9": ["medium", "s", "mudit", "codex"],
  "wf-w8vz4": ["medium", "m", "mudit", "codex"],
  "wf-k8dv6": ["low", "s", "mudit", undefined],
  "wf-r6jk2": ["medium", "s", "shruti", "claude-opus"],
  "wf-a7ne5": ["low", "m", "shruti", undefined],
  "wf-f6qa2": ["none", "s", undefined, undefined],
  "wf-c2pn6": ["medium", "m", "shruti", "claude-sonnet"],
  "wf-h2tb7": ["medium", "m", "shruti", "cursor-bot"],
  "wf-e6kc1": ["low", "xs", "shruti", undefined],
  "wf-7yq2m": ["medium", "xs", "shruti", undefined],
  "wf-z9mw2": ["high", "m", "shruti", "claude-sonnet"],
  "wf-v1cm9": ["low", "s", undefined, undefined],
  "wf-p2hs4": ["medium", "s", "shruti", "claude-opus"],
  "wf-g5rx8": ["urgent", "m", "mudit", undefined],
  "wf-n7vy3": ["none", "l", "mudit", undefined],
  "wf-ss0lo": ["medium", "l", "mudit", undefined],
  "wf-y4bz7": ["low", "m", "mudit", "claude-opus"],
};

/** Group IDs fixed by UI_BUILD.md. They predate the Crockford rule (they hold o, l or u). */
const FIXED_GROUP_IDS = ["g-wf001", "g-core1", "g-web01", "g-skl01", "g-plat1", "g-auth1"];
/** The roster ID of "Add SSO login" is a pun and holds an l and an o. Other agents rely on it. */
const FIXED_ISSUE_IDS = ["wf-ss0lo"];

let world: WorldSrc;
let source: LoadedWorkspace;
let d: Derived;
let withArchify: Derived;

beforeAll(() => {
  const store = createStore({ clock: () => NOW, disk: SAMPLE });
  world = store.world;
  source = store.source;
  d = store.derived;
  withArchify = createStore({ clock: () => NOW, archify: true, disk: SAMPLE }).derived;
});

const summary = (id: string) => {
  const s = d.snapshot.issues.find((i) => i.id === id);
  if (!s) throw new Error(`missing issue ${id}`);
  return s;
};
const detail = (id: string) => {
  const x = d.details.get(id);
  if (!x) throw new Error(`missing detail ${id}`);
  return x;
};
const rules = (id: string) => detail(id).diagnostics.map((x) => x.rule);
const src = (id: string): IssueSrc => {
  const s = world.issues.find((i) => i.goal.id === id);
  if (!s) throw new Error(`missing source ${id}`);
  return s;
};

describe("config", () => {
  it("names the workspace and sets the limits", () => {
    expect(world.config).toEqual({
      name: "wf",
      wf_format: 1,
      id_prefix: "wf",
      issues_dir: "issues",
      library_dir: "library",
      leases_minutes: 60,
      staleness: { issue_hours: 24, task_hours: 4 },
      author: "shruti",
      archify: "unavailable",
    });
  });

  it("gives every store its own working copy of the files", () => {
    const a = createStore({ clock: () => NOW, disk: SAMPLE });
    const b = createStore({ clock: () => NOW, disk: SAMPLE });
    const goal = a.filePath("wf-3k9x2", "goal.md");
    a.mutate("shruti", "wf-3k9x2", (w) => {
      w.write(
        goal,
        (w.read(goal) ?? "").replace("title: Push board updates over SSE", "title: Changed"),
      );
      return { touches: [{ file: goal, anchors: "all" }], activity: [] };
    });
    expect(a.summary("wf-3k9x2")?.title).toBe("Changed");
    expect(b.summary("wf-3k9x2")?.title).toBe("Push board updates over SSE");
    expect(b.text(goal)).not.toBe(a.text(goal));
  });
});

describe("roster", () => {
  it("holds every roster issue with its status", () => {
    for (const [id, status] of Object.entries(ROSTER)) {
      expect(summary(id).status, id).toBe(status);
    }
  });

  it("gives each roster issue its priority, size, owner and coordinator", () => {
    for (const [id, [priority, size, owner, coordinator]] of Object.entries(ATTRS)) {
      const g = src(id).goal;
      expect([g.priority, g.size, g.owner, g.claimed_by], id).toEqual([
        priority,
        size,
        owner,
        coordinator,
      ]);
    }
  });

  it("adds no more than 3 issues beyond the roster", () => {
    const extra = d.snapshot.issues.filter((i) => !(i.id in ROSTER));
    expect(extra.length).toBeLessThanOrEqual(3);
    for (const e of extra) expect(e.status).toBe("done");
  });

  it("puts each issue in its group", () => {
    const groupOf = (id: string) => summary(id).group_path.join("/");
    expect(groupOf("wf-3k9x2")).toBe("wf/web");
    expect(groupOf("wf-b1d7v")).toBe("wf");
    expect(groupOf("wf-g5rx8")).toBe("wf");
    expect(groupOf("wf-n7vy3")).toBe("wf");
    expect(groupOf("wf-skf01")).toBe("wf/skills");
    expect(groupOf("wf-t3jp5")).toBe("wf/core");
    expect(groupOf("wf-ss0lo")).toBe("platform/auth");
    expect(groupOf("wf-y4bz7")).toBe("platform/auth");
    expect(summary("wf-r6jk2").group_path).toEqual(["docs"]);
    expect(summary("wf-a7ne5").group_path).toEqual(["docs"]);
    expect(summary("wf-f6qa2").group_path).toEqual(["docs"]);
  });

  it("builds the group tree of the brief", () => {
    const root = d.snapshot.groups;
    const titles = (g: typeof root) => g.children.map((c) => c.title);
    expect(titles(root)).toEqual(["wf", "platform", "docs"]);
    const wf = root.children[0];
    expect(titles(wf)).toEqual(["core", "web", "skills"]);
    expect(wf.color).toBe(7);
    expect(wf.owner).toBe("shruti");
    expect(wf.children.map((c) => c.color)).toEqual([2, 1, 3]);
    const platform = root.children[1];
    expect(platform.color).toBe(4);
    expect(platform.children[0].title).toBe("auth");
    expect(platform.children[0].color).toBe(8);
    expect(root.children[2].implicit).toBe(true);
  });

  it("uses all six authors", () => {
    const used = new Set<string>();
    for (const s of world.issues) {
      for (const c of s.changes) used.add(c.author);
      for (const x of s.decisions) used.add(x.author);
      for (const l of s.learnings) used.add(l.author);
    }
    expect([...used].sort()).toEqual(
      ["claude-opus", "claude-sonnet", "codex", "cursor-bot", "mudit", "shruti"].sort(),
    );
    expect(world.authors.map((a) => a.handle).sort()).toEqual([...used].sort());
  });
});

describe("ids", () => {
  it("follow the Crockford grammar", () => {
    const bad: string[] = [];
    const check = (id: string, prefix: string) => {
      if (!id.startsWith(prefix) || !CROCKFORD_5.test(id.slice(prefix.length))) bad.push(id);
    };
    for (const s of world.issues) {
      if (!FIXED_ISSUE_IDS.includes(s.goal.id)) check(s.goal.id, "wf-");
      for (const c of s.changes) check(c.id, "C-");
      for (const x of s.decisions) check(x.id, "D-");
      for (const l of s.learnings) check(l.id, "L-");
      for (const r of s.state?.needs_you ?? []) check(r.id, "Q-");
    }
    for (const l of world.library) check(l.id, "lib-");
    for (const g of world.groups) if (!FIXED_GROUP_IDS.includes(g.id)) check(g.id, "g-");
    expect(bad).toEqual([]);
  });

  it("are unique, and anchors are unique inside an issue", () => {
    const ids = world.issues.map((s) => s.goal.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(new Set(world.library.map((l) => l.id)).size).toBe(world.library.length);
    const slugs = world.issues.map((s) => `${s.group}/${s.slug}`);
    expect(new Set(slugs).size).toBe(slugs.length);
    for (const s of world.issues) {
      const anchors = [
        ...s.changes.map((c) => c.id),
        ...s.decisions.map((x) => x.id),
        ...s.learnings.map((l) => l.id),
        ...(s.state?.needs_you ?? []).map((r) => r.id),
      ];
      expect(new Set(anchors).size, s.goal.id).toBe(anchors.length);
    }
  });

  it("keeps entries in time order inside each log", () => {
    for (const s of world.issues) {
      for (const log of [s.changes, s.decisions, s.learnings]) {
        const ts = log.map((e) => Date.parse(e.ts));
        expect(ts, s.goal.id).toEqual([...ts].sort((a, b) => a - b));
      }
    }
  });

  it("keeps every timestamp in the past, in +05:30, with minute precision", () => {
    const re = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}\+05:30$/;
    for (const s of world.issues) {
      expect(s.goal.created, s.goal.id).toMatch(re);
      for (const c of s.changes) {
        expect(c.ts).toMatch(re);
        expect(Date.parse(c.ts), `${s.goal.id} ${c.id}`).toBeLessThanOrEqual(NOW);
      }
      if (s.state) expect(Date.parse(s.state.updated_at)).toBeLessThanOrEqual(NOW);
    }
  });

  it("never lets a live lease run past the lease length", () => {
    for (const s of world.issues) {
      const until = [
        s.goal.lease_until,
        ...(s.plan?.phases.flatMap((p) => p.tasks.map((t) => t.lease_until)) ?? []),
      ];
      for (const u of until)
        if (u) expect(Date.parse(u) - NOW, s.goal.id).toBeLessThanOrEqual(61 * 60_000);
    }
  });
});

describe("derive", () => {
  it("keeps every summary line within 120 characters and every state under 400 words", () => {
    for (const s of d.snapshot.issues) {
      if (s.state_summary) expect(s.state_summary.length, s.id).toBeLessThanOrEqual(120);
      const st = detail(s.id).state;
      if (st) expect(st.word_count, s.id).toBeLessThanOrEqual(400);
      expect(rules(s.id), s.id).not.toContain("Q008");
    }
  });

  it("resolves every [[ref]] and every author", () => {
    for (const s of d.snapshot.issues) {
      expect(rules(s.id), s.id).not.toContain("F009");
      expect(rules(s.id), s.id).not.toContain("Q012");
    }
    for (const lib of d.library.values()) {
      expect(
        lib.diagnostics.map((x) => x.rule),
        lib.summary.id,
      ).not.toContain("F009");
      expect(lib.source.length, lib.summary.id).toBeGreaterThan(0);
    }
  });

  it("references only diagrams that exist", () => {
    for (const s of world.issues) {
      const md = [s.context, s.out_of_scope, s.links, s.plan?.approach];
      for (const id of md.flatMap(diagramIds)) expect(source.diagrams[id], id).toBeDefined();
    }
    expect(
      detail("wf-3k9x2")
        .diagrams.map((x) => x.id)
        .sort(),
    ).toEqual(["live-board-architecture", "sse-delivery-flow"]);
    expect(detail("wf-skf01").diagrams.map((x) => [x.id, x.file])).toEqual([
      ["skills-flow", "goal.md"],
    ]);
    expect(detail("wf-g5rx8").diagrams.map((x) => [x.id, x.file])).toEqual([
      ["broken-release-flow", "plan.md"],
    ]);
  });
});

describe("wf-3k9x2, the dogfood issue", () => {
  it("has the criteria SC-1 to SC-5 in their states", () => {
    const c = detail("wf-3k9x2").criteria;
    expect(c.map((x) => x.state)).toEqual(["verified", "verified", "claimed", "open", "open"]);
    expect(c[0].text).toBe(
      "When an agent appends to `changes.md`, the board shall show the entry within 2 s.",
    );
    expect(c[0].verify).toBe("cargo test -p wf-index live_append");
    expect(c[1].verify).toBe("manual");
    expect(c[1].verified_by).toBe("shruti");
    expect(c[2].evidence).toBeUndefined();
    expect(c[3].scenario).toMatch(/^Given .* \/ When .* \/ Then /);
    expect(c[4].verify).toBe("cargo test -p wf-index echo_suppression");
    expect(c.map((x) => x.ears.pattern)).toEqual([
      "event",
      "unwanted",
      "state",
      "event",
      "ubiquitous",
    ]);
  });

  it("has a plan with 3 phases, 5 tasks and 3 lanes", () => {
    const p = detail("wf-3k9x2").plan;
    expect(p?.revision).toBe(3);
    expect(p?.updated_by).toBe("claude-opus");
    expect(p?.phases.map((x) => x.name)).toEqual([
      "Index deltas",
      "Live transport",
      "Board client",
    ]);
    const tasks = p?.phases.flatMap((x) => x.tasks) ?? [];
    expect(tasks.map((t) => [t.id, t.status, t.lane])).toEqual([
      ["T-1", "done", "core"],
      ["T-2", "review", "core"],
      ["T-3", "in_progress", "server"],
      ["T-4", "todo", "web"],
      ["T-5", "todo", "web"],
    ]);
    const t3 = tasks[2];
    expect(t3.claimed_by).toBe("codex");
    expect(t3.lease).toBe("live");
    expect(t3.depends_on).toEqual(["T-1", "T-2"]);
    expect(t3.steps.map((s) => s.checked)).toEqual([true, false]);
    expect(tasks[3].ready).toBe(true);
    expect(tasks[4].ready).toBe(false);
    expect(p?.assumptions.map((a) => [a.id, a.state])).toEqual([
      ["A1", "confirmed"],
      ["A2", "open"],
    ]);
    expect(p?.prior_art.map((r) => r.id)).toContain("lib-4tz7c");
  });

  it("has a current state with a blocking approval for the acting author", () => {
    const st = detail("wf-3k9x2").state;
    expect(st?.summary).toBe("Delta stream runs end to end; lagged-client resync is in flight.");
    expect(st?.updated_by).toBe("claude-opus");
    const q = st?.needs_you[0];
    expect(q).toMatchObject({
      id: "Q-4m2pz",
      kind: "approval",
      urgency: "blocking",
      from: "claude-opus",
      to: "shruti",
      options: ["approve", "reject"],
      ref: "[[#D-7f3k2]]",
      question: "Approve keeping SSE instead of WebSocket for the board?",
    });
    expect(st?.failed_attempts.length).toBe(1);
    expect(st?.next_steps).toHaveLength(3);
    expect(st?.next_steps[2]).toBe("Verify [[#SC-3]] with its command.");
    expect(st?.in_flight_tasks).toContain("T-3");
  });

  it("has about 10 changes of every kind the brief names", () => {
    const ch = detail("wf-3k9x2").changes;
    expect(ch.length).toBeGreaterThanOrEqual(10);
    expect(ch.length).toBeLessThanOrEqual(12);
    const kinds = new Set(ch.map((c) => c.kind));
    for (const k of [
      "progress",
      "research",
      "test",
      "failure",
      "fix",
      "verify",
      "review",
      "answer",
    ])
      expect(kinds.has(k as never), k).toBe(true);
    expect(new Set(ch.map((c) => c.author))).toEqual(
      new Set(["codex", "claude-opus", "claude-sonnet", "shruti"]),
    );
    const verify = ch.find((c) => c.kind === "verify" && c.author === "codex");
    expect(verify).toMatchObject({ result: "pass", criteria: ["SC-1"] });
    expect(verify?.evidence).toBeTruthy();
    const answer = ch.find((c) => c.kind === "answer");
    expect(answer?.body_md).toMatch(/\*\*Q:\*\*[\s\S]*\*\*A:\*\*/);
    expect(ch.some((c) => c.commit)).toBe(true);
    expect(ch.some((c) => c.files.length > 0)).toBe(true);
    const days = (Date.parse(ch[ch.length - 1].ts) - Date.parse(ch[0].ts)) / 86_400_000;
    expect(days).toBeGreaterThan(1.5);
    expect(days).toBeLessThan(2.2);
  });

  it("has the decisions, the supersession and three learnings", () => {
    const x = detail("wf-3k9x2");
    const byId = new Map(x.decisions.map((e) => [e.id, e]));
    expect(byId.get("D-7f3k2")).toMatchObject({
      status: "accepted",
      supersedes: "D-2ab3c",
      topic: "live-transport",
    });
    expect(byId.get("D-7f3k2")?.consequences_md).toBeTruthy();
    expect(byId.get("D-7f3k2")?.revisit_md).toBeTruthy();
    expect(byId.get("D-2ab3c")?.superseded_by).toBe("D-7f3k2");
    expect(byId.get("D-5mh8q")).toMatchObject({ status: "proposed", topic: "multi-tab" });
    const l = new Map(x.learnings.map((e) => [e.id, e]));
    expect(x.learnings).toHaveLength(3);
    expect(l.get("L-2gk7r")).toMatchObject({ kind: "gotcha", promoted_to: "lib-4tz7c" });
    expect(l.get("L-9mz4e")).toMatchObject({ kind: "tip", promote: "candidate" });
    expect(l.get("L-9mz4e")?.promoted_to).toBeUndefined();
    expect(l.get("L-6ct3p")).toMatchObject({ kind: "pattern", promote: "no" });
  });

  it("has the planted lint findings", () => {
    const diags = detail("wf-3k9x2").diagnostics;
    expect(diags.find((x) => x.rule === "S06")?.file).toMatch(/plan\.md$/);
    expect(diags.find((x) => x.rule === "S01")?.file).toMatch(/current_state\.md$/);
    const q010 = diags.filter((x) => x.rule === "Q010");
    expect(q010).toHaveLength(1);
    expect(q010[0].message).toMatch(/^SC-3 /);
    for (const x of diags) expect(x.line, `${x.rule} ${x.file}`).toBeGreaterThan(1);
  });

  it("has a research note and a screenshot", () => {
    const docs = detail("wf-3k9x2").docs;
    expect(docs.map((x) => [x.path, x.kind])).toEqual([
      ["notes/research.md", "markdown"],
      ["evidence/sc2.png", "image"],
    ]);
    // The image is served by the bundler (a hashed asset in a build).
    expect(docs[1].url).toMatch(/sc2.*\.png/);
    expect(docs[1].size).toBe(95362);
  });

  it("holds a live coordinator lease", () => {
    const s = summary("wf-3k9x2");
    expect(s.coordinator).toMatchObject({ holder: "claude-opus", state: "live" });
    expect(s.lease_holders.sort()).toEqual(["claude-opus", "codex"]);
    expect(s.priority).toBe("high");
    expect(s.size).toBe("m");
    expect(s.owner).toBe("shruti");
  });
});

describe("the other rich issues", () => {
  it("wf-b1d7v is the umbrella milestone", () => {
    const s = summary("wf-b1d7v");
    expect(s.labels).toContain("milestone");
    expect(s.group_path).toEqual(["wf"]);
    expect(s.due).toBeDefined();
    const days = Math.round((Date.parse(`${s.due}T12:00+05:30`) - NOW) / 86_400_000);
    expect(days).toBe(9);
    expect(s.owner).toBe("mudit");
    expect(s.coordinator).toMatchObject({ holder: "claude-opus", state: "live" });
    const x = detail("wf-b1d7v");
    const fyi = x.state?.needs_you.filter((r) => r.urgency === "fyi" && r.to === "shruti");
    expect(fyi).toHaveLength(1);
    expect(x.plan?.phases.length).toBeGreaterThanOrEqual(3);
    expect(
      new Set(x.plan?.phases.flatMap((p) => p.tasks.map((t) => t.lane))).size,
    ).toBeGreaterThanOrEqual(3);
    expect(x.criteria.length).toBeGreaterThanOrEqual(5);
    expect(x.changes.length).toBeGreaterThanOrEqual(3);
    expect(x.changes.length).toBeLessThanOrEqual(6);
  });

  it("wf-skf01 holds a diagram, a live T-2 lease and a blocking question", () => {
    const x = detail("wf-skf01");
    expect(x.goal.context_md).toContain("```wf-diagram\nskills-flow\n```");
    const t2 = x.plan?.phases.flatMap((p) => p.tasks).find((t) => t.id === "T-2");
    expect(t2?.claimed_by).toBe("claude-sonnet");
    expect(t2?.lease).toBe("live");
    const min = (Date.parse(t2?.lease_until ?? "") - NOW) / 60_000;
    expect(min).toBeGreaterThan(17);
    expect(min).toBeLessThan(23);
    const q = x.state?.needs_you.find((r) => r.urgency === "blocking");
    expect(q).toMatchObject({ from: "claude-sonnet", to: "shruti", kind: "question" });
    expect(q?.question).toBe("Group the flowchart nodes by plugin or by phase?");
    expect(x.docs.map((f) => f.path)).toContain("notes/skill-triggers.md");
    expect(summary("wf-skf01").owner).toBe("shruti");
  });

  it("wf-x5hd3 has no open request yet and a detailed plan", () => {
    const x = detail("wf-x5hd3");
    expect(x.state?.needs_you).toEqual([]);
    expect(x.plan?.phases.length).toBeGreaterThanOrEqual(2);
    expect(x.criteria.length).toBeGreaterThanOrEqual(3);
    expect(x.changes.length).toBeGreaterThanOrEqual(3);
    const t4 = x.plan?.phases.flatMap((p) => p.tasks).find((t) => t.id === "T-4");
    expect(t4?.ready, "T-4 overlaps the live lease of wf-t3jp5").toBe(false);
  });

  it("wf-t3jp5 is in progress, not blocked yet, with a live lease on its context folder", () => {
    const s = summary("wf-t3jp5");
    expect(s.blocked_by).toEqual([]);
    expect(s.status).toBe("in_progress");
    expect(s.owner).toBe("mudit");
    expect(s.coordinator?.holder).toBe("codex");
    const x = detail("wf-t3jp5");
    expect(x.plan?.phases.flatMap((p) => p.tasks).some((t) => t.lease === "live")).toBe(true);
    expect(x.docs.map((f) => f.path)).toContain("notes/token-budget.md");
  });
});

describe("signals", () => {
  it("shows a blocking and an fyi request", () => {
    expect(summary("wf-3k9x2").signals.needs_you_blocking).toBe(1);
    expect(summary("wf-skf01").signals.needs_you_blocking).toBe(1);
    expect(summary("wf-b1d7v").signals).toMatchObject({ needs_you: 1, needs_you_blocking: 0 });
    expect(summary("wf-y4bz7").signals).toMatchObject({ needs_you: 1, needs_you_blocking: 0 });
    expect(summary("wf-9gr4k").signals).toMatchObject({ needs_you: 1, needs_you_blocking: 0 });
  });

  it("shows blocked with blocked_by", () => {
    expect(summary("wf-w8vz4")).toMatchObject({ status: "blocked", blocked_by: ["wf-r6jk2"] });
    expect(d.snapshot.issues.find((i) => i.id === "wf-r6jk2")).toBeDefined();
    expect(summary("wf-w8vz4").owner).toBe("mudit");
  });

  it("shows exactly one stale issue", () => {
    const stale = d.snapshot.issues.filter((i) => i.signals.stale).map((i) => i.id);
    expect(stale).toEqual(["wf-a7ne5"]);
    expect(rules("wf-a7ne5")).toContain("Q003");
    const tasks = detail("wf-a7ne5").plan?.phases.flatMap((p) => p.tasks) ?? [];
    expect(tasks.some((t) => t.stale)).toBe(true);
  });

  it("shows a lease that expired about 35 minutes ago (Q004)", () => {
    const s = summary("wf-q4fs9");
    expect(s.signals.lease_expired).toBe(true);
    const t = detail("wf-q4fs9")
      .plan?.phases.flatMap((p) => p.tasks)
      .find((x) => x.lease === "expired");
    expect(t?.claimed_by).toBe("claude-sonnet");
    const min = (NOW - Date.parse(t?.lease_until ?? "")) / 60_000;
    expect(min).toBeGreaterThan(33);
    expect(min).toBeLessThan(38);
    expect(rules("wf-q4fs9")).toContain("Q004");
    const others = d.snapshot.issues.filter((i) => i.signals.lease_expired).map((i) => i.id);
    expect(others).toEqual(["wf-q4fs9"]);
  });

  it("shows done with open criteria (Q001) on wf-c2pn6 only", () => {
    expect(summary("wf-c2pn6").signals.done_unmet).toBe(true);
    expect(rules("wf-c2pn6")).toContain("Q001");
    expect(summary("wf-c2pn6").progress.criteria).toMatchObject({ total: 5, verified: 3 });
    const drift = d.snapshot.issues.filter((i) => i.signals.done_unmet).map((i) => i.id);
    expect(drift).toEqual(["wf-c2pn6"]);
  });

  it("shows in progress without a plan (Q002) on wf-h2tb7, and not on xs issues", () => {
    expect(summary("wf-h2tb7")).toMatchObject({ has_plan: false });
    expect(summary("wf-h2tb7").signals.in_progress_no_plan).toBe(true);
    expect(rules("wf-h2tb7")).toContain("Q002");
    expect(summary("wf-e6kc1")).toMatchObject({ has_plan: false, size: "xs" });
    expect(summary("wf-e6kc1").signals.in_progress_no_plan).toBe(false);
    expect(rules("wf-e6kc1")).not.toContain("Q002");
    const noPlan = d.snapshot.issues.filter((i) => i.signals.in_progress_no_plan).map((i) => i.id);
    expect(noPlan).toEqual(["wf-h2tb7"]);
  });

  it("shows bad YAML on wf-7yq2m with the F001 finding at the owner line", () => {
    const x = detail("wf-7yq2m");
    expect(x.goal.frontmatter_ok).toBe(false);
    expect(x.goal.raw).toContain("owner: @shruti");
    const f001 = x.diagnostics.find((f) => f.rule === "F001");
    expect(f001?.severity).toBe("error");
    const lines = (x.goal.raw ?? "").split("\n");
    expect(lines[(f001?.line ?? 1) - 1]).toBe("owner: @shruti");
    expect(f001?.fix).toContain('owner: "@shruti"');
    expect(summary("wf-7yq2m").lint.error).toBe(1);
    expect(d.snapshot.issues.filter((i) => !detail(i.id).goal.frontmatter_ok)).toHaveLength(1);
  });

  it("shows a cancelled issue", () => {
    expect(summary("wf-n7vy3").status).toBe("cancelled");
    const x = detail("wf-n7vy3");
    expect(x.goal.out_of_scope_md).toMatch(/v1/);
    expect(x.decisions[0].status).toBe("rejected");
  });

  it("shows lots of lint on wf-k8dv6", () => {
    const r = new Set(rules("wf-k8dv6"));
    for (const id of ["S01", "S06", "S07", "S08", "Q006", "Q007", "Q010"])
      expect(r.has(id), id).toBe(true);
    expect(summary("wf-k8dv6").lint.warn + summary("wf-k8dv6").lint.info).toBeGreaterThanOrEqual(
      10,
    );
    const c = detail("wf-k8dv6").criteria;
    expect(c.some((x) => x.ears.pattern === "freeform")).toBe(true);
    expect(c.some((x) => !x.ears.measurable)).toBe(true);
  });

  it("keeps wf-m3tq8 clean: all verified, all tasks done, no lint", () => {
    const x = detail("wf-m3tq8");
    expect(x.criteria.every((c) => c.state === "verified")).toBe(true);
    expect(x.plan?.phases.flatMap((p) => p.tasks).every((t) => t.status === "done")).toBe(true);
    expect(x.diagnostics).toEqual([]);
    expect(summary("wf-m3tq8").lint).toEqual({ error: 0, warn: 0, info: 0 });
    expect(summary("wf-m3tq8").signals.done_unmet).toBe(false);
  });

  it("shows labels and due dates, one in the past", () => {
    const due = (id: string) => summary(id).due ?? "";
    const today = toDate(NOW);
    expect(due("wf-y4bz7") < today).toBe(true);
    expect(due("wf-g5rx8") > today).toBe(true);
    const days = Math.round((Date.parse(`${due("wf-g5rx8")}T12:00+05:30`) - NOW) / 86_400_000);
    expect(days).toBe(2);
    expect(d.snapshot.issues.filter((i) => i.due && i.due < today).map((i) => i.id)).toEqual([
      "wf-y4bz7",
    ]);
    expect(d.snapshot.issues.filter((i) => i.labels.length).length).toBeGreaterThanOrEqual(15);
  });

  it("shows the invalid release diagram as F011, with or without archify", () => {
    for (const run of [d, withArchify]) {
      const f011 = run.details.get("wf-g5rx8")?.diagnostics.filter((x) => x.rule === "F011") ?? [];
      expect(f011).toHaveLength(1);
      expect(f011[0].severity).toBe("error");
      expect(f011[0].file).toMatch(/plan\.md$/);
      expect(f011[0].message).toMatch(/errors?/);
      const diagram = run.details.get("wf-g5rx8")?.diagrams[0];
      expect(diagram?.status).toBe("invalid");
      expect(diagram?.errors.length).toBeGreaterThan(0);
    }
    const others = d.snapshot.issues.filter((i) => rules(i.id).includes("F011")).map((i) => i.id);
    expect(others).toEqual(["wf-g5rx8"]);
  });

  it("has a review issue with a promoted draft and a review request", () => {
    const lib = d.library.get("lib-7nq3d");
    expect(lib?.summary.status).toBe("draft");
    expect(lib?.source.map((r) => r.target)).toEqual(["wf-9gr4k#L-3nz8w"]);
    const l = detail("wf-9gr4k").learnings.find((e) => e.id === "L-3nz8w");
    expect(l?.promoted_to).toBe("lib-7nq3d");
    const q = detail("wf-9gr4k").state?.needs_you[0];
    expect(q).toMatchObject({ to: "shruti", ref: "[[lib-7nq3d]]" });
    expect(summary("wf-9gr4k").status).toBe("review");
  });
});

describe("the inbox", () => {
  it("holds the six requests", () => {
    const inbox = d.snapshot.inbox;
    expect(inbox.map((q) => q.id).sort()).toEqual(
      ["Q-2kx9r", "Q-3bw7m", "Q-4m2pz", "Q-5ys8j", "Q-6vt4c", "Q-9nh2e"].sort(),
    );
    const byId = new Map(inbox.map((q) => [q.id, q]));
    expect(byId.get("Q-4m2pz")).toMatchObject({
      issue: "wf-3k9x2",
      urgency: "blocking",
      to: "shruti",
    });
    expect(byId.get("Q-6vt4c")).toMatchObject({
      issue: "wf-skf01",
      urgency: "blocking",
      from: "claude-sonnet",
      to: "shruti",
    });
    expect(byId.get("Q-2kx9r")).toMatchObject({ issue: "wf-b1d7v", urgency: "fyi", to: "shruti" });
    expect(byId.get("Q-5ys8j")).toMatchObject({
      issue: "wf-y4bz7",
      urgency: "fyi",
      to: "mudit",
      answered: false,
    });
    expect(byId.get("Q-3bw7m")).toMatchObject({ issue: "wf-9gr4k", to: "shruti" });
    expect(byId.get("Q-9nh2e")).toMatchObject({
      issue: "wf-q4fs9",
      answered: true,
      answered_by: "mudit",
    });
    expect(inbox.filter((q) => q.answered)).toHaveLength(1);
  });

  it("puts blocking requests first and answered ones last", () => {
    const order = d.snapshot.inbox.map((q) => q.answered || q.urgency);
    expect(order.indexOf("fyi")).toBeGreaterThan(order.lastIndexOf("blocking"));
    expect(order[order.length - 1]).toBe(true);
  });
});

describe("EVENT_TARGETS", () => {
  const task = (issue: string, id: string) =>
    detail(issue)
      .plan?.phases.flatMap((p) => p.tasks)
      .find((t) => t.id === id);

  it("matches the brief", () => {
    expect(EVENT_TARGETS).toEqual({
      appendChange: { issue: "wf-3k9x2", task: "T-3" },
      rewriteState: "wf-3k9x2",
      newBlockingQuestion: "wf-x5hd3",
      leaseExpires: { issue: "wf-skf01", task: "T-2" },
      moveToReview: "wf-h2tb7",
      markBlocked: { issue: "wf-t3jp5", by: "wf-w8vz4" },
      appendDecision: "wf-skf01",
      answerFyi: { issue: "wf-y4bz7", request: "Q-5ys8j" },
    });
  });

  it("points at targets that allow each scripted event", () => {
    const t = EVENT_TARGETS;
    expect(task(t.appendChange.issue, t.appendChange.task)?.status).toBe("in_progress");
    expect(task(t.appendChange.issue, t.appendChange.task)?.steps[1]?.checked).toBe(false);
    expect(detail(t.rewriteState).state).not.toBeNull();
    expect(detail(t.newBlockingQuestion).state).not.toBeNull();
    expect(summary(t.newBlockingQuestion).status).toBe("in_progress");
    expect(task(t.leaseExpires.issue, t.leaseExpires.task)?.lease).toBe("live");
    expect(summary(t.moveToReview).status).toBe("in_progress");
    expect(summary(t.markBlocked.issue).status).toBe("in_progress");
    expect(summary(t.markBlocked.issue).blocked_by).not.toContain(t.markBlocked.by);
    expect(summary(t.markBlocked.by).status).toBe("blocked");
    expect(summary(t.appendDecision).status).toBe("in_progress");
    const r = detail(t.answerFyi.issue).state?.needs_you.find((x) => x.id === t.answerFyi.request);
    expect(r).toMatchObject({ answered: false, urgency: "fyi", to: "mudit" });
    expect(r?.options.length).toBeGreaterThan(0);
  });
});

describe("library and glossary", () => {
  it("covers every kind and status, with one item past its review date", () => {
    const lib = d.snapshot.library;
    expect(lib.length).toBeGreaterThanOrEqual(8);
    expect(new Set(lib.map((l) => l.kind))).toEqual(
      new Set(["pattern", "playbook", "gotcha", "decision"]),
    );
    expect(new Set(lib.map((l) => l.status))).toEqual(new Set(["draft", "reviewed", "retired"]));
    const overdue = lib.filter((l) => l.review_overdue);
    expect(overdue.map((l) => l.id)).toEqual(["lib-2hq6n"]);
    for (const l of lib) expect(l.description, l.id).toMatch(/^Use when/);
    for (const l of lib) expect(l.description.length, l.id).toBeLessThanOrEqual(300);
  });

  it("links lib-4tz7c back to the real learning", () => {
    const item = d.library.get("lib-4tz7c");
    expect(item?.summary).toMatchObject({
      title: "Rescan subtrees instead of trusting notify on macOS",
      kind: "gotcha",
      status: "reviewed",
    });
    expect(item?.source.map((r) => r.target)).toContain("wf-3k9x2#L-2gk7r");
    expect(item?.backlinks.map((r) => r.issue)).toContain("wf-3k9x2");
  });

  it("points every library source at a real entry of the issues", () => {
    for (const lib of d.library.values()) {
      expect(
        lib.source.every((r) => r.kind === "entry"),
        lib.summary.id,
      ).toBe(true);
    }
  });

  it("keeps a retired item superseded by a reviewed one", () => {
    const old = d.library.get("lib-0rt4e");
    expect(old?.summary.status).toBe("retired");
    expect(d.library.get(old?.superseded_by ?? "")?.summary.status).toBe("reviewed");
  });

  it("holds the seed glossary", () => {
    const terms = new Map(world.glossary.map((t) => [t.term, t]));
    for (const t of [
      "workspace",
      "group",
      "issue",
      "entry",
      "change",
      "decision",
      "learning",
      "criterion",
      "task",
      "lane",
      "lease",
      "author",
      "library item",
      "promote",
      "append",
      "archify block",
      "needs-you request",
      "coordinator",
      "ready task",
      "wf_format",
      "anchor",
      "rev",
    ])
      expect(terms.has(t), t).toBe(true);
    expect(terms.get("issue")?.avoid).toEqual(expect.arrayContaining(["ticket", "card", "story"]));
    expect(terms.get("promote")?.avoid).toEqual(expect.arrayContaining(["publish", "upstream"]));
    for (const t of world.glossary) {
      expect(t.means.length, t.term).toBeGreaterThan(10);
      for (const s of t.see) expect(terms.has(s), `${t.term} -> ${s}`).toBe(true);
    }
  });
});

describe("file grammar (contract 1.3 to 1.5)", () => {
  const TS = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?(Z|[+-]\d{2}:\d{2})$/;
  const ENTRY = new RegExp(
    `^## (\\S+) @([a-z0-9][a-z0-9._-]*) (—|-) (.+?) \\{#([CDL]-[${CROCKFORD}]{5})\\}$`,
  );
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
  const ID_PREFIX: Record<string, string> = {
    "changes.md": "C",
    "decisions.md": "D",
    "learnings.md": "L",
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
  const GOAL_KEYS = [
    "id",
    "title",
    "status",
    "priority",
    "size",
    "owner",
    "labels",
    "claimed_by",
    "lease_until",
    "blocked_by",
    "due",
    "created",
  ];
  const STATE_SECTIONS = [
    "Done",
    "In flight",
    "Blocked",
    "Needs you",
    "Failed attempts",
    "Handoff notes",
    "Next steps",
  ];

  const frontmatter = (text: string) => {
    const m = text.match(/^---\n([\s\S]*?)\n---\n/);
    return (m?.[1] ?? "").split("\n").filter((l) => /^[a-z_]+:/.test(l));
  };
  const keysOf = (text: string) => frontmatter(text).map((l) => l.slice(0, l.indexOf(":")));
  const each = (fn: (id: string, name: string, text: string) => void) => {
    for (const [id, files] of d.files)
      for (const [name, text] of Object.entries(files)) fn(id, name, text ?? "");
  };

  it("writes each log entry with the heading regex, the right ID letter and known meta keys", () => {
    let entries = 0;
    each((id, name, text) => {
      if (!(name in META_KEYS)) return;
      expect(text.startsWith("# "), `${id} ${name}`).toBe(true);
      const lines = text.split("\n");
      lines.forEach((line, i) => {
        if (!line.startsWith("## ")) return;
        const m = line.match(ENTRY);
        expect(m, `${id} ${name}:${i + 1} ${line}`).not.toBeNull();
        expect(m?.[1], `${id} ${name}:${i + 1}`).toMatch(TS);
        expect(m?.[5].startsWith(`${ID_PREFIX[name]}-`), `${id} ${name}:${i + 1}`).toBe(true);
        for (const meta of lines.slice(i + 1)) {
          if (!meta.startsWith("- ")) break;
          const key = meta.match(/^- ([a-z_]+): /)?.[1];
          expect(META_KEYS[name], `${id} ${name}:${i + 1} ${meta}`).toContain(key);
        }
        entries++;
      });
    });
    expect(entries).toBeGreaterThan(80);
  });

  it("writes goal.md with frontmatter in order and the sections in order", () => {
    each((id, name, text) => {
      if (name !== "goal.md") return;
      const keys = keysOf(text);
      const at = keys.map((k) => GOAL_KEYS.indexOf(k));
      expect(
        at.every((x) => x >= 0),
        `${id} ${keys}`,
      ).toBe(true);
      expect(at, id).toEqual([...at].sort((a, b) => a - b));
      for (const k of ["id", "title", "status", "created"]) expect(keys, id).toContain(k);
      if (id !== "wf-7yq2m")
        for (const l of frontmatter(text))
          if (/^(owner|claimed_by):/.test(l)) expect(l, id).toMatch(/: "@[a-z0-9._-]+"$/);
      const h = text
        .split("\n")
        .filter((l) => l.startsWith("## "))
        .map((l) => l.slice(3));
      expect(h.slice(0, 2), id).toEqual(["Context", "Success criteria"]);
      const order = ["Context", "Success criteria", "Out of scope", "Links"];
      const idx = h.map((x) => order.indexOf(x));
      expect(
        idx.every((x) => x >= 0),
        `${id} ${h}`,
      ).toBe(true);
      expect(idx, id).toEqual([...idx].sort((a, b) => a - b));
      const sc = [...text.matchAll(/^- \[[ x]\] SC-(\d+): /gm)].map((m) => Number(m[1]));
      expect(sc, id).toEqual(sc.map((_, i) => i + 1));
    });
  });

  it("writes plan.md with sections, phases and sequential tasks", () => {
    each((id, name, text) => {
      if (name !== "plan.md") return;
      expect(keysOf(text), id).toEqual(["updated_at", "updated_by", "revision"]);
      const h = text
        .split("\n")
        .filter((l) => l.startsWith("## "))
        .map((l) => l.slice(3));
      expect(h[0], id).toBe("Approach");
      const phases = h.filter((x) => x.startsWith("Phase "));
      expect(
        phases.map((x) => Number(x.match(/^Phase (\d+): /)?.[1])),
        id,
      ).toEqual(phases.map((_, i) => i + 1));
      expect(
        h
          .slice(0, h.length - phases.length)
          .every((x) => ["Approach", "Assumptions", "Prior art"].includes(x)),
        id,
      ).toBe(true);
      const tasks = [...text.matchAll(/^### T-(\d+): /gm)].map((m) => Number(m[1]));
      expect(tasks, id).toEqual(tasks.map((_, i) => i + 1));
      for (const m of text.matchAll(/^- (A\d+): .+ \[(open|confirmed)\]$/gm))
        expect(m[1]).toMatch(/^A\d+$/);
      const lines = text.split("\n");
      lines.forEach((l, i) => {
        if (!l.startsWith("### T-")) return;
        for (const meta of lines.slice(i + 1)) {
          if (!meta.startsWith("- ") || meta.startsWith("- [")) break;
          expect(TASK_KEYS, `${id} ${l} ${meta}`).toContain(meta.match(/^- ([a-z_]+): /)?.[1]);
        }
      });
    });
  });

  it("writes current_state.md with the sections in order and well-formed requests", () => {
    each((id, name, text) => {
      if (name !== "current_state.md") return;
      expect(
        ["summary", "updated_at", "updated_by", "phase", "library_refs", "session"],
        id,
      ).toEqual(expect.arrayContaining(keysOf(text)));
      const h = text
        .split("\n")
        .filter((l) => l.startsWith("## "))
        .map((l) => l.slice(3));
      const idx = h.map((x) => STATE_SECTIONS.indexOf(x));
      expect(
        idx.every((x) => x >= 0),
        `${id} ${h}`,
      ).toBe(true);
      expect(idx, id).toEqual([...idx].sort((a, b) => a - b));
      expect(h[h.length - 1], id).toBe("Next steps");
      for (const l of text.split("\n")) {
        if (/^- \[[ x]\] Q-/.test(l))
          expect(l, id).toMatch(new RegExp(`^- \\[[ x]\\] Q-[${CROCKFORD}]{5}: .+`));
      }
      const next = text
        .slice(text.lastIndexOf("\n## Next steps"))
        .split("\n")
        .slice(2)
        .filter(Boolean);
      expect(
        next.every((l, i) => l.startsWith(`${i + 1}. `)),
        id,
      ).toBe(true);
    });
    for (const x of d.details.values()) {
      for (const r of x.state?.needs_you ?? []) {
        expect(["question", "approval", "input"]).toContain(r.kind);
        expect(["blocking", "fyi"]).toContain(r.urgency);
        expect(r.asked).toMatch(TS);
        if (r.answered) {
          expect(r.answer, r.id).toBeTruthy();
          expect(r.answered_by, r.id).toBeTruthy();
        }
      }
    }
  });

  it("writes library items with the sections of their kind", () => {
    const SECTIONS: Record<string, string[]> = {
      pattern: ["Rule", "When to use", "Example", "Evidence"],
      gotcha: ["Symptom", "Cause", "Fix", "Evidence"],
      playbook: ["Overview", "Procedure", "Done when", "Forbidden"],
      decision: ["Decision", "Because", "Rejected", "Revisit when"],
    };
    for (const l of world.library) {
      expect(
        l.sections.map((x) => x.heading),
        l.id,
      ).toEqual(SECTIONS[l.kind]);
      expect(l.created, l.id).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    }
  });
});

describe("files", () => {
  it("serves every doc of every issue from the workspace files", () => {
    let seen = 0;
    for (const s of world.issues) {
      const dir = detail(s.goal.id).summary.path;
      for (const doc of s.docs ?? []) {
        const shown = detail(s.goal.id).docs.find((x) => x.path === doc.path);
        expect(shown, `${dir}/${doc.path}`).toBeDefined();
        if (doc.body !== undefined) {
          // A markdown doc is a file of the workspace: its text is the file's text.
          expect(shown?.body_md, doc.path).toBe(doc.body);
          expect(source.texts, doc.path).toBeDefined();
        } else {
          // An image is served by the bundler: the loader was told its URL and size.
          expect(shown?.url, doc.path).toBeTruthy();
          expect(shown?.size, doc.path).toBe(doc.bytes);
          expect(shown?.size, doc.path).toBeLessThan(150 * 1024);
        }
        seen++;
      }
    }
    expect(seen).toBeGreaterThanOrEqual(5);
  });
});
