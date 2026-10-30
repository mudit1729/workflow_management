// wf:lint (scripts/wf-lint.mjs) and the skill checks of plugins/workflow, run as the CLIs run.
// The sample world holds a fixed set of deliberate findings; the shipped workspace holds none
// above a warning. A new finding in either is a reason to read the change, not to edit the test.
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { describe, expect, test } from "vitest";

const WEB = fileURLToPath(new URL("..", import.meta.url));
const REPO = fileURLToPath(new URL("../..", import.meta.url));

function run(script: string, args: string[], cwd = WEB) {
  const r = spawnSync(process.execPath, [script, ...args], { cwd, encoding: "utf8" });
  return { code: r.status, out: r.stdout, err: r.stderr };
}

const LINE = /^\S+:\d+ [FQS]\d{2,3} (error|warn|info) \S.*$/;

describe("wf:lint", () => {
  test("the sample world shows only its deliberate findings and exits 1", () => {
    const r = run("scripts/wf-lint.mjs", ["mock/sample"]);
    expect(r.code).toBe(1);
    const lines = r.out.trim().split("\n");
    for (const line of lines) expect(line).toMatch(LINE);
    // `file rule severity`, one entry per finding, line numbers left out
    const found = lines.map((l) => l.split(" ").slice(0, 3).join(" ").replace(/:\d+ /, " "));
    expect(found.sort()).toEqual(
      [
        "issues/wf/core/hedge-word-lint/goal.md S01 warn",
        "issues/wf/core/hedge-word-lint/goal.md S03 info",
        "issues/wf/core/hedge-word-lint/goal.md S06 warn",
        "issues/wf/core/hedge-word-lint/goal.md S06 warn",
        "issues/wf/core/hedge-word-lint/goal.md S07 warn",
        "issues/wf/core/hedge-word-lint/goal.md S07 warn",
        "issues/wf/core/hedge-word-lint/goal.md S08 info",
        "issues/wf/core/hedge-word-lint/plan.md S01 warn",
        "issues/wf/core/hedge-word-lint/plan.md S05 warn",
        "issues/wf/core/hedge-word-lint/plan.md S06 warn",
        "issues/wf/cut-v0-1-release/plan.md F011 error",
        "issues/wf/web/live-board-updates/current_state.md S01 warn",
        "issues/wf/web/live-board-updates/plan.md S06 warn",
        "issues/wf/web/tab-title-count/goal.md F001 error",
      ].sort(),
    );
  }, 60_000);

  test("the F001 finding of the bad-YAML issue sits on line 7", () => {
    const r = run("scripts/wf-lint.mjs", ["mock/sample", "--quiet"]);
    expect(r.out).toMatch(/^issues\/wf\/web\/tab-title-count\/goal\.md:7 F001 error /m);
  }, 60_000);

  test("the shipped workspace has no error and exits 0", () => {
    const r = run("scripts/wf-lint.mjs", ["mock/workspace"]);
    expect(r.code).toBe(0);
    for (const line of r.out.trim().split("\n").filter(Boolean)) {
      expect(line).toMatch(LINE);
      expect(line).not.toMatch(/ error /);
    }
  }, 60_000);

  test("--strict fails on a warning, --json prints counts", () => {
    const strict = run("scripts/wf-lint.mjs", ["mock/sample", "--strict", "--quiet"]);
    expect(strict.code).toBe(1);
    const json = run("scripts/wf-lint.mjs", ["mock/sample", "--json"]);
    const parsed = JSON.parse(json.out);
    expect(parsed.wf_format).toBe(1);
    expect(parsed.counts.error).toBe(2);
    expect(parsed.findings.length).toBe(
      parsed.counts.error + parsed.counts.warn + parsed.counts.info,
    );
  }, 60_000);

  test("a missing directory or option is a usage error (exit 2)", () => {
    expect(run("scripts/wf-lint.mjs", []).code).toBe(2);
    expect(run("scripts/wf-lint.mjs", ["mock/no-such-folder"]).code).toBe(2);
    expect(run("scripts/wf-lint.mjs", ["mock/sample", "--nope"]).code).toBe(2);
  }, 60_000);
});

describe("the workflow plugin", () => {
  test("every SKILL.md follows the house rules", () => {
    const r = run("plugins/workflow/scripts/check-skills.mjs", [], REPO);
    expect(r.err).toBe("");
    expect(r.code).toBe(0);
    expect(r.out).toMatch(/skills ok/);
  });
});
