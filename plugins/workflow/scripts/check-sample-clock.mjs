#!/usr/bin/env node
// Checks that the headless scripts read the sample world at the dashboard's clock. The dashboard
// moves web/mock/sample to the real clock when it loads it; the files keep the times they were
// written at, so the scripts need WF_NOW=<that time> to give the same answers (README, "The sample
// world and its clock"). Run: node plugins/workflow/scripts/check-sample-clock.mjs
import { execFileSync } from "node:child_process";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const repo = resolve(here, "../../..");
const status = join(repo, "plugins/workflow/skills/checking-status/scripts/wf-status.sh");
const env = join(repo, "plugins/workflow/skills/using-wf/scripts/wf-env.sh");
const sample = join(repo, "web/mock/sample");
const RECORDED_AT = "2026-10-22T16:27+05:30";

const run = (cmd, args, now) =>
  execFileSync(cmd, args, {
    encoding: "utf8",
    env: { ...process.env, WF_ROOT: sample, ...(now ? { WF_NOW: now } : { WF_NOW: "" }) },
  });

let failed = 0;
const expect = (label, ok, got) => {
  if (!ok) failed += 1;
  console.log(`${ok ? "ok  " : "FAIL"} ${label}${ok ? "" : `\n     got: ${got}`}`);
};

const real = run(status, ["--no-git", "wf-3k9x2"], undefined);
expect("real clock: the sample's coordinator lease has long expired", /lease expired \d+d/.test(real), real.split("\n")[1]);

const at = run(status, ["--no-git", "wf-3k9x2"], RECORDED_AT);
expect("WF_NOW: the coordinator lease is live with 35m left", /@claude-opus \(lease 35m left\)/.test(at), at.split("\n")[1]);
expect("WF_NOW: the state is 25m old", /updated 25m ago by @claude-opus/.test(at), at);
expect("WF_NOW: nothing is expired or stale", /Leases expired \(0\)[\s\S]*Stale \(0\)/.test(at), at);
expect("WF_NOW: T-4 is the ready task", /Ready tasks \(1\)\n {2}wf-3k9x2 T-4 /.test(at), at);

const ready = run(status, ["--ready", "wf-3k9x2"], RECORDED_AT);
expect("--ready at WF_NOW lists T-4 only", ready.trim().split("\n").length === 1 && ready.includes("T-4"), ready);

expect("wf-env now prints WF_NOW", run(env, ["now"], RECORDED_AT).trim() === RECORDED_AT, "");
expect("wf-env later adds minutes in the offset of WF_NOW", run(env, ["later", "60"], RECORDED_AT).trim() === "2026-10-22T17:27+05:30", "");
expect("wf-env later crosses midnight", run(env, ["later", "45"], "2026-12-31T23:30+00:00").trim() === "2027-01-01T00:15+00:00", "");

process.exit(failed ? 1 : 0);
