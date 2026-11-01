// The skills flow as agents run it (docs/plan/proposals/skills-flow-spec.md sections 2 to 4):
// `wf-env.sh flow ...`, `install-skills.sh --from` and `check-skills.mjs --with-builtins`, started
// as child processes over mock/flow-fixture, plus the other readers of workflow.toml that must agree
// with them (`wf-env.sh config`, `wf-status.sh`) and the skill texts that name the flow. The fixture is a tiny workspace, a personal library and
// a team clone folder; mock/flow-fixture/expected.json is the same resolution as data, for the
// dashboard's resolver to be tested against later.
import { spawnSync } from "node:child_process";
import {
  cpSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, describe, expect, test } from "vitest";

const WEB = fileURLToPath(new URL("..", import.meta.url));
const REPO = fileURLToPath(new URL("../..", import.meta.url));
const ENV_SH = join(REPO, "plugins/workflow/skills/using-wf/scripts/wf-env.sh");
const INSTALL_SH = join(REPO, "scripts/install-skills.sh");
const STATUS_SH = join(REPO, "plugins/workflow/skills/checking-status/scripts/wf-status.sh");
const LIB_SH = join(REPO, "plugins/workflow/skills/keeping-a-library/scripts/wf-lib.sh");
const SKILLS = join(REPO, "plugins/workflow/skills");
const CHECK_SKILLS = join(REPO, "plugins/workflow/scripts/check-skills.mjs");
const FIXTURE = join(WEB, "mock/flow-fixture");
const TEAM_SKILLS = join(WEB, "mock/teams/acme-platform-handbook/docs/skills");

/** One copy of the fixture: the workspace, the clones folder, and the personal library inside it. */
interface Fx {
  dir: string;
  root: string;
  libs: string;
  me: string;
}

const scratch: string[] = [];
afterAll(() => {
  for (const dir of scratch) rmSync(dir, { recursive: true, force: true });
});

function tempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), "wf-flow-"));
  scratch.push(dir);
  return dir;
}

function fxAt(dir: string): Fx {
  return {
    dir,
    root: join(dir, "workspace"),
    libs: join(dir, "libraries"),
    me: join(dir, "libraries/shruti/wf-library"),
  };
}

/** The fixture as it is on disk: runs that only read use it. */
const FX = fxAt(FIXTURE);

/** A copy to edit. */
function copyFixture(): Fx {
  const dir = tempDir();
  cpSync(FIXTURE, dir, { recursive: true });
  return fxAt(dir);
}

interface Run {
  code: number | null;
  out: string;
  err: string;
}

/** Paths in output become <fx> (the fixture folder) and <repo>, so the pins hold on any machine. */
function plain(text: string, fx: Fx): string {
  return text.split(fx.dir).join("<fx>").split(REPO.replace(/\/$/, "")).join("<repo>");
}

let emptyHome = "";

/** wf-env.sh with a clean environment: WF_ROOT and WF_LIBRARIES from the fixture unless said. */
function wf(fx: Fx, args: string[], env: Record<string, string> = {}): Run {
  emptyHome ||= tempDir();
  const r = spawnSync("bash", [ENV_SH, ...args], {
    cwd: emptyHome,
    encoding: "utf8",
    env: {
      PATH: process.env.PATH ?? "",
      HOME: emptyHome,
      WF_ROOT: fx.root,
      WF_LIBRARIES: fx.libs,
      ...env,
    },
  });
  return { code: r.status, out: plain(r.stdout, fx), err: plain(r.stderr, fx) };
}

const lines = (run: Run) => run.out.split("\n").filter(Boolean);

/** What `wf-env.sh flow` prints for the fixture, line by line. */
const FIXTURE_FLOW = [
  "add adding-work built-in built-in then=plan",
  "plan me:planning-small me me max_tasks=5",
  "do doing-next-step built-in built-in finish=review commit=task",
  "log logging-work built-in built-in",
  "handoff handing-off built-in built-in budget_tokens=4000 changes=5",
  "status checking-status built-in built-in issue_hours=12 task_hours=4",
  "style writing-readable-bulk-text built-in built-in",
  "after:do security-check platform:checking-security true team",
  "after:do changelog ws:writing-changelog false team",
  "after:do tidy-up me:tidying-up false me",
  "after:handoff notify-me me:notifying-me false me",
  "unresolved status ws:gone-status team",
];

/** The flow with no [flow] table, no personal library and the default options. */
const DEFAULT_FLOW = [
  "add adding-work built-in built-in then=offer",
  "plan planning-issues built-in built-in max_tasks=8",
  "do doing-next-step built-in built-in finish=verify commit=task",
  "log logging-work built-in built-in",
  "handoff handing-off built-in built-in budget_tokens=6000 changes=5",
  "status checking-status built-in built-in issue_hours=24 task_hours=4",
  "style writing-readable-bulk-text built-in built-in",
];

const AFTER = ["add", "plan", "do", "handoff"] as const;

type Options = Record<string, string | number>;
interface Resolved {
  steps: Record<
    string,
    {
      skill: string;
      source: string;
      origin: string;
      options: Options;
      unresolved?: { ref: string; origin: string };
    }
  >;
  custom: Record<
    string,
    { id: string; skill: string; required: boolean; label: string; origin: string }[]
  >;
}

/** The shell's answer as the shape of expected.json: `flow`, plus `flow custom <step>` for labels. */
function resolved(fx: Fx, env: Record<string, string> = {}): Resolved {
  const out: Resolved = { steps: {}, custom: { add: [], plan: [], do: [], handoff: [] } };
  const origins: Record<string, string> = {};
  for (const line of lines(wf(fx, ["flow"], env))) {
    const [key, ...rest] = line.split(" ");
    if (key === "unresolved") {
      const [step, ref, origin] = rest;
      if (out.steps[step]) out.steps[step].unresolved = { ref, origin };
    } else if (key.startsWith("after:")) {
      origins[`${key.slice(6)}/${rest[0]}`] = rest[3];
    } else {
      const [skill, source, origin, ...opts] = rest;
      const options: Options = {};
      for (const o of opts) {
        const [k, v] = o.split("=");
        options[k] = /^\d+$/.test(v) ? Number(v) : v;
      }
      out.steps[key] = { skill, source, origin, options };
    }
  }
  for (const after of AFTER) {
    for (const row of lines(wf(fx, ["flow", "custom", after], env))) {
      const [id, skill, required, ...label] = row.split("|");
      out.custom[after].push({
        id,
        skill,
        required: required === "true",
        label: label.join("|"),
        origin: origins[`${after}/${id}`],
      });
    }
  }
  return out;
}

/** A workspace with only the given workflow.toml, and no personal library. */
function bareWorkspace(toml: string): Fx {
  const dir = tempDir();
  const fx = fxAt(dir);
  mkdirSync(join(fx.root, "skills"), { recursive: true });
  mkdirSync(fx.libs);
  writeFileSync(join(fx.root, "workflow.toml"), toml);
  return fx;
}

function writeSkill(dir: string, name: string) {
  mkdirSync(join(dir, name), { recursive: true });
  writeFileSync(
    join(dir, name, "SKILL.md"),
    `---\nname: ${name}\ndescription: Use when a test needs ${name}. Avoid it elsewhere.\n---\n\n# ${name}\n`,
  );
}

describe("wf-env.sh flow, over the fixture", () => {
  test("prints one line per step, then the custom steps, then what did not resolve", () => {
    const r = wf(FX, ["flow"]);
    expect(r.code).toBe(0);
    expect(lines(r)).toEqual(FIXTURE_FLOW);
    expect(r.err).toBe(
      "wf-env: flow: status: ws:gone-status (team) does not resolve: " +
        "<fx>/workspace/skills/gone-status/SKILL.md is missing. Using checking-status.\n",
    );
  });

  test("is the resolution in expected.json", () => {
    const expected = JSON.parse(readFileSync(join(FIXTURE, "expected.json"), "utf8")) as Resolved;
    expect(resolved(FX)).toEqual(expected);
  });

  test("flow <step> prints the skill in effect", () => {
    const skills: Record<string, string> = {
      add: "adding-work",
      plan: "me:planning-small",
      do: "doing-next-step",
      log: "logging-work",
      handoff: "handing-off",
      status: "checking-status",
      style: "writing-readable-bulk-text",
    };
    for (const [step, skill] of Object.entries(skills)) {
      const r = wf(FX, ["flow", step]);
      expect([step, r.code, r.out]).toEqual([step, 0, `${skill}\n`]);
    }
    // an unresolved reference is the built-in skill, and stderr says so
    expect(wf(FX, ["flow", "status"]).err).toContain("ws:gone-status (team) does not resolve");
    expect(wf(FX, ["flow", "plan"]).err).toBe("");
  });

  test("flow <step> <option> prints the value in effect, the personal one first", () => {
    const options: [string, string, string][] = [
      ["add", "then", "plan"], // the team's
      ["plan", "max_tasks", "5"], // the team's, though the skill is mine: key by key
      ["do", "finish", "review"], // mine
      ["do", "commit", "task"], // the default
      ["handoff", "budget_tokens", "4000"], // [context], not the 10000 my library.toml tries to set
      ["handoff", "changes", "5"],
      ["status", "issue_hours", "12"], // [staleness]
      ["status", "task_hours", "4"],
    ];
    for (const [step, option, value] of options) {
      const r = wf(FX, ["flow", step, option]);
      expect([step, option, r.code, r.out]).toEqual([step, option, 0, `${value}\n`]);
    }
  });

  test("flow origin <step> <option> says whose value an option has: built-in, team or me", () => {
    const origins: [string, string, string][] = [
      ["add", "then", "team"],
      ["plan", "max_tasks", "team"], // the skill is mine, the option is the team's
      ["do", "finish", "me"],
      ["do", "commit", "built-in"],
      ["handoff", "budget_tokens", "team"], // [context]; my try to set it is ignored
      ["handoff", "changes", "built-in"],
      ["status", "issue_hours", "team"], // [staleness]
      ["status", "task_hours", "built-in"],
    ];
    for (const [step, option, origin] of origins) {
      const r = wf(FX, ["flow", "origin", step, option]);
      expect([step, option, r.code, r.out, r.err]).toEqual([step, option, 0, `${origin}\n`, ""]);
    }
  });

  test("flow origin follows the value that wins, also when a layer's value is skipped", () => {
    const fx = copyFixture();
    writeFileSync(
      join(fx.me, "library.toml"),
      'kind = "personal"\n[flow.do]\nfinish = "sometimes"\ncommit = "none"\n[flow.plan]\nmax_tasks = 0\n',
    );
    // finish: mine is not a value, the team sets none, so the default; commit is mine; max_tasks is the team's 5
    expect(wf(fx, ["flow", "origin", "do", "finish"]).out).toBe("built-in\n");
    expect(wf(fx, ["flow", "origin", "do", "commit"]).out).toBe("me\n");
    expect(wf(fx, ["flow", "origin", "plan", "max_tasks"]).out).toBe("team\n");
    // the value and its origin are the same decision
    expect(wf(fx, ["flow", "do", "commit"]).out).toBe("none\n");
  });

  test("flow custom <step> lists id|skill|required|label: the team's by order, then mine", () => {
    expect(lines(wf(FX, ["flow", "custom", "do"]))).toEqual([
      "security-check|platform:checking-security|true|Security check",
      "changelog|ws:writing-changelog|false|Writing changelog",
      "tidy-up|me:tidying-up|false|Tidying up",
    ]);
    expect(lines(wf(FX, ["flow", "custom", "handoff"]))).toEqual([
      "notify-me|me:notifying-me|false|Tell me when it is ready",
    ]);
    const none = wf(FX, ["flow", "custom", "add"]);
    expect([none.code, none.out, none.err]).toEqual([0, "", ""]);
  });

  test("flow path <ref> prints the SKILL.md of each kind of reference", () => {
    const paths: [string, string][] = [
      ["planning-issues", "<repo>/plugins/workflow/skills/planning-issues/SKILL.md"],
      ["ws:acme-planning", "<fx>/workspace/skills/acme-planning/SKILL.md"],
      ["me:planning-small", "<fx>/libraries/shruti/wf-library/skills/planning-small/SKILL.md"],
      [
        "platform:checking-security",
        "<fx>/libraries/acme/platform-handbook/docs/skills/checking-security/SKILL.md",
      ],
    ];
    for (const [ref, path] of paths) {
      const r = wf(FX, ["flow", "path", ref]);
      expect([ref, r.code, r.out]).toEqual([ref, 0, `${path}\n`]);
    }
  });

  test("flow path fails, with the reason, for a reference that is not there", () => {
    const cases: [string, string][] = [
      [
        "ws:gone-status",
        "no skill ws:gone-status: <fx>/workspace/skills/gone-status/SKILL.md is missing",
      ],
      [
        "no-such-skill",
        "no skill no-such-skill: <repo>/plugins/workflow/skills/no-such-skill/SKILL.md is missing",
      ],
      [
        "me:nothing",
        "no skill me:nothing: <fx>/libraries/shruti/wf-library/skills/nothing/SKILL.md is missing",
      ],
      [
        "other:x",
        "no team library 'other' in <fx>/libraries/shruti/wf-library/libraries.toml (for other:x)",
      ],
      ["../etc", "not a skill reference"],
      ["ws:../x", "not a skill reference"],
      ["Plan", "not a skill reference"],
    ];
    for (const [ref, why] of cases) {
      const r = wf(FX, ["flow", "path", ref]);
      expect([ref, r.code, r.out]).toEqual([ref, 1, ""]);
      expect(r.err, ref).toContain(why);
    }
  });

  test("a bad step, option or command is exit 1 with a reason", () => {
    const cases: [string[], string][] = [
      [["flow", "nope"], "unknown step 'nope'. Steps: add plan do log handoff status style"],
      [["flow", "plan", "nope"], "step plan has no option 'nope'. Options: max_tasks"],
      [["flow", "do", "nope"], "Options: finish commit"],
      [["flow", "log", "anything"], "step log has no option 'anything'. It has no options."],
      [["flow", "custom"], "flow custom needs a step: add plan do handoff"],
      [["flow", "custom", "log"], "flow custom needs a step: add plan do handoff"],
      [["flow", "path"], "flow path needs a skill reference"],
      [["flow", "origin"], "flow origin needs a step and an option"],
      [["flow", "origin", "do"], "flow origin needs a step and an option"],
      [["flow", "origin", "nope", "x"], "unknown step 'nope'"],
      [["flow", "origin", "plan", "nope"], "step plan has no option 'nope'. Options: max_tasks"],
    ];
    for (const [args, why] of cases) {
      const r = wf(FX, args);
      expect([args.join(" "), r.code, r.out]).toEqual([args.join(" "), 1, ""]);
      expect(r.err, args.join(" ")).toContain(why);
    }
  });

  test("config still reads the flow tables, and --help lists the flow", () => {
    expect(wf(FX, ["config", "flow.plan.skill"]).out).toBe("ws:acme-planning\n");
    expect(wf(FX, ["config", "flow.custom.security-check.order"]).out).toBe("1\n");
    const help = wf(FX, ["--help"]).out;
    for (const part of [
      "wf-env.sh flow ",
      "flow <step> <option>",
      "flow custom <step>",
      "flow path <ref>",
      "flow origin <step> <option>",
    ])
      expect(help).toContain(part);
  });
});

describe("wf-env.sh flow, without a flow or a personal library", () => {
  test("a workflow.toml with no [flow] is the built-in flow with the default options", () => {
    const fx = bareWorkspace("wf_format = 1\n");
    const r = wf(fx, ["flow"]);
    expect(r.code).toBe(0);
    expect(lines(r)).toEqual(DEFAULT_FLOW);
    expect(r.err).toBe("");
    expect(wf(fx, ["flow", "plan"]).out).toBe("planning-issues\n");
    expect(wf(fx, ["flow", "do", "finish"]).out).toBe("verify\n");
    expect(wf(fx, ["flow", "custom", "do"]).out).toBe("");
  });

  test("the four team-only options read [context] and [staleness]", () => {
    const fx = bareWorkspace(
      "wf_format = 1\n[context]\nbudget_tokens = 8000\nchanges = 3\n[staleness]\nissue_hours = 48\ntask_hours = 2\n",
    );
    const flow = lines(wf(fx, ["flow"]));
    expect(flow).toContain("handoff handing-off built-in built-in budget_tokens=8000 changes=3");
    expect(flow).toContain("status checking-status built-in built-in issue_hours=48 task_hours=2");
  });

  test("a team flow applies when the person has no library; an alias needs the personal libraries.toml", () => {
    const fx = copyFixture();
    rmSync(join(fx.libs, "shruti"), { recursive: true });
    const r = wf(fx, ["flow"]);
    expect(r.code).toBe(0);
    expect(lines(r)).toEqual([
      "add adding-work built-in built-in then=plan",
      "plan ws:acme-planning workspace team max_tasks=5",
      "do doing-next-step built-in built-in finish=verify commit=task",
      "log logging-work built-in built-in",
      "handoff handing-off built-in built-in budget_tokens=4000 changes=5",
      "status checking-status built-in built-in issue_hours=12 task_hours=4",
      "style writing-readable-bulk-text built-in built-in",
      "after:do security-check platform:checking-security true team",
      "after:do changelog ws:writing-changelog false team",
      "unresolved status ws:gone-status team",
      "unresolved after:do security-check platform:checking-security team",
    ]);
    expect(r.err).toContain("no personal library, so no team library 'platform'");
    expect(wf(fx, ["flow", "path", "me:planning-small"]).err).toContain("no personal library for");
  });
});

describe("wf-env.sh flow, finding the personal library", () => {
  test("$WF_LIBRARY names it, with no scan of $WF_LIBRARIES", () => {
    const fx = copyFixture();
    const elsewhere = tempDir();
    const r = wf(fx, ["flow", "plan"], { WF_LIBRARIES: elsewhere, WF_LIBRARY: fx.me });
    expect([r.code, r.out, r.err]).toEqual([0, "me:planning-small\n", ""]);
  });

  test("a WF_LIBRARY without library.toml is a note, not an error", () => {
    const r = wf(FX, ["flow", "plan"], { WF_LIBRARY: join(FX.dir, "nowhere") });
    expect([r.code, r.out]).toEqual([0, "ws:acme-planning\n"]);
    expect(r.err).toBe(
      "wf-env: flow: WF_LIBRARY=<fx>/nowhere has no library.toml; no personal flow\n",
    );
  });

  test("two personal libraries are a note too: the team flow applies", () => {
    const fx = copyFixture();
    mkdirSync(join(fx.libs, "bob/wf-library"), { recursive: true });
    writeFileSync(join(fx.libs, "bob/wf-library/library.toml"), 'kind = "personal"\n');
    const r = wf(fx, ["flow", "plan"]);
    expect([r.code, r.out]).toEqual([0, "ws:acme-planning\n"]);
    expect(r.err).toContain("more than one personal library");
    expect(r.err).toContain("set WF_LIBRARY");
  });

  test("a clone whose library.toml is not kind = personal is not the personal library", () => {
    const fx = copyFixture();
    writeFileSync(
      join(fx.me, "library.toml"),
      'name = "Team"\nkind = "team"\n[flow.plan]\nskill = "me:planning-small"\n',
    );
    const r = wf(fx, ["flow", "plan"]);
    expect([r.code, r.out, r.err]).toEqual([0, "ws:acme-planning\n", ""]);
  });
});

describe("wf-env.sh flow, references that do not resolve", () => {
  test("a missing personal skill falls back to the built-in, not to the team's choice", () => {
    const fx = copyFixture();
    rmSync(join(fx.me, "skills/planning-small"), { recursive: true });
    const r = wf(fx, ["flow"]);
    expect(lines(r)).toContain("plan planning-issues built-in built-in max_tasks=5");
    expect(lines(r)).toContain("unresolved plan me:planning-small me");
    expect(r.err).toContain("plan: me:planning-small (me) does not resolve");
    expect(wf(fx, ["flow", "plan"]).out).toBe("planning-issues\n");
  });

  test("a removed team alias, or a clone that is gone, is flagged on the custom step", () => {
    const fx = copyFixture();
    rmSync(join(fx.libs, "acme"), { recursive: true });
    const r = wf(fx, ["flow", "custom", "do"]);
    // the step is still listed: it has no built-in to fall back to, so the run has to fail it
    expect(lines(r)[0]).toBe("security-check|platform:checking-security|true|Security check");
    expect(r.err).toContain("security-check: platform:checking-security (team) does not resolve");
    expect(r.err).toContain("checking-security/SKILL.md is missing");

    writeFileSync(join(fx.me, "libraries.toml"), "# no team libraries any more\n");
    const whole = wf(fx, ["flow"]);
    expect(lines(whole)).toContain(
      "unresolved after:do security-check platform:checking-security team",
    );
    expect(whole.err).toContain(
      "no team library 'platform' in <fx>/libraries/shruti/wf-library/libraries.toml",
    );
  });

  test("a library url that is not a GitHub repo, or a root that leaves the clone, is unresolved", () => {
    const fx = copyFixture();
    const toml = (url: string, root: string) =>
      `[[team]]\nalias = "platform"\nurl = "${url}"\nroot = "${root}"\n`;
    writeFileSync(join(fx.me, "libraries.toml"), toml("https://example.com/x/y", "docs"));
    expect(wf(fx, ["flow", "path", "platform:checking-security"]).err).toContain(
      "no usable GitHub url",
    );
    writeFileSync(
      join(fx.me, "libraries.toml"),
      toml("https://github.com/acme/platform-handbook", "../.."),
    );
    expect(wf(fx, ["flow", "path", "platform:checking-security"]).err).toContain("unsafe root");
  });
});

describe("wf-env.sh flow, reading TOML as written by hand", () => {
  test("comments, quotes and CRLF line ends do not change a value", () => {
    const fx = bareWorkspace(
      [
        "wf_format = 1   # version",
        "",
        "[flow.plan]   # the plan step",
        'skill = "ws:with-hash"   # swapped',
        "max_tasks = 12 # the cap",
        "",
        "[flow.do]",
        "finish = 'review'",
        "",
        "[flow.custom.quoted]",
        "after = 'plan'",
        'skill = "ws:with-hash"',
        'label = "Step # one"',
        "required = true",
        "",
      ].join("\r\n"),
    );
    writeSkill(join(fx.root, "skills"), "with-hash");
    expect(lines(wf(fx, ["flow"]))).toEqual([
      "add adding-work built-in built-in then=offer",
      "plan ws:with-hash workspace team max_tasks=12",
      "do doing-next-step built-in built-in finish=review commit=task",
      "log logging-work built-in built-in",
      "handoff handing-off built-in built-in budget_tokens=6000 changes=5",
      "status checking-status built-in built-in issue_hours=24 task_hours=4",
      "style writing-readable-bulk-text built-in built-in",
      "after:plan quoted ws:with-hash true team",
    ]);
    expect(wf(fx, ["flow", "custom", "plan"]).out).toBe("quoted|ws:with-hash|true|Step # one\n");
  });

  test("a number or true in quotes is a string: an option, an order and required do not take it", () => {
    const fx = bareWorkspace(
      [
        "wf_format = 1",
        "",
        "[flow.plan]",
        'max_tasks = "9"',
        "",
        "[flow.custom.quoted]",
        'after = "do"',
        'skill = "ws:with-hash"',
        'order = "5"',
        'required = "true"',
        "",
        "[flow.custom.first]",
        'after = "do"',
        'skill = "ws:with-hash"',
        "order = 2",
        "required = true",
        "",
      ].join("\n"),
    );
    writeSkill(join(fx.root, "skills"), "with-hash");
    const plan = wf(fx, ["flow", "plan", "max_tasks"]);
    expect([plan.out, plan.err]).toEqual([
      "8\n",
      "wf-env: flow: plan max_tasks: '9' is not a value of this option; skipped\n",
    ]);
    // quoted: order 1 and not required, so it runs before `first` (order 2) and may fail
    expect(lines(wf(fx, ["flow", "custom", "do"]))).toEqual([
      "quoted|ws:with-hash|false|With hash",
      "first|ws:with-hash|true|With hash",
    ]);
  });

  test("a skill or a label that is not a string is left out", () => {
    const fx = bareWorkspace(
      [
        "wf_format = 1",
        "",
        "[flow.log]",
        "skill = 5",
        "",
        "[flow.custom.numbered]",
        'after = "do"',
        "skill = 7",
        "",
        "[flow.custom.labelled]",
        'after = "do"',
        'skill = "ws:with-hash"',
        "label = 5",
        "",
      ].join("\n"),
    );
    writeSkill(join(fx.root, "skills"), "with-hash");
    expect(wf(fx, ["flow", "log"]).out).toBe("logging-work\n");
    expect(wf(fx, ["flow", "custom", "do"]).out).toBe("labelled|ws:with-hash|false|With hash\n");
  });

  test("config reads a table whose header has a comment after it", () => {
    const fx = bareWorkspace("wf_format = 1\n\n[staleness] # hours\nissue_hours = 12\n");
    expect(wf(fx, ["config", "staleness.issue_hours"]).out).toBe("12\n");
  });

  test("a quoted part of a table name or a key reads like a bare one, and keeps its keys to its own table", () => {
    const fx = bareWorkspace(
      [
        "wf_format = 1",
        "",
        "[flow.add]",
        'then = "plan"',
        "",
        '[flow."plan"]',
        'skill = "ws:with-hash"',
        "max_tasks = 5",
        "",
        "[ flow . 'do' ]   # spaces, single quotes and a comment",
        'finish = "review"',
        "",
        "[flow.log]",
        '"skill" = "ws:with-hash"',
        "",
        '[flow.custom."quoted-step"]',
        'after = "handoff"',
        'skill = "ws:with-hash"',
        "",
        '[flow.custom."has.dot"]',
        'after = "do"',
        'skill = "ws:with-hash"',
        "",
      ].join("\n"),
    );
    writeSkill(join(fx.root, "skills"), "with-hash");
    // plan is the swapped skill; add did not lend its table to it (and plan did not take add's)
    expect(lines(wf(fx, ["flow"]))).toEqual([
      "add adding-work built-in built-in then=plan",
      "plan ws:with-hash workspace team max_tasks=5",
      "do doing-next-step built-in built-in finish=review commit=task",
      "log ws:with-hash workspace team",
      "handoff handing-off built-in built-in budget_tokens=6000 changes=5",
      "status checking-status built-in built-in issue_hours=24 task_hours=4",
      "style writing-readable-bulk-text built-in built-in",
      "after:handoff quoted-step ws:with-hash false team",
    ]);
    // a dot inside quotes is not a table level, so this is no custom step
    const dotted = wf(fx, ["flow", "custom", "do"]);
    expect(dotted.out).toBe("");
    expect(dotted.err).toContain("is not a kebab-case id; ignored");
  });

  test("the rows of a multi-line array are not table headers", () => {
    const fx = bareWorkspace(
      [
        "wf_format = 1",
        "[lint]",
        "disable = [",
        '  ["flow.plan"],',
        '  ["flow.do"]',
        "]",
        "max_tasks = 3   # a key of [lint], not of the table that the row above looks like",
        "",
        "[flow.add]",
        'then = "stop"',
        "",
      ].join("\n"),
    );
    expect(wf(fx, ["flow", "plan", "max_tasks"]).out).toBe("8\n");
    expect(wf(fx, ["flow", "add", "then"]).out).toBe("stop\n");
    expect(wf(fx, ["config", "lint.max_tasks"]).out).toBe("3\n");
  });

  test("a count is a TOML integer above 0: +7, 1_0 and 0x10 are numbers; 2.0, 1e1, -3, 007 and 0 are not", () => {
    const cases: [string, number | null][] = [
      ["8", 8],
      ["+7", 7],
      ["1_0", 10],
      ["1_000", 1000],
      ["0x10", 16],
      ["0o17", 15],
      ["0b11", 3],
      ["2.0", null],
      ["1e1", null],
      ["007", null],
      ["0", null],
      ["-3", null],
      ["1__0", null],
      ["_1", null],
      ["1_", null],
      ["0x", null],
      ["+0x10", null],
      ["1234567890123456", null],
    ];
    for (const [text, value] of cases) {
      const fx = bareWorkspace(`wf_format = 1\n[flow.plan]\nmax_tasks = ${text}\n`);
      const r = wf(fx, ["flow", "plan", "max_tasks"]);
      expect([text, r.out]).toEqual([text, `${value ?? 8}\n`]);
      if (value === null) expect(r.err, text).toContain("is not a value of this option; skipped");
      else expect(r.err, text).toBe("");
    }
    // the same reader serves the team-only tables
    const fx = bareWorkspace("wf_format = 1\n[context]\nbudget_tokens = 4_000\nchanges = 3.0\n");
    expect(wf(fx, ["flow", "handoff", "budget_tokens"]).out).toBe("4000\n");
    expect(wf(fx, ["flow", "handoff", "changes"]).out).toBe("5\n");
  });

  test("an order is a TOML integer of 0 or more: the same forms count, a float or a negative is 1", () => {
    // Run order of `z-step` (the order under test) and `b-step` (order `fixed`).
    const ran = (order: string, fixed: number) => {
      const fx = bareWorkspace(
        [
          "wf_format = 1",
          "[flow.custom.z-step]",
          'after = "do"',
          'skill = "logging-work"',
          `order = ${order}`,
          "[flow.custom.b-step]",
          'after = "do"',
          'skill = "logging-work"',
          `order = ${fixed}`,
          "",
        ].join("\n"),
      );
      return lines(wf(fx, ["flow", "custom", "do"])).map((l) => l.split("|")[0]);
    };
    // above 5 runs after b-step; a value that is no integer is 1, which runs before it
    for (const text of ["+7", "1_0", "0x10", "0o17", "0b1111"])
      expect([text, ran(text, 5)]).toEqual([text, ["b-step", "z-step"]]);
    for (const text of ["2.0", "1e1", "-3", "1__0", "_1", "0x", "007", '"7"'])
      expect([text, ran(text, 5)]).toEqual([text, ["z-step", "b-step"]]);
    // 0 is a valid order and runs first; the default 1 ties with b-step and loses on the id
    for (const text of ["0", "+0", "0x0"])
      expect([text, ran(text, 1)]).toEqual([text, ["z-step", "b-step"]]);
    expect(ran("1.5", 1)).toEqual(["b-step", "z-step"]);
  });

  test("a label or a skill of white space only counts as left out", () => {
    const fx = bareWorkspace(
      [
        "wf_format = 1",
        "[flow.custom.spaced]",
        'after = "do"',
        'skill = "logging-work"',
        'label = "   "',
        "[flow.custom.kept]",
        'after = "do"',
        'skill = "logging-work"',
        'label = "  Keep me  "',
        "[flow.custom.no-skill]",
        'after = "do"',
        'skill = "  "',
        "",
      ].join("\n"),
    );
    const r = wf(fx, ["flow", "custom", "do"]);
    // both are order 1, so by id; a label of spaces is the skill's name in words
    expect(r.out).toBe(
      "kept|logging-work|false|  Keep me  \nspaced|logging-work|false|Logging work\n",
    );
    expect(r.err).toBe("wf-env: flow: custom step no-skill has no skill; ignored\n");
    // a step skill of spaces is no choice: the next layer decides, it is not an unresolved reference
    const mine = copyFixture();
    writeFileSync(join(mine.me, "library.toml"), 'kind = "personal"\n[flow.plan]\nskill = "   "\n');
    const plan = wf(mine, ["flow", "plan"]);
    expect([plan.out, plan.err]).toEqual(["ws:acme-planning\n", ""]);
  });

  test("config reads the way the flow does: a # inside quotes, single quotes, a comment after the value", () => {
    const fx = bareWorkspace(
      [
        "wf_format = 1",
        "[workspace]",
        'name = "a # b"   # the name',
        "id_prefix = 'xy'",
        "",
        "[staleness]",
        'issue_hours = "12"',
        "task_hours = 0",
        "",
      ].join("\n"),
    );
    expect(wf(fx, ["config", "workspace.name"]).out).toBe("a # b\n");
    expect(wf(fx, ["config", "workspace.id_prefix"]).out).toBe("xy\n");
    expect(wf(fx, ["id", "issue"]).out).toMatch(/^xy-[0-9a-hjkmnp-tv-z]{5}\n$/);
    const missing = wf(fx, ["config", "workspace.nope"]);
    expect([missing.code, missing.out]).toEqual([1, ""]);
    expect(missing.err).toContain("no key workspace.nope");
    // a string or 0 is no number of hours: the Status step says 24 and 4, whatever `config` prints
    expect(wf(fx, ["flow", "status", "issue_hours"]).out).toBe("24\n");
    expect(wf(fx, ["flow", "status", "task_hours"]).out).toBe("4\n");
  });

  test("a value an option does not take is skipped with a note, then the next layer decides", () => {
    const fx = copyFixture();
    writeFileSync(
      join(fx.me, "library.toml"),
      'kind = "personal"\n[flow.do]\nfinish = "sometimes"\ncommit = "none"\n[flow.plan]\nmax_tasks = 0\n',
    );
    const finish = wf(fx, ["flow", "do", "finish"]);
    expect([finish.out, finish.err]).toEqual([
      "verify\n",
      "wf-env: flow: do finish: 'sometimes' is not a value of this option; skipped\n",
    ]);
    expect(wf(fx, ["flow", "do", "commit"]).out).toBe("none\n");
    // 0 is not a count: the team's 5 stays
    expect(wf(fx, ["flow", "plan", "max_tasks"]).out).toBe("5\n");
  });

  test("a custom step with a bad id, step or no skill is ignored with a note", () => {
    const fx = bareWorkspace(
      [
        "wf_format = 1",
        "[flow.custom.bad-after]",
        'after = "log"',
        'skill = "logging-work"',
        "[flow.custom.no-skill]",
        'after = "do"',
        "[flow.custom.Upper]",
        'after = "do"',
        'skill = "logging-work"',
        "[flow.custom.fine]",
        'after = "do"',
        'skill = "logging-work"',
        "",
      ].join("\n"),
    );
    const r = wf(fx, ["flow", "custom", "do"]);
    expect(r.out).toBe("fine|logging-work|false|Logging work\n");
    expect(r.err).toBe(
      [
        "wf-env: flow: custom step bad-after: after must be add, plan, do or handoff; ignored",
        "wf-env: flow: custom step no-skill has no skill; ignored",
        "wf-env: flow: custom step 'Upper' is not a kebab-case id; ignored",
        "",
      ].join("\n"),
    );
    // the notes belong to the commands that list custom steps
    expect(wf(fx, ["flow", "do", "finish"]).err).toBe("");
  });

  test("custom steps run by order, then id; a personal step cannot take a team id", () => {
    const fx = copyFixture();
    const step = (id: string, order: number) =>
      `[flow.custom.${id}]\nafter = "handoff"\nskill = "ws:writing-changelog"\norder = ${order}\n`;
    writeFileSync(
      join(fx.root, "workflow.toml"),
      `wf_format = 1\n${step("zeta", 1)}${step("alpha", 10)}${step("beta", 2)}${step("gamma", 2)}`,
    );
    writeFileSync(
      join(fx.me, "library.toml"),
      `kind = "personal"\n${step("aaa-mine", 1)}${step("zeta", 1)}`,
    );
    const r = wf(fx, ["flow", "custom", "handoff"]);
    expect(
      r.out
        .split("\n")
        .filter(Boolean)
        .map((l) => l.split("|")[0]),
    ).toEqual([
      "zeta", // order 1
      "beta", // order 2, then by id
      "gamma",
      "alpha", // order 10 sorts as a number
      "aaa-mine", // mine come after the team's, whatever their order
    ]);
    expect(r.err).toBe(
      "wf-env: flow: custom step zeta is a team step; a personal step cannot change it; ignored\n",
    );
  });
});

describe("install-skills.sh --from", () => {
  function install(args: string[]) {
    const r = spawnSync("bash", [INSTALL_SH, ...args], { encoding: "utf8", cwd: tempDir() });
    return { code: r.status, out: r.stdout, err: r.stderr };
  }

  test("--dry-run lists the built-ins and then each --from skill, and writes nothing", () => {
    const target = join(tempDir(), "skills");
    const r = install([
      "--codex",
      target,
      "--from",
      join(FX.root, "skills"),
      "--from",
      join(FX.me, "skills"),
      "--dry-run",
    ]);
    expect(r.code).toBe(0);
    const out = r.out.split("\n");
    expect(out.filter((l) => l.includes("(from "))).toEqual([
      `  would install acme-planning (from ${join(FX.root, "skills")})`,
      `  would install writing-changelog (from ${join(FX.root, "skills")})`,
      `  would install notifying-me (from ${join(FX.me, "skills")})`,
      `  would install planning-small (from ${join(FX.me, "skills")})`,
      `  would install tidying-up (from ${join(FX.me, "skills")})`,
    ]);
    expect(out).toContain("  17 skills");
    expect(() => readFileSync(join(target, "using-wf/SKILL.md"))).toThrow();
  });

  test("installs the skills beside the built-ins for Claude Code, and flow path finds them", () => {
    const target = join(tempDir(), "skills");
    const r = install(["--claude", target, "--from", join(FX.root, "skills")]);
    expect(r.code).toBe(0);
    for (const name of ["using-wf", "planning-issues", "acme-planning", "writing-changelog"])
      expect(readFileSync(join(target, name, "SKILL.md"), "utf8")).toContain(`name: ${name}`);
    // the installed wf-env.sh sees the installed copy as a sibling of using-wf
    const env = spawnSync(
      "bash",
      [join(target, "using-wf/scripts/wf-env.sh"), "flow", "path", "acme-planning"],
      {
        encoding: "utf8",
        env: { PATH: process.env.PATH ?? "", WF_ROOT: FX.root, WF_LIBRARIES: FX.libs },
      },
    );
    expect(env.stdout).toBe(`${join(target, "acme-planning/SKILL.md")}\n`);
  });

  test("refuses the name of a built-in, a name that comes twice and a folder with no skills", () => {
    const dir = tempDir();
    writeSkill(join(dir, "clash"), "planning-issues");
    const target = join(tempDir(), "skills");
    const clash = install(["--codex", target, "--from", join(dir, "clash")]);
    expect(clash.code).toBe(1);
    expect(clash.err).toContain("has the name of a built-in skill");
    expect(() => readFileSync(join(target, "using-wf/SKILL.md"))).toThrow();

    const twice = install([
      "--codex",
      target,
      "--from",
      join(FX.root, "skills"),
      "--from",
      join(FX.root, "skills"),
    ]);
    expect([twice.code, twice.err]).toEqual([
      1,
      "install-skills: the skill acme-planning comes twice in the --from folders\n",
    ]);

    mkdirSync(join(dir, "empty"));
    expect(install(["--codex", target, "--from", join(dir, "empty")]).err).toContain(
      "no skill folders",
    );
    expect(install(["--codex", target, "--from", join(dir, "missing")]).err).toContain(
      "is not a folder",
    );
  });

  test("--from needs --codex or --claude and a folder", () => {
    expect(install(["--from", join(FX.root, "skills")])).toMatchObject({
      code: 2,
      err: "install-skills: --from needs --codex or --claude\n",
    });
    expect(install(["--codex", "--from"])).toMatchObject({
      code: 2,
      err: "install-skills: --from needs a folder\n",
    });
  });

  test("--print-agents-md says that wf-env.sh flow decides which skill runs each step", () => {
    const r = install(["--print-agents-md"]);
    expect(r.code).toBe(0);
    expect(r.out).toContain("`wf-env.sh flow`");
    expect(r.out).toContain("skills flow");
  });

  test("the flags that were there still work", () => {
    const target = join(tempDir(), "skills");
    const r = install(["--codex", target, "--dry-run"]);
    expect(r.code).toBe(0);
    expect(r.out).toContain("  12 skills");
    expect(r.out).toContain("Next: scripts/install-skills.sh --print-agents-md >> AGENTS.md");
  });
});

describe("check-skills.mjs --with-builtins", () => {
  function check(args: string[]) {
    const r = spawnSync(process.execPath, [CHECK_SKILLS, ...args], { encoding: "utf8" });
    return { code: r.status, out: r.stdout, err: r.stderr };
  }

  test("accepts the fixture's workspace, personal and team skills, and the Platform handbook's", () => {
    for (const dir of [
      join(FX.root, "skills"),
      join(FX.me, "skills"),
      join(FX.libs, "acme/platform-handbook/docs/skills"),
      TEAM_SKILLS,
    ]) {
      const r = check(["--with-builtins", dir]);
      expect([dir, r.code, r.err]).toEqual([dir, 0, ""]);
      expect(r.out).toMatch(/skills? ok \(.*\) beside the built-ins/);
    }
  });

  test("the Platform handbook's checking-security is a real skill", () => {
    const text = readFileSync(join(TEAM_SKILLS, "checking-security/SKILL.md"), "utf8");
    expect(text).toMatch(/^---\nname: checking-security\ndescription: Use when /);
    expect(text).toMatch(/\bAvoid\b/);
    for (const word of ["secrets", "unsafe input", "dependencies", "pass", "fail"])
      expect(text).toContain(word);
  });

  test("without the flag, a folder with no using-wf is still refused", () => {
    const r = check([join(FX.root, "skills")]);
    expect(r.code).toBe(1);
    expect(r.err).toContain("using-wf (the bootstrap skill) is missing");
  });

  test("finds a built-in name and a path that points nowhere", () => {
    const dir = tempDir();
    writeSkill(dir, "planning-issues");
    writeSkill(dir, "points-nowhere");
    writeFileSync(
      join(dir, "points-nowhere/SKILL.md"),
      "---\nname: points-nowhere\ndescription: Use when a test needs it. Avoid it elsewhere.\n---\n\nRead `../using-wf/references/nope.md` and `../using-wf/references/format.md`.\n",
    );
    const r = check(["--with-builtins", dir]);
    expect(r.code).toBe(1);
    expect(r.err).toContain("planning-issues/SKILL.md: name is the name of a built-in skill");
    expect(r.err).toContain(
      "points-nowhere/SKILL.md: path does not exist: ../using-wf/references/nope.md",
    );
    expect(r.err).not.toContain("format.md");
  });

  test("a usage mistake is exit 2", () => {
    expect(check(["--with-builtins"]).code).toBe(2);
    expect(check(["--nope"]).code).toBe(2);
  });
});

describe("wf-status.sh, the Status step's hours", () => {
  /** wf-status.sh over a copy of the sample world, judged at the time its files were written. */
  function stale(tweak: (toml: string) => string): string {
    const dir = tempDir();
    cpSync(join(WEB, "mock/sample"), dir, { recursive: true });
    const file = join(dir, "workflow.toml");
    writeFileSync(file, tweak(readFileSync(file, "utf8")));
    emptyHome ||= tempDir();
    const r = spawnSync("bash", [STATUS_SH, "--no-git", "--root", dir], {
      encoding: "utf8",
      cwd: emptyHome,
      env: { PATH: process.env.PATH ?? "", HOME: emptyHome, WF_NOW: "2026-10-22T16:27+05:30" },
    });
    expect(r.status, r.stderr).toBe(0);
    return r.stdout.split(dir).join("<ws>");
  }

  test("a number of hours is read like wf-env.sh flow status reads it", () => {
    const base = stale((t) => t);
    expect(base).toContain("(limit 4h)");
    expect(base).toContain("(limit 24h)");
    const set = stale((t) =>
      t.replace("issue_hours = 24", "issue_hours = 12").replace("task_hours = 4", "task_hours = 2"),
    );
    expect(set).toContain("(limit 2h)");
    expect(set).toContain("(limit 12h)");
  });

  test("a string or 0 is not a number of hours: the defaults apply, as in the dashboard", () => {
    const bad = stale((t) =>
      t
        .replace("issue_hours = 24", 'issue_hours = "12"')
        .replace("task_hours = 4", "task_hours = 0"),
    );
    expect(bad).toBe(stale((t) => t));
  });
});

describe("wf-lib.sh parse", () => {
  const alias = (link: string) => {
    const r = spawnSync("bash", [LIB_SH, "parse", link], { encoding: "utf8" });
    expect(r.status, r.stderr).toBe(0);
    return /^alias=(.*)$/m.exec(r.stdout)?.[1];
  };

  test("an alias is the repo name, and me, t and ws (the routes and ws: in a reference) get -library", () => {
    expect(alias("https://github.com/acme/platform-handbook")).toBe("platform-handbook");
    expect(alias("https://github.com/acme/me")).toBe("me-library");
    expect(alias("acme/t")).toBe("t-library");
    expect(alias("https://github.com/acme/ws")).toBe("ws-library");
    expect(alias("git@github.com:acme/WS.git")).toBe("ws-library");
  });
});

describe("the skill texts that name the flow", () => {
  const skill = (name: string) => readFileSync(join(SKILLS, name, "SKILL.md"), "utf8");
  const step = (text: string, n: number) =>
    new RegExp(`^${n}\\. \\*\\*([^*]+)\\*\\*[\\s\\S]*?(?=^\\d+\\. \\*\\*|^## )`, "m").exec(
      text,
    )?.[0] ?? "";

  test("every wf-env.sh flow command the skills name exists", () => {
    const known = new Set([
      "path",
      "custom",
      "origin",
      "add",
      "plan",
      "do",
      "log",
      "handoff",
      "status",
      "style",
    ]);
    const texts = readdirSync(SKILLS).map(skill);
    texts.push(readFileSync(join(SKILLS, "using-wf/references/format.md"), "utf8"));
    for (const text of texts)
      for (const m of text.matchAll(/wf-env\.sh flow (\w+)/g))
        expect(known.has(m[1] as string), `flow ${m[1]}`).toBe(true);
  });

  test("Do next step commits, then runs the custom steps and finishes the task, then logs", () => {
    const text = skill("doing-next-step");
    expect(step(text, 7)).toContain("Commit the code");
    const eight = step(text, 8);
    expect(eight).toContain("Run the custom steps, then finish the task");
    // the input of a custom step, and what a failed required step does to the task
    expect(eight).toContain("the issue folder, the task id and the short sha");
    expect(eight).toMatch(/A required step fails: set the task `blocked`.*tick no criterion/);
    expect(eight.indexOf("Run the custom steps after")).toBeLessThan(
      eight.indexOf("Set the status"),
    );
    expect(eight.indexOf("Set the status")).toBeLessThan(eight.indexOf("Tick criteria"));
    expect(step(text, 9)).toContain("Log it");
    // the options point at the steps that read them
    expect(text).toContain("flow do finish` (`verify` or `review`, step 8)");
    expect(text).toContain("`flow do commit` (`task` or `none`, step 7)");
    // the lease is deleted by the status, which comes after the custom steps, so it is still held there
    expect(eight.indexOf("the task lease is still yours")).toBeLessThan(
      eight.indexOf("Set the status"),
    );
    expect(step(text, 6)).toContain("keeps its status and its lease until step 8");
  });

  test("the custom steps after Plan have one owner: whoever started the Plan step", () => {
    const planning = skill("planning-issues");
    expect(planning).toContain("does not run the custom steps after Plan");
    expect(planning).not.toContain("After step 9, run the custom steps");
    expect(skill("doing-next-step")).toContain("the Plan step's skill leaves them to you");
    expect(skill("adding-work")).toContain("the Plan step's skill leaves them to you");
    const using = skill("using-wf");
    expect(using).toContain("The Plan step's skill never runs them");
    expect(using).toContain("the issue folder, the task id and the short sha");
    expect(using).toContain("the issue folder and the bundle");
  });

  test("a failure after Add work is written where the new issues can hold it", () => {
    const adding = skill("adding-work");
    expect(adding).toContain("`changes.md` of the first new issue");
    expect(adding).toContain("no `Needs you` request");
    expect(skill("using-wf")).toContain("`changes.md` of the first new issue");
  });

  test("using-wf says what ../using-wf/ means inside a skill read from ws:, me: or a library", () => {
    const using = skill("using-wf");
    expect(using).toMatch(/starts with `\.\.\/`.*means the built-in folder beside this `using-wf`/);
    expect(using).toContain("flow origin <step> <option>");
    expect(readFileSync(join(SKILLS, "using-wf/references/format.md"), "utf8")).toContain(
      "`wf-env.sh flow origin <step> <option>`",
    );
  });

  test("the Platform handbook's checking-security takes the sha from the caller", () => {
    const text = readFileSync(join(TEAM_SKILLS, "checking-security/SKILL.md"), "utf8");
    expect(text).toContain("The commit sha the caller gives you");
    expect(text).not.toContain("from the change entry");
  });
});
