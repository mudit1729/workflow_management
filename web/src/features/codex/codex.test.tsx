// The words and the parts of a Codex run that need no data layer: the line for each phase, the
// progress bar, the notice and the prompt panel. (The test environment has no DOM, so these render
// to markup.)
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { TooltipProvider } from "@/components/ui";
import type { CodexPhaseId, CodexRun, CodexRunStatus } from "@/lib/api";

const toast = vi.hoisted(() => Object.assign(vi.fn(), { error: vi.fn() }));
const copyText = vi.hoisted(() => vi.fn<(text: string) => Promise<boolean>>());
vi.mock("sonner", () => ({ toast }));
vi.mock("@/components/common", async (original) => ({
  ...(await original<typeof import("@/components/common")>()),
  copyText,
}));

import { announce, holdStrip, stripShows } from "./follow-run";
import { OpenInCodexPanel } from "./OpenInCodex";
import { copyCodexCommand } from "./open-in-codex";
import { RunNotice, RunProgress } from "./RunStatus";
import { activeRun, plansFirst, reasonAction, runLine, runProgress, runWord } from "./run-copy";

const ORDER: CodexPhaseId[] = ["claim", "log", "verify", "done"];

function run(
  status: CodexRunStatus,
  phase?: CodexPhaseId,
  extra: Partial<CodexRun> = {},
): CodexRun {
  const at = phase ? ORDER.indexOf(phase) : -1;
  const phases =
    status === "nothing_ready"
      ? []
      : ORDER.map((id, i) => ({
          id,
          label: id,
          state:
            status === "done" || i < at
              ? ("done" as const)
              : i === at && status === "running"
                ? ("running" as const)
                : ("pending" as const),
        }));
  return {
    id: "run-aaaaa",
    issue: "wf-3k9x2",
    kind: "next_step",
    status,
    by: "codex",
    task: status === "nothing_ready" ? undefined : "T-3",
    phase,
    phases,
    started_at: "2026-10-30T10:00:00Z",
    ...extra,
  };
}

describe("runLine", () => {
  it("names what Codex is doing in each phase", () => {
    expect(runLine(run("running", "claim"))).toBe("Claiming T-3");
    expect(runLine(run("running", "log"))).toBe("Logging the change");
    expect(runLine(run("running", "verify"))).toBe("Verifying: CI running");
    expect(runLine(run("running", "done"))).toBe("Finishing T-3");
  });

  it("names how a run ended, the state first", () => {
    expect(runLine(run("done", "done"))).toBe("Done: T-3");
    // A task that waits for a hand check is not done: the line says what is left.
    expect(runLine(run("done", "done", { review: true }))).toBe("Done: T-3, waiting for a check");
    expect(runLine(run("cancelled", "verify"))).toBe("Cancelled: T-3");
    expect(runLine(run("failed", "log"))).toBe("Failed: T-3");
    expect(runLine(run("nothing_ready"))).toBe("Nothing ready");
  });

  it("gives the card one word per state", () => {
    expect(runWord(run("running", "claim"))).toBe("Claiming");
    expect(runWord(run("running", "log"))).toBe("Logging");
    expect(runWord(run("running", "verify"))).toBe("Verifying");
    expect(runWord(run("done", "done"))).toBe("Done");
  });
});

/** A run that wrote the plan first, as the data layer labels it. */
function planning(phase: CodexPhaseId, extra: Partial<CodexRun> = {}): CodexRun {
  const base = run("running", phase, { task: "T-1", ...extra });
  return {
    ...base,
    phases: base.phases.map((p) =>
      p.id === "claim" ? { ...p, label: "Plan the issue, claim T-1" } : p,
    ),
  };
}

describe("a run that plans first", () => {
  it("is told from the label of its claim phase", () => {
    expect(plansFirst(planning("claim"))).toBe(true);
    expect(plansFirst(run("running", "claim"))).toBe(false);
    expect(plansFirst(run("nothing_ready"))).toBe(false);
  });

  it("is told from the run's own flag first", () => {
    expect(plansFirst(run("running", "claim", { plans: true }))).toBe(true);
    expect(plansFirst({ ...planning("claim"), plans: false })).toBe(false);
  });

  it("says Planning while it plans, then reads like any other run", () => {
    expect(runLine(planning("claim"))).toBe("Planning, claiming T-1");
    expect(runWord(planning("claim"))).toBe("Planning");
    expect(runLine(planning("log"))).toBe("Logging the change");
    expect(runWord(planning("verify"))).toBe("Verifying");
    expect(runLine(run("running", "claim"))).toBe("Claiming T-3");
  });
});

describe("reasonAction", () => {
  const nothing = (reason: string) => run("nothing_ready", undefined, { reason });

  it("sends a request to the Now tab, a missing goal to the goal, the rest to the plan", () => {
    expect(reasonAction(nothing("Waiting on Q-4m2pz: Approve SSE?"))).toEqual({
      label: "Open Now",
      tab: "now",
    });
    expect(
      reasonAction(nothing("The issue has no criteria to plan from. Add one to goal.md first.")),
    ).toEqual({ label: "Open goal", tab: "goal" });
    expect(reasonAction(nothing("No ready task. Wait for the tasks in flight."))?.tab).toBe("plan");
    expect(reasonAction(nothing("Every task is done."))?.tab).toBe("plan");
  });

  it("has no button where there is nowhere to go", () => {
    expect(reasonAction(nothing("Waiting on wf-r6jk2: it is not done."))).toBeUndefined();
    expect(reasonAction(nothing("The issue is done."))).toBeUndefined();
    expect(reasonAction(nothing("@claude-opus holds the lease on this issue."))).toBeUndefined();
    expect(reasonAction(run("failed", "log", { reason: "T-3 is gone." }))).toBeUndefined();
  });
});

describe("runProgress, activeRun", () => {
  it("counts the phases that are done", () => {
    expect(runProgress(run("running", "claim"))).toEqual({ done: 0, total: 4 });
    expect(runProgress(run("running", "verify"))).toEqual({ done: 2, total: 4 });
    expect(runProgress(run("done", "done"))).toEqual({ done: 4, total: 4 });
    expect(runProgress(run("nothing_ready"))).toEqual({ done: 0, total: 0 });
  });

  it("finds the run that is going", () => {
    const going = run("running", "log", { id: "run-bbbbb" });
    expect(activeRun([run("done", "done"), going])?.id).toBe("run-bbbbb");
    expect(activeRun([run("done", "done"), run("cancelled", "log")])).toBeUndefined();
  });
});

describe("RunProgress", () => {
  it("is a progress bar with one segment per phase", () => {
    const html = renderToStaticMarkup(<RunProgress run={run("running", "verify")} />);
    expect(html).toContain('role="progressbar"');
    expect(html).toContain('aria-valuenow="2"');
    expect(html).toContain('aria-valuemax="4"');
    expect(html.match(/animate-pulse/g)).toHaveLength(1);
    expect(html.match(/bg-accent(?![/\w-])/g)).toHaveLength(2);
  });
});

describe("RunNotice", () => {
  const render = (r: CodexRun) =>
    renderToStaticMarkup(
      <TooltipProvider>
        <RunNotice run={r} onOpenPlan={() => undefined} onDismiss={() => undefined} />
      </TooltipProvider>,
    );

  it("shows the reason of a run that had nothing to do, with a way to the plan", () => {
    const html = render(
      run("nothing_ready", undefined, { reason: "No ready task. Wait for the tasks in flight." }),
    );
    expect(html).toContain("No ready task. Wait for the tasks in flight.");
    expect(html).not.toContain("Failed:");
    expect(html).toContain("Open plan");
    expect(html).toContain('aria-label="Dismiss"');
  });

  it("offers the tab that answers the reason, and none when there is none", () => {
    const where = (reason: string) =>
      renderToStaticMarkup(
        <TooltipProvider>
          <RunNotice
            run={run("nothing_ready", undefined, { reason })}
            onOpen={() => undefined}
            onDismiss={() => undefined}
          />
        </TooltipProvider>,
      );
    expect(where("Waiting on Q-4m2pz: Approve SSE?")).toContain("Open Now");
    expect(where("The issue has no criteria to plan from. Add one to goal.md first.")).toContain(
      "Open goal",
    );
    expect(where("Waiting on wf-r6jk2: it is not done.")).not.toContain("Open ");
    expect(where("Every task is done.")).toContain("Open plan");
  });

  it("says Failed first when the run broke", () => {
    const html = render(run("failed", "log", { reason: "T-3 changed while Codex worked on it." }));
    expect(html).toContain("Failed: T-3 changed while Codex worked on it.");
  });
});

describe("OpenInCodexPanel", () => {
  const issue = { id: "wf-3k9x2", title: 'Push "board" updates', path: "issues/wf/web/live" };

  it("shows the prompt Codex receives and the command that is copied", () => {
    const html = renderToStaticMarkup(<OpenInCodexPanel issue={issue} copied />);
    expect(html).toContain("Codex gets this prompt");
    expect(html).toContain("Work on wf-3k9x2");
    expect(html).toContain("issues/wf/web/live");
    expect(html).toContain("codex &#x27;Work on wf-3k9x2");
    expect(html).toContain("Command copied. Paste it in a terminal at the repo root.");
    expect(html).toContain("Copy command");
    expect(html).toContain("Copy prompt");
  });

  it("says so when the clipboard is blocked", () => {
    const html = renderToStaticMarkup(<OpenInCodexPanel issue={issue} copied={false} />);
    expect(html).toContain("The browser blocked the clipboard");
    expect(html).not.toContain("Command copied");
  });
});

describe("one announcement per event", () => {
  const issue = { id: "wf-3k9x2", title: "Push board updates", path: "issues/wf/web/live" };
  const open = vi.fn();

  afterEach(() => {
    toast.mockClear();
    toast.error.mockClear();
    copyText.mockReset();
  });

  it("toasts the end of a run that no header strip shows", () => {
    announce(run("done", "done"), issue, open);
    expect(toast).toHaveBeenCalledTimes(1);
    expect(toast.mock.calls[0]?.[0]).toBe("Codex finished T-3");
    announce(run("failed", "log", { reason: "T-3 is gone." }), issue, open);
    expect(toast.error).toHaveBeenCalledTimes(1);
    // A cancel is the person's own act.
    announce(run("cancelled", "verify"), issue, open);
    expect(toast).toHaveBeenCalledTimes(1);
  });

  it("stays quiet while the header strip of that issue is on screen", () => {
    const release = holdStrip(issue.id);
    expect(stripShows(issue.id)).toBe(true);
    expect(stripShows("wf-other")).toBe(false);
    announce(run("done", "done"), issue, open);
    announce(run("failed", "log", { reason: "T-3 is gone." }), issue, open);
    expect(toast).not.toHaveBeenCalled();
    expect(toast.error).not.toHaveBeenCalled();
    release();
    expect(stripShows(issue.id)).toBe(false);
    announce(run("done", "done"), issue, open);
    expect(toast).toHaveBeenCalledTimes(1);
  });

  it("counts strips: the drawer and the page can show the same issue", () => {
    const drawer = holdStrip(issue.id);
    const page = holdStrip(issue.id);
    drawer();
    expect(stripShows(issue.id)).toBe(true);
    page();
    expect(stripShows(issue.id)).toBe(false);
  });

  it("copies the command and toasts once from the menu, with no toast from the popover", async () => {
    copyText.mockResolvedValue(true);
    await expect(copyCodexCommand(issue)).resolves.toBe(true);
    expect(copyText.mock.calls[0]?.[0]).toContain("codex 'Work on wf-3k9x2");
    expect(toast).toHaveBeenCalledTimes(1);
    expect(toast.mock.calls[0]?.[0]).toBe("Copied the Codex command");

    toast.mockClear();
    await expect(copyCodexCommand(issue, { toast: false })).resolves.toBe(true);
    expect(toast).not.toHaveBeenCalled();
  });

  it("says a blocked clipboard once, and not at all when the popover says it", async () => {
    copyText.mockResolvedValue(false);
    await expect(copyCodexCommand(issue)).resolves.toBe(false);
    expect(toast.error).toHaveBeenCalledTimes(1);
    toast.error.mockClear();
    await expect(copyCodexCommand(issue, { toast: false })).resolves.toBe(false);
    expect(toast.error).not.toHaveBeenCalled();
  });
});
