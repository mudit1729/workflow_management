// scripts/install-skills.sh --claude-plugin and the install panel name the same GitHub repository.
// The plugin manifest holds the name (`repository`), so a clone whose `origin` still has the name
// from before the rename (GitHub redirects it) prints the commands the dashboard shows.
import { spawnSync } from "node:child_process";
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, describe, expect, test } from "vitest";
import { SKILLS_REPO } from "@/lib/api/skills";

const REPO = fileURLToPath(new URL("../..", import.meta.url));
const MANIFEST = join(REPO, "plugins/workflow/.claude-plugin/plugin.json");
const OLD_ORIGIN = "https://github.com/mudit1729/workflow_maagement";

const slugOf = (url: string) => url.replace(/^https:\/\/github\.com\//, "").replace(/\.git$/, "");

const made: string[] = [];
afterAll(() => {
  for (const dir of made) rmSync(dir, { recursive: true, force: true });
});

/** The `--claude-plugin` output of a copy of the script, with this manifest and this origin. */
function printedCommands(manifest: string, origin: string): string {
  const root = mkdtempSync(join(tmpdir(), "wf-install-"));
  made.push(root);
  mkdirSync(join(root, "scripts"));
  mkdirSync(join(root, "plugins/workflow/skills"), { recursive: true });
  mkdirSync(join(root, "plugins/workflow/.claude-plugin"), { recursive: true });
  cpSync(join(REPO, "scripts/install-skills.sh"), join(root, "scripts/install-skills.sh"));
  writeFileSync(join(root, "plugins/workflow/.claude-plugin/plugin.json"), manifest);
  spawnSync("git", ["init", "-q"], { cwd: root });
  spawnSync("git", ["remote", "add", "origin", origin], { cwd: root });
  const r = spawnSync("bash", ["scripts/install-skills.sh", "--claude-plugin"], {
    cwd: root,
    encoding: "utf8",
  });
  expect(r.status).toBe(0);
  return r.stdout;
}

describe("install-skills.sh --claude-plugin", () => {
  const manifest = readFileSync(MANIFEST, "utf8");
  const declared = (JSON.parse(manifest) as { repository?: string }).repository ?? "";

  test("the plugin manifest names the repository the install panel shows", () => {
    expect(slugOf(declared)).toBe(SKILLS_REPO);
  });

  test("prints that name even when origin still has the old one", () => {
    const out = printedCommands(manifest, OLD_ORIGIN);
    expect(out).toContain(`/plugin marketplace add ${SKILLS_REPO}\n`);
    expect(out).toContain(`claude plugin marketplace add ${SKILLS_REPO} --scope project`);
    expect(out).not.toContain("workflow_maagement");
  });

  test("falls back to origin when the manifest names no repository", () => {
    const bare = manifest.replace(/^\s*"repository":.*\n/m, "");
    expect(bare).not.toBe(manifest);
    const out = printedCommands(bare, `${OLD_ORIGIN}.git`);
    expect(out).toContain("/plugin marketplace add mudit1729/workflow_maagement\n");
  });
});
