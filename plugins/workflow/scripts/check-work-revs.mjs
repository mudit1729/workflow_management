#!/usr/bin/env node
// Checks that wf-rev.sh (summarizing-work) gives the rev the dashboard stores in a work summary: the
// pages of web/mock/personal-sample/work were written by the dashboard's generator, so the script
// run on the sample folder of each issue must print the page's own `rev`. The four pages the
// prototype keeps by hand as an older state (to show Stale) are the only ones that differ.
// Run: node plugins/workflow/scripts/check-work-revs.mjs
import { execFileSync } from "node:child_process";
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const repo = resolve(here, "../../..");
const rev = join(repo, "plugins/workflow/skills/summarizing-work/scripts/wf-rev.sh");
const sample = join(repo, "web/mock/sample");
const pages = join(repo, "web/mock/personal-sample/work");
/** The pages kept by hand as an earlier state: two issues and the two groups above them. */
const STALE = new Set(["wf-3k9x2", "wf-z9mw2", "wf/web", "wf"]);

const walk = (dir) =>
  readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? walk(join(dir, e.name)) : [join(dir, e.name)],
  );
const key = (text, name) => text.match(new RegExp(`^${name}: *"?([^"\\n]+)"?$`, "m"))?.[1];

// Folders of the sample by issue id (goal.md `id:`) and by group path (`issues/<path>`).
const folders = new Map();
for (const file of walk(join(sample, "issues"))) {
  if (file.endsWith("/goal.md")) folders.set(key(readFileSync(file, "utf8"), "id"), dirname(file));
}

let failed = 0;
let checked = 0;
for (const file of walk(pages)) {
  const text = readFileSync(file, "utf8");
  const stored = key(text, "rev");
  if (!stored) continue;
  const issue = key(text, "issue");
  const group = key(text, "group");
  const id = issue ?? group;
  const folder = issue ? folders.get(issue) : join(sample, "issues", group);
  if (!folder) {
    failed += 1;
    console.log(`FAIL ${id}: no folder in the sample`);
    continue;
  }
  const got = execFileSync("bash", [rev, folder], { encoding: "utf8" }).trim();
  checked += 1;
  const same = got === stored;
  const expected = !STALE.has(id);
  if (same !== expected) {
    failed += 1;
    console.log(`FAIL ${id}: page ${stored}, script ${got}${expected ? "" : " (should differ: kept stale)"}`);
  }
}
console.log(`${failed ? "FAIL" : "ok  "} ${checked} work summaries: the script equals the page's rev, but for the four kept stale`);
process.exit(failed ? 1 : 0);
