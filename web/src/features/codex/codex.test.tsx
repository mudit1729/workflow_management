// The words and the parts of a Codex run that need no data layer: the line for each phase, the
// progress bar, the notice and the prompt panel; the names that follow the connected agent; and the
// rule that Do next step without an agent opens the connect flow. (The test environment has no DOM,
// so these render to markup.)
import { QueryClientProvider } from "@tanstack/react-query";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useShell } from "@/app/shell-store";
import { TooltipProvider } from "@/components/ui";
import {
  AgentNotConnectedError,
  agentControls,
  type CodexPhaseId,
  type CodexRun,
  type CodexRunStatus,
  queryClient,
  simulatedConnection,
} from "@/lib/api";

const toast = vi.hoisted(() => Object.assign(vi.fn(), { error: vi.fn() }));
const copyText = vi.hoisted(() => vi.fn<(text: string) => Promise<boolean>>());
vi.mock("sonner", () => ({ toast }));
vi.mock("@/components/common", async (original) => ({
  ...(await original<typeof import("@/components/common")>()),
  copyText,
}));

import { nextStepHint } from "./CodexActions";
import { CodexRunMarker } from "./CodexRunMarker";
import { announce, holdStrip, stripShows } from "./follow-run";
import { OpenInCodexPanel } from "./OpenInCodex";
import { copyCodexCommand, openInAgentHint } from "./open-in-codex";
import { RunNotice, RunProgress, RunStatus } from "./RunStatus";
import { RunsList } from "./RunsPopover";
import {
  activeRun,
  lostBridge,
  plansFirst,
  reasonAction,
  runLine,
  runProgress,
  runsLabel,
  runWord,
} from "./run-copy";
import { askToConnect, startOrConnect } from "./use-codex";

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
    agent: "codex",
    source: "simulated",
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

// ---------------------------------------------------------------- the agent (plan D12)

/** A run on a real bridge: no phases, no task, a last line. */
function bridgeRun(status: CodexRunStatus, extra: Partial<CodexRun> = {}): CodexRun {
  return {
    id: "run-bridge",
    issue: "wf-3k9x2",
    kind: "next_step",
    status,
    by: "codex",
    agent: "codex",
    source: "bridge",
    phases: [],
    started_at: "2026-10-30T10:00:00Z",
    ...extra,
  };
}

const claudeRun = (status: CodexRunStatus, extra: Partial<CodexRun> = {}) =>
  bridgeRun(status, { by: "claude", agent: "claude", ...extra });

// The agent's tile reads the authors, so a view needs the query client.
const view = (node: React.ReactElement) =>
  renderToStaticMarkup(
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>{node}</TooltipProvider>
    </QueryClientProvider>,
  );

describe("a run on a real bridge", () => {
  it("says where it runs, and how it ended", () => {
    expect(runLine(bridgeRun("running"), "laptop-2")).toBe("Running on laptop-2");
    expect(runLine(bridgeRun("running"))).toBe("Running");
    expect(runLine(bridgeRun("done"))).toBe("Done");
    expect(runLine(bridgeRun("failed"))).toBe("Failed");
    expect(runLine(bridgeRun("cancelled"))).toBe("Cancelled");
  });

  it("never invents a task or a phase", () => {
    expect(runLine(bridgeRun("running"), "laptop-2")).not.toMatch(/T-|Claiming|task/);
    expect(runWord(bridgeRun("running"))).toBe("Running");
    expect(runWord(bridgeRun("done"))).toBe("Done");
    expect(runProgress(bridgeRun("running"))).toEqual({ done: 0, total: 0 });
  });

  it("shows the host and the last line in the strip, with no progress bar", () => {
    const html = view(
      <RunStatus
        run={bridgeRun("running", { lastLine: "Reading plan.md" })}
        host="laptop-2"
        onCancel={() => undefined}
      />,
    );
    expect(html).toContain("Running on laptop-2");
    expect(html).toContain("Reading plan.md");
    expect(html).toContain("Cancel");
    expect(html).not.toContain('role="progressbar"');
    // A run on the prototype's own simulation keeps its bar.
    expect(renderToStaticMarkup(<RunProgress run={run("running", "log")} />)).toContain(
      "progressbar",
    );
  });

  it("shows the exit code of a failed run as its reason", () => {
    const html = view(
      <RunNotice
        run={bridgeRun("failed", { reason: "Codex exited with code 1." })}
        onOpen={() => undefined}
      />,
    );
    expect(html).toContain("Failed: Codex exited with code 1.");
  });

  it("offers no plan for a failed run on a bridge: the plan holds no answer to it", () => {
    const failed = (reason: string) =>
      view(<RunNotice run={bridgeRun("failed", { reason })} onOpen={() => undefined} />);
    expect(failed("Codex exited with code 1.")).not.toContain("Open plan");
    expect(failed("Codex exited with code 1.")).not.toContain("<button");
    // A run of the prototype's own simulation held a task, and keeps its way to the plan.
    expect(
      view(
        <RunNotice
          run={run("failed", "log", { reason: "T-3 changed." })}
          onOpen={() => undefined}
        />,
      ),
    ).toContain("Open plan");
  });

  it("sends a lost bridge to the Agent panel, where Reconnect is", () => {
    const reason = "Lost the bridge. Codex may still be working on your computer.";
    const html = view(<RunNotice run={bridgeRun("failed", { reason })} onOpen={() => undefined} />);
    expect(html).toContain("Agent status");
    expect(html).not.toContain("Open plan");
    expect(lostBridge(bridgeRun("failed", { reason }))).toBe(true);
    expect(lostBridge(bridgeRun("failed", { reason: "Codex exited with code 1." }))).toBe(false);
    // Only a run on a bridge can lose one.
    expect(lostBridge(run("failed", "log", { reason }))).toBe(false);
  });

  it("marks the card without a task id", () => {
    const html = view(<CodexRunMarker run={bridgeRun("running")} />);
    expect(html).toContain("Running");
    expect(html).not.toContain("font-mono");
    expect(view(<CodexRunMarker run={run("running", "log")} />)).toContain("T-3");
  });

  it("lists the last line of a run that goes on", () => {
    const html = view(
      <RunsList runs={[bridgeRun("running", { lastLine: "Editing plan.md" })]} host="laptop-2" />,
    );
    expect(html).toContain("Running on laptop-2");
    expect(html).toContain("Editing plan.md");
  });
});

describe("runsLabel", () => {
  it("names the agent that did the runs", () => {
    expect(runsLabel([run("done", "done")], "claude")).toBe("Codex runs");
    expect(runsLabel([claudeRun("done")], "codex")).toBe("Claude Code runs");
  });

  it("says Agent runs when both worked on the issue", () => {
    expect(runsLabel([run("done", "done"), claudeRun("done")], "codex")).toBe("Agent runs");
  });

  it("names the agent the buttons name while there are no runs", () => {
    expect(runsLabel([], "claude")).toBe("Claude Code runs");
    expect(runsLabel([], "codex")).toBe("Codex runs");
  });
});

describe("the labels follow the agent", () => {
  const issue = { id: "wf-3k9x2", title: "Push board updates", path: "issues/wf/web/live" };
  const open = vi.fn();

  afterEach(() => {
    toast.mockClear();
    toast.error.mockClear();
    copyText.mockReset();
    // The last agent is remembered: leave Codex as the one the buttons name.
    agentControls.simulate("codex");
    agentControls.disconnect();
  });

  it("copies a codex command while Codex is the agent, and a claude command for Claude Code", async () => {
    copyText.mockResolvedValue(true);
    await copyCodexCommand(issue);
    expect(copyText.mock.calls[0]?.[0]).toMatch(/^codex 'Work on wf-3k9x2/);

    agentControls.simulate("claude");
    await copyCodexCommand(issue);
    expect(copyText.mock.calls[1]?.[0]).toMatch(/^claude 'Work on wf-3k9x2/);
    expect(toast.mock.calls.at(-1)?.[0]).toBe("Copied the Claude Code command");
  });

  it("names the agent of the panel, its prompt and its command", () => {
    agentControls.simulate("claude");
    const html = renderToStaticMarkup(<OpenInCodexPanel issue={issue} copied />);
    expect(html).toContain("Claude Code gets this prompt");
    expect(html).toContain("claude &#x27;Work on wf-3k9x2");
    expect(html).not.toContain("Codex gets");
    expect(html).not.toContain("Codex reads");
    // A panel can be shown for either agent whichever is connected.
    expect(renderToStaticMarkup(<OpenInCodexPanel issue={issue} agent="codex" />)).toContain(
      "Codex gets this prompt",
    );
  });

  it("says Do next step runs it, and asks for an agent only while none is connected", () => {
    agentControls.disconnect();
    expect(renderToStaticMarkup(<OpenInCodexPanel issue={issue} />)).toContain(
      "Do next step runs it for you once an agent is connected.",
    );
    agentControls.simulate("claude");
    const html = renderToStaticMarkup(<OpenInCodexPanel issue={issue} />);
    expect(html).toContain("Do next step runs it for you.");
    expect(html).not.toContain("once an agent is connected");
  });

  it("says the same in the tooltip", () => {
    expect(openInAgentHint("claude")).toContain("claude command");
    expect(openInAgentHint("claude")).toContain("Claude Code");
    expect(openInAgentHint("codex")).toContain("codex command");
  });

  it("toasts the end of a run with the name of the agent that did it", () => {
    announce(claudeRun("done", { task: "T-3" }), issue, open);
    expect(toast.mock.calls[0]?.[0]).toBe("Claude Code finished T-3");
    // The agent that is connected now does not matter.
    announce(claudeRun("failed", { reason: "Claude Code exited with code 2." }), issue, open);
    expect(toast.error.mock.calls[0]?.[0]).toBe("Claude Code failed");
    expect(toast.error.mock.calls[0]?.[1]).toMatchObject({
      description: "Claude Code exited with code 2.",
    });
  });

  it("names no task for a run that picked none", () => {
    announce(bridgeRun("done"), issue, open);
    expect(toast.mock.calls[0]?.[0]).toBe("Codex finished");
  });

  it("points a failed run at the plan only when the plan can answer it", () => {
    const action = (r: CodexRun) => {
      toast.error.mockClear();
      announce(r, issue, open);
      const options = toast.error.mock.calls[0]?.[1] as { action?: { label: string } } | undefined;
      return options?.action?.label;
    };
    expect(action(run("failed", "log", { reason: "T-3 changed." }))).toBe("Open plan");
    expect(action(bridgeRun("failed", { reason: "Codex exited with code 1." }))).toBeUndefined();
    expect(
      action(bridgeRun("failed", { reason: "Lost the bridge. Codex may still be working." })),
    ).toBe("Agent status");
  });
});

describe("nextStepHint", () => {
  const issue = { id: "wf-3k9x2", title: "Push board updates", path: "issues/wf/web/live" };

  it("says a connected agent does the work, by name", () => {
    expect(nextStepHint(issue, simulatedConnection("codex"))).toMatch(
      /^Codex does the next ready task/,
    );
    expect(nextStepHint(issue, simulatedConnection("claude"))).toMatch(
      /^Claude Code does the next/,
    );
  });

  it("says the click connects one when none is", () => {
    expect(nextStepHint(issue, { status: "none" })).toContain("connects one");
    expect(nextStepHint(issue, { status: "pairing", agent: "codex" })).toContain("connects one");
  });

  it("says the click opens the panel for an agent that was lost", () => {
    const lost = { ...simulatedConnection("codex"), status: "lost" as const };
    expect(nextStepHint(issue, lost)).toBe(
      "Codex stopped answering. The click opens the agent panel, where you can reconnect.",
    );
  });
});

describe("Do next step without an agent", () => {
  const state = () => useShell.getState();

  afterEach(() => {
    useShell.setState({ agentOpen: false, agentPanelOpen: false, agentStart: undefined });
  });

  it("opens the connect flow, with the run it waits to start", () => {
    askToConnect("wf-3k9x2", "next_step", "none");
    expect(state().agentOpen).toBe(true);
    expect(state().agentPanelOpen).toBe(false);
    const then = { issueId: "wf-3k9x2", kind: "next_step" };
    expect(state().agentStart).toEqual({ then });
  });

  it("picks a pairing up where it was", () => {
    askToConnect("wf-3k9x2", "next_step", "pairing");
    expect(state().agentOpen).toBe(true);
  });

  it("opens the Agent panel for an agent that was lost, so it can be reconnected", () => {
    askToConnect("wf-3k9x2", "next_step", "lost");
    expect(state().agentPanelOpen).toBe(true);
    expect(state().agentOpen).toBe(false);
    expect(state().agentStart?.then?.issueId).toBe("wf-3k9x2");
  });

  it("is what the start of a run asks for: a missing agent is an error that names its state", () => {
    expect(new AgentNotConnectedError("lost").status).toBe("lost");
    expect(new AgentNotConnectedError().status).toBe("none");
  });
});

describe("Do next step on a lost agent", () => {
  const state = () => useShell.getState();
  const lost = new AgentNotConnectedError("lost");
  const started = run("running", "claim");

  afterEach(() => {
    vi.restoreAllMocks();
    useShell.setState({ agentOpen: false, agentPanelOpen: false, agentStart: undefined });
  });

  /** A start that fails like a lost agent until `after` calls have been made. */
  const flaky = (after: number) => {
    let calls = 0;
    return vi.fn(async () => {
      calls += 1;
      if (calls <= after) throw lost;
      return started;
    });
  };

  it("asks the bridge once, and starts the step with no dialog when it answers again", async () => {
    const recheck = vi
      .spyOn(agentControls, "recheck")
      .mockResolvedValue(simulatedConnection("codex"));
    const start = flaky(1);
    await expect(startOrConnect(start, "wf-3k9x2", "next_step")).resolves.toBe(started);
    expect(recheck).toHaveBeenCalledTimes(1);
    expect(start).toHaveBeenCalledTimes(2);
    expect(state().agentPanelOpen).toBe(false);
    expect(state().agentOpen).toBe(false);
  });

  it("opens the Agent panel when the bridge still does not answer", async () => {
    const recheck = vi
      .spyOn(agentControls, "recheck")
      .mockResolvedValue({ ...simulatedConnection("codex"), status: "lost" });
    const start = flaky(5);
    await expect(startOrConnect(start, "wf-3k9x2", "next_step")).resolves.toBeUndefined();
    expect(recheck).toHaveBeenCalledTimes(1);
    expect(start).toHaveBeenCalledTimes(1);
    expect(state().agentPanelOpen).toBe(true);
    expect(state().agentStart?.then?.issueId).toBe("wf-3k9x2");
  });

  it("asks only once, even if the agent is lost again at once", async () => {
    const recheck = vi
      .spyOn(agentControls, "recheck")
      .mockResolvedValue(simulatedConnection("codex"));
    await startOrConnect(flaky(5), "wf-3k9x2", "next_step");
    expect(recheck).toHaveBeenCalledTimes(1);
    expect(state().agentPanelOpen).toBe(true);
  });

  it("does not ask the bridge when no agent was ever connected", async () => {
    const recheck = vi.spyOn(agentControls, "recheck");
    const start = vi.fn(async () => {
      throw new AgentNotConnectedError("none");
    });
    await expect(startOrConnect(start, "wf-3k9x2", "next_step")).resolves.toBeUndefined();
    expect(recheck).not.toHaveBeenCalled();
    expect(state().agentOpen).toBe(true);
  });
});
