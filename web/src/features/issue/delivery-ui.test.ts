// The pure parts of the Git and CI tabs: run state, durations, branch names and the counts the tab
// strip shows. No DOM.
import { describe, expect, test } from "vitest";
import type { PipelineRun } from "@/lib/api";
import {
  ciTitle,
  deliveryCounts,
  formatDuration,
  gitTitle,
  runState,
  shortBranch,
} from "./delivery-ui";

const run = (over: Partial<PipelineRun>): PipelineRun => ({
  id: "ci-1",
  workflow: "CI",
  trigger: "push",
  branch: "wf-3k9x2/x",
  sha: "0d4a6c1",
  status: "completed",
  conclusion: "success",
  started_at: "2026-10-22T15:55+05:30",
  jobs: [],
  ...over,
});

describe("runState", () => {
  test("a completed run has its conclusion", () => {
    expect(runState(run({ conclusion: "failure" }))).toBe("failure");
    expect(runState(run({ conclusion: "cancelled" }))).toBe("cancelled");
    expect(runState(run({ conclusion: "success" }))).toBe("success");
  });

  test("an unfinished run has its status", () => {
    expect(runState(run({ status: "in_progress", conclusion: undefined }))).toBe("in_progress");
    expect(runState(run({ status: "queued", conclusion: undefined }))).toBe("queued");
  });
});

describe("formatDuration", () => {
  test.each([
    [0, "0s"],
    [47, "47s"],
    [60, "1m"],
    [214, "3m 34s"],
    [3600, "1h"],
    [3900, "1h 5m"],
  ])("%i s is %s", (seconds, text) => {
    expect(formatDuration(seconds)).toBe(text);
  });

  test("a negative time never shows", () => {
    expect(formatDuration(-4)).toBe("0s");
  });
});

describe("shortBranch", () => {
  test("drops the issue id every branch of the issue shares", () => {
    expect(shortBranch("wf-3k9x2/sse-delta-stream", "wf-3k9x2")).toBe("sse-delta-stream");
  });

  test("keeps the whole name of another branch", () => {
    expect(shortBranch("main", "wf-3k9x2")).toBe("main");
    expect(shortBranch("wf-aaaaa/x", "wf-3k9x2")).toBe("wf-aaaaa/x");
  });

  test("keeps a branch that is only the prefix", () => {
    expect(shortBranch("wf-3k9x2/", "wf-3k9x2")).toBe("wf-3k9x2/");
  });
});

describe("tab strip counts", () => {
  test("the newest run decides the dot, and an issue without runs has none", () => {
    const newest = run({ id: "ci-2", status: "in_progress", conclusion: undefined });
    const older = run({ id: "ci-1", conclusion: "failure" });
    expect(deliveryCounts({ commits: [], prs: [], pipelines: [newest, older] }).latest).toBe(
      "in_progress",
    );
    expect(deliveryCounts({ commits: [], prs: [], pipelines: [] }).latest).toBeUndefined();
  });

  test("the Git title counts commits and pull requests, and is empty for nothing", () => {
    expect(gitTitle({ commits: 4, prs: 2 })).toBe("4 commits · 2 pull requests");
    expect(gitTitle({ commits: 1, prs: 1 })).toBe("1 commit · 1 pull request");
    expect(gitTitle({ commits: 0, prs: 0 })).toBeUndefined();
  });

  test("the CI title says what the newest run did", () => {
    expect(ciTitle("failure")).toBe("Latest run failed");
    expect(ciTitle(undefined)).toBeUndefined();
  });
});
