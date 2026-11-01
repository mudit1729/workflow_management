// One rule, two implementations (skills-flow-spec 4, acceptance 5): `wf-env.sh flow` (agents) and
// `resolveFlow` (the dashboard) read the same files and must print the same flow. This test runs
// both over mock/flow-fixture and holds each to expected.json, then over edited copies of it, where
// the awkward cases live: values an option does not take, a personal reference that is gone, custom
// steps with a bad id, `after` or order, and team-only keys in the wrong table.
import { spawnSync } from "node:child_process";
import { cpSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, describe, expect, test } from "vitest";
import { parseTeamEntries } from "../mock/libraries/libraries";
import { readPersonalFlow } from "../mock/libraries/personal-config";
import { flowOfText } from "../mock/md/parse-flow";
import {
  customAfter,
  FLOW_AFTER,
  FLOW_STEP_IDS,
  FLOW_STEPS,
  formatFlow,
  parseSkillRef,
  type ResolvedFlow,
  resolveFlow,
} from "../src/lib/api/flow";

const WEB = fileURLToPath(new URL("..", import.meta.url));
const REPO = join(WEB, "..");
const ENV_SH = join(REPO, "plugins/workflow/skills/using-wf/scripts/wf-env.sh");
const BUILTINS = join(REPO, "plugins/workflow/skills");
const FIXTURE = join(WEB, "mock/flow-fixture");

/** One copy of the fixture to read, or to edit first. */
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

const at = (dir: string): Fx => ({
  dir,
  root: join(dir, "workspace"),
  libs: join(dir, "libraries"),
  me: join(dir, "libraries/shruti/wf-library"),
});

function copyFixture(): Fx {
  const dir = mkdtempSync(join(tmpdir(), "wf-parity-"));
  scratch.push(dir);
  cpSync(FIXTURE, dir, { recursive: true });
  return at(dir);
}

const emptyHome = mkdtempSync(join(tmpdir(), "wf-parity-home-"));
scratch.push(emptyHome);

/** wf-env.sh over a copy of the fixture, with a clean environment. */
function wf(fx: Fx, args: string[]): string {
  const r = spawnSync("bash", [ENV_SH, ...args], {
    cwd: emptyHome,
    encoding: "utf8",
    env: { PATH: process.env.PATH ?? "", HOME: emptyHome, WF_ROOT: fx.root, WF_LIBRARIES: fx.libs },
  });
  expect(r.status, `wf-env.sh ${args.join(" ")}: ${r.stderr}`).toBe(0);
  return r.stdout;
}

const read = (fx: Fx, rel: string): string => readFileSync(join(fx.dir, rel), "utf8");
const TEAM = "workspace/workflow.toml";
const ME = "libraries/shruti/wf-library/library.toml";

/** The resolver over the same folders: the same existence rule as spec 2 and `flow path`. */
function resolverFlow(fx: Fx): ResolvedFlow {
  const hasMe = existsSync(join(fx.me, "library.toml"));
  const teams = hasMe
    ? parseTeamEntries(read(fx, "libraries/shruti/wf-library/libraries.toml"))
    : [];
  const has = (dir: string, name: string) => existsSync(join(dir, "skills", name, "SKILL.md"));
  const exists = (ref: string): boolean => {
    const p = parseSkillRef(ref);
    if (!p) return false;
    if (p.source === "built-in") return existsSync(join(BUILTINS, p.name, "SKILL.md"));
    if (p.source === "workspace") return has(fx.root, p.name);
    if (p.source === "me") return hasMe && has(fx.me, p.name);
    const t = teams.find((x) => x.alias === p.alias);
    if (!t) return false;
    const repo = t.url.replace("https://github.com/", "");
    return has(join(fx.libs, repo, t.root ?? ""), p.name);
  };
  return resolveFlow({
    team: flowOfText(read(fx, TEAM)),
    me: hasMe ? readPersonalFlow(read(fx, ME)).flow : undefined,
    exists,
  });
}

// ---------------------------------------------------------------- expected.json

interface Expected {
  steps: Record<
    string,
    {
      skill: string;
      source: string;
      origin: string;
      options: Record<string, string | number>;
      unresolved?: { ref: string; origin: string };
    }
  >;
  custom: Record<
    string,
    { id: string; skill: string; required: boolean; label: string; origin: string }[]
  >;
}

const EXPECTED = JSON.parse(readFileSync(join(FIXTURE, "expected.json"), "utf8")) as Expected;

const num = (v: string): string | number => (/^[0-9]+$/.test(v) ? Number(v) : v);

/** What `wf-env.sh flow` and `flow custom` print, in the shape of expected.json. */
function scriptExpected(fx: Fx): Expected {
  const out: Expected = { steps: {}, custom: { add: [], plan: [], do: [], handoff: [] } };
  for (const line of wf(fx, ["flow"]).split("\n").filter(Boolean)) {
    const w = line.split(" ");
    if (w[0] === "unresolved") {
      const [, step, ref, origin] = w as [string, string, string, string];
      if (!step.startsWith("after:")) {
        const s = out.steps[step];
        if (s) s.unresolved = { ref, origin };
      }
    } else if (!w[0]?.startsWith("after:")) {
      const [step, skill, source, origin, ...opts] = w as [
        string,
        string,
        string,
        string,
        ...string[],
      ];
      out.steps[step] = {
        skill,
        source,
        origin,
        options: Object.fromEntries(opts.map((o) => [o.split("=")[0], num(o.split("=")[1] ?? "")])),
      };
    }
  }
  const origins = new Map<string, string>();
  for (const line of wf(fx, ["flow"]).split("\n")) {
    const w = line.split(" ");
    if (w[0]?.startsWith("after:")) origins.set(w[1] ?? "", w[4] ?? "");
  }
  for (const after of FLOW_AFTER)
    for (const line of wf(fx, ["flow", "custom", after]).split("\n").filter(Boolean)) {
      const [id = "", skill = "", required = "", ...label] = line.split("|");
      out.custom[after]?.push({
        id,
        skill,
        required: required === "true",
        label: label.join("|"),
        origin: origins.get(id) ?? "",
      });
    }
  return out;
}

/** The resolver's flow in the shape of expected.json. */
function resolverExpected(flow: ResolvedFlow): Expected {
  return {
    steps: Object.fromEntries(
      FLOW_STEP_IDS.map((id) => {
        const s = flow.steps[id];
        return [
          id,
          {
            skill: s.skill,
            source: s.source,
            origin: s.origin,
            options: Object.fromEntries(Object.values(s.options).map((o) => [o.key, o.value])),
            ...(s.unresolved
              ? { unresolved: { ref: s.unresolved.ref, origin: s.unresolved.origin } }
              : {}),
          },
        ];
      }),
    ),
    custom: Object.fromEntries(
      FLOW_AFTER.map((after) => [
        after,
        customAfter(flow, after, { all: true }).map((c) => ({
          id: c.id,
          skill: c.skill,
          required: c.required,
          label: c.label,
          origin: c.origin,
        })),
      ]),
    ),
  };
}

describe("the fixture", () => {
  test("wf-env.sh flow and resolveFlow both give expected.json", () => {
    const fx = at(FIXTURE);
    expect(scriptExpected(fx)).toEqual(EXPECTED);
    expect(resolverExpected(resolverFlow(fx))).toEqual(EXPECTED);
  });
});

// ---------------------------------------------------------------- the same text, edited copies

/**
 * What wf-env.sh says about a flow, next to what the resolver says: the whole flow and the custom
 * steps with their labels, and with `each` also one call per step and per option.
 */
function expectSame(fx: Fx, each = false): void {
  const flow = resolverFlow(fx);
  expect(wf(fx, ["flow"])).toBe(`${formatFlow(flow)}\n`);
  for (const def of each ? FLOW_STEPS : []) {
    expect(wf(fx, ["flow", def.id])).toBe(`${flow.steps[def.id].skill}\n`);
    for (const o of def.options)
      expect(wf(fx, ["flow", def.id, o.key]), `${def.id} ${o.key}`).toBe(
        `${flow.steps[def.id].options[o.key]?.value}\n`,
      );
  }
  for (const after of FLOW_AFTER) {
    const rows = customAfter(flow, after, { all: true }).map(
      (c) => `${c.id}|${c.skill}|${c.required}|${c.label}`,
    );
    expect(wf(fx, ["flow", "custom", after]), `custom ${after}`).toBe(
      rows.length > 0 ? `${rows.join("\n")}\n` : "",
    );
  }
}

/** A fixture copy with two files edited: `(text) => text` for workflow.toml and library.toml. */
function edited(team?: (t: string) => string, me?: (t: string) => string): Fx {
  const fx = copyFixture();
  if (team) writeFileSync(join(fx.dir, TEAM), team(read(fx, TEAM)));
  if (me) writeFileSync(join(fx.dir, ME), me(read(fx, ME)));
  return fx;
}

const append = (extra: string) => (t: string) => `${t.replace(/\n*$/, "\n")}\n${extra}\n`;

const CASES: { name: string; fx: () => Fx; each?: boolean }[] = [
  { name: "the fixture as it is", fx: () => at(FIXTURE), each: true },
  {
    name: "no personal library: only the team's flow, and the platform: alias cannot resolve",
    each: true,
    fx: () => {
      const fx = copyFixture();
      rmSync(join(fx.libs, "shruti"), { recursive: true });
      return fx;
    },
  },
  {
    name: "a personal reference that is gone beats a team reference that is fine",
    fx: () =>
      edited(undefined, (t) => t.replace('skill = "me:planning-small"', 'skill = "me:gone-plan"')),
  },
  {
    name: "an empty skill counts as unset",
    fx: () => edited(undefined, (t) => t.replace('skill = "me:planning-small"', 'skill = ""')),
  },
  {
    name: "a value an option does not take is skipped and the next layer decides",
    fx: () =>
      edited(
        append('[flow.do]\nfinish = "review"\ncommit = "sometimes"'),
        (t) =>
          t
            .replace('finish = "review"', 'finish = "perhaps"')
            .replace('skill = "me:planning-small"', 'skill = "me:planning-small"\nmax_tasks = 0') +
          '\n[flow.add]\nthen = "stop"\n',
      ),
  },
  {
    name: "numeric options take any positive whole number, mine over the team's",
    fx: () =>
      edited(
        (t) => t.replace("max_tasks = 5", "max_tasks = 17"),
        (t) =>
          t.replace('skill = "me:planning-small"', 'skill = "me:planning-small"\nmax_tasks = 12'),
      ),
  },
  {
    name: "team-only options: [flow.handoff] and [flow.status] keys are ignored, [context] is read",
    fx: () =>
      edited((t) =>
        append("[flow.handoff]\nbudget_tokens = 9000")(
          t
            .replace('skill = "ws:gone-status"', 'skill = "ws:gone-status"\nissue_hours = 99')
            .replace("budget_tokens = 4000", "budget_tokens = 4000\nchanges = 7"),
        ),
      ),
  },
  {
    name: "a bad value in [context] and [staleness] gives the default",
    fx: () =>
      edited((t) =>
        t
          .replace("budget_tokens = 4000", 'budget_tokens = 0\nchanges = "3"')
          .replace("issue_hours = 12", 'issue_hours = "soon"'),
      ),
  },
  {
    name: "a personal custom step with a team id is dropped",
    fx: () =>
      edited(
        undefined,
        append('[flow.custom.security-check]\nafter = "handoff"\nskill = "me:notifying-me"'),
      ),
  },
  {
    name: "custom steps with a bad id, a bad after, or no skill are ignored",
    fx: () =>
      edited(
        append(
          [
            '[flow.custom.Bad_Id]\nafter = "do"\nskill = "ws:acme-planning"',
            '[flow.custom.late]\nafter = "log"\nskill = "ws:acme-planning"',
            '[flow.custom.empty]\nafter = "do"',
            '[flow.custom.blank]\nafter = "do"\nskill = ""',
            '[flow.custom.fine]\nafter = "plan"\nskill = "ws:acme-planning"',
          ].join("\n\n"),
        ),
      ),
  },
  {
    name: "order: default 1, ties by id, and values that are not whole numbers",
    fx: () =>
      edited(
        append(
          [
            '[flow.custom.zeta]\nafter = "do"\nskill = "ws:acme-planning"\norder = 1',
            '[flow.custom.alpha]\nafter = "do"\nskill = "ws:acme-planning"\norder = 1',
            '[flow.custom.early]\nafter = "do"\nskill = "ws:acme-planning"\norder = 0',
            '[flow.custom.negative]\nafter = "do"\nskill = "ws:acme-planning"\norder = -2',
            '[flow.custom.fraction]\nafter = "do"\nskill = "ws:acme-planning"\norder = 1.5',
          ].join("\n\n"),
        ),
      ),
  },
  {
    name: "required is true only when the value is true; a label can hold spaces and a pipe",
    fx: () =>
      edited(
        append(
          [
            '[flow.custom.as-bool]\nafter = "plan"\nskill = "ws:acme-planning"\nrequired = true\nlabel = "Check | then go"',
            '[flow.custom.as-zero]\nafter = "plan"\nskill = "ws:acme-planning"\nrequired = 1',
            '[flow.custom.blank-label]\nafter = "plan"\nskill = "ws:acme-planning"\nlabel = ""',
          ].join("\n\n"),
        ),
      ),
  },
  {
    name: "references: a bare name that is no built-in, an unknown alias, uppercase, a missing clone",
    fx: () =>
      edited((t) =>
        append(
          [
            '[flow.log]\nskill = "not-a-builtin"',
            '[flow.style]\nskill = "nobody:thing"',
            '[flow.handoff]\nskill = "Bad Ref"',
          ].join("\n\n"),
        )(t.replace('then = "plan"', 'then = "plan"\nskill = "me:acme-planning"')),
      ),
  },
  {
    name: "a step may name a built-in that belongs to another step",
    fx: () => edited(append('[flow.log]\nskill = "handing-off"')),
  },
  {
    name: "a quoted number or boolean is a string, which the option does not take",
    fx: () =>
      edited(
        append(
          '[flow.custom.quoted]\nafter = "do"\nskill = "ws:acme-planning"\norder = "5"\nrequired = "true"',
        ),
        (t) =>
          t.replace('skill = "me:planning-small"', 'skill = "me:planning-small"\nmax_tasks = "9"'),
      ),
  },
  {
    name: "a skill that is not a string, unknown steps and unknown keys are left out",
    fx: () =>
      edited(
        append(
          [
            "[flow.log]\nskill = 5\nverbose = true",
            '[flow.bogus]\nskill = "ws:acme-planning"',
            '[flow.custom.numbered]\nafter = "do"\nskill = 7',
            '[flow.custom.labelled]\nafter = "do"\nskill = "ws:acme-planning"\nlabel = 5',
          ].join("\n\n"),
        ),
      ),
  },
  {
    name: "single quotes, trailing comments and CRLF in both files",
    fx: () =>
      edited(
        (t) => t.replace(/\n/g, "\r\n"),
        (t) =>
          t
            .replace('skill = "me:planning-small"', "skill = 'me:planning-small' # mine")
            .replace(/\n/g, "\r\n"),
      ),
  },
];

describe("wf-env.sh flow and resolveFlow print the same", () => {
  for (const c of CASES) test(c.name, () => expectSame(c.fx(), c.each));
});
