// The Add work flow and the agent dialogs open from the shell store.
import { beforeEach, describe, expect, test } from "vitest";
import { openAddWork, openAgent, openAgentPanel, useShell } from "./shell-store";

beforeEach(() => {
  useShell.setState({
    addWorkOpen: false,
    addWorkStart: undefined,
    agentOpen: false,
    agentPanelOpen: false,
    agentStart: undefined,
  });
});

const state = () => useShell.getState();

describe("openAddWork", () => {
  test("opens the flow with nothing preselected", () => {
    openAddWork();
    expect(state().addWorkOpen).toBe(true);
    expect(state().addWorkStart).toBeUndefined();
  });

  test("opens it on a path with a group", () => {
    openAddWork({ kind: "group", group: "g-web01" });
    expect(state().addWorkOpen).toBe(true);
    expect(state().addWorkStart).toEqual({ kind: "group", group: "g-web01" });
  });

  test("a group alone is enough", () => {
    openAddWork({ group: "g-core1" });
    expect(state().addWorkStart).toEqual({ group: "g-core1" });
  });

  test("a new open replaces the old start", () => {
    openAddWork({ kind: "issue", group: "g-web01" });
    openAddWork();
    expect(state().addWorkStart).toBeUndefined();
  });

  test("closing keeps the flow's start for the exit animation, and reopening resets it", () => {
    openAddWork({ kind: "issue", group: "g-web01" });
    state().setAddWorkOpen(false);
    expect(state().addWorkOpen).toBe(false);
    expect(state().addWorkStart).toEqual({ kind: "issue", group: "g-web01" });
    state().setAddWorkOpen(true, { kind: "group" });
    expect(state().addWorkStart).toEqual({ kind: "group" });
  });
});

describe("openAgent", () => {
  test("opens the connect flow at its first question", () => {
    openAgent();
    expect(state().agentOpen).toBe(true);
    expect(state().agentStart).toBeUndefined();
  });

  test("remembers the run that Do next step asked for", () => {
    const then = { issueId: "wf-3k9x2", kind: "next_step" } as const;
    openAgent({ then });
    expect(state().agentStart).toEqual({ then });
  });

  test("names the agent when it skips the first question", () => {
    openAgent({ agent: "claude" });
    expect(state().agentStart).toEqual({ agent: "claude" });
  });

  test("a new open replaces the old start", () => {
    openAgent({ agent: "claude" });
    openAgent();
    expect(state().agentStart).toBeUndefined();
  });

  test("closing keeps the start for the exit animation", () => {
    openAgent({ agent: "codex" });
    state().setAgentOpen(false);
    expect(state().agentOpen).toBe(false);
    expect(state().agentStart).toEqual({ agent: "codex" });
  });
});

describe("openAgentPanel", () => {
  test("opens the panel, with the run that waits for a reconnect", () => {
    const then = { issueId: "wf-3k9x2", kind: "next_step" } as const;
    openAgentPanel({ then });
    expect(state().agentPanelOpen).toBe(true);
    expect(state().agentStart?.then?.issueId).toBe("wf-3k9x2");
  });

  test("the flow and the panel never show together", () => {
    openAgentPanel();
    openAgent({ agent: "claude" });
    expect(state().agentOpen).toBe(true);
    expect(state().agentPanelOpen).toBe(false);
    openAgentPanel();
    expect(state().agentOpen).toBe(false);
    expect(state().agentPanelOpen).toBe(true);
    // The panel opened by the nav row forgets the run of an earlier Do next step.
    expect(state().agentStart).toBeUndefined();
  });
});
