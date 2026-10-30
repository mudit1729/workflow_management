// The words and the parts of a Codex run that need no data layer: the line for each phase, the
// progress bar, the notice and the prompt panel. (The test environment has no DOM, so these render
// to markup.)
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { TooltipProvider } from "@/components/ui";
import type { CodexPhaseId, CodexRun, CodexRunStatus } from "@/lib/api";
import { OpenInCodexPanel } from "./OpenInCodex";
import { RunNotice, RunProgress } from "./RunStatus";
import { activeRun, runLine, runProgress, runWord } from "./run-copy";

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
      run("nothing_ready", undefined, { reason: "No ready task. Plan the issue first." }),
    );
    expect(html).toContain("No ready task. Plan the issue first.");
    expect(html).not.toContain("Failed:");
    expect(html).toContain("Open plan");
    expect(html).toContain('aria-label="Dismiss"');
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
