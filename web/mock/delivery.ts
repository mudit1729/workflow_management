// Git, pull request and CI data of an issue (plan D2). It is derived from outside the workspace
// and never written into it: `wf serve` reads `git log` for commits that carry `Issue: wf-xxxxx`
// or sit on a branch named `wf-xxxxx/…`, and `gh` for pull requests and checks. The prototype has
// no git, so it reads a fixture while the sample is loaded (`fixtures/delivery-sample.json`) and
// what a Codex run adds (`codex.ts`). The shipped workspace and new issues start empty.
//
// The fixture holds absolute times written at `RECORDED_AT`, like the sample files. The store
// shifts them with the same `rebaseWorkspace` when it takes the sample, so "12m ago" stays
// "12m ago" on any day.
import type { IssueId, Ts } from "@/gen/types";
import type { Commit, Delivery, PipelineRun, PullRequest } from "@/lib/api/types";
import fixture from "./fixtures/delivery-sample.json";
import { rebaseWorkspace } from "./md/rebase";
import { rev } from "./util";

interface DeliveryFixture {
  issues: Record<IssueId, Delivery>;
}

const MIN = 60_000;
const OFFSET_MIN = 5 * 60 + 30; // +05:30, the workspace offset (see time.ts)
const pad = (n: number) => String(n).padStart(2, "0");

/** An instant as an RFC 3339 timestamp with seconds: a Codex run lasts seconds, not minutes. */
export function toTsSec(ms: number): Ts {
  const d = new Date(Math.floor(ms / 1000) * 1000 + OFFSET_MIN * MIN);
  const date = `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
  return `${date}T${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())}+05:30`;
}

export const emptyDelivery = (): Delivery => ({ commits: [], prs: [], pipelines: [] });

const byTimeDesc =
  <T>(at: (x: T) => string) =>
  (a: T, b: T) =>
    Date.parse(at(b)) - Date.parse(at(a));

/**
 * The delivery data with every list newest first. Equal times keep their order (a run adds its
 * newest item at the front), and the lists are copies.
 */
export function newestFirst(d: Delivery): Delivery {
  return {
    commits: [...d.commits].sort(byTimeDesc<Commit>((c) => c.at)),
    prs: [...d.prs].sort(byTimeDesc<PullRequest>((p) => p.updated_at)),
    pipelines: [...d.pipelines].sort(byTimeDesc<PipelineRun>((p) => p.started_at)),
  };
}

/**
 * The fixture for the sample issues, with its times shifted by `shiftMs` (the store's shift since
 * `RECORDED_AT`). A fresh copy on every call: runs add to it.
 */
export function sampleDelivery(shiftMs: number): Map<IssueId, Delivery> {
  const text = JSON.stringify(fixture);
  const shifted = rebaseWorkspace({ "delivery-sample.json": text }, shiftMs)[
    "delivery-sample.json"
  ];
  const { issues } = JSON.parse(shifted) as DeliveryFixture;
  return new Map(Object.entries(issues).map(([id, d]) => [id, newestFirst(d)]));
}

/** A 7-hex commit sha from a seed: the same seed gives the same sha. */
export function commitSha(seed: string): string {
  return rev(seed).slice(0, 7);
}
