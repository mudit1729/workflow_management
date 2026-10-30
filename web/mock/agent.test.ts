// The scripted side of the simulated agent (plan D14): `window.__wf.connectAgent` and
// `disconnectAgent` reach the dashboard through the mock server, and the simulated bridge answers
// with the skills of the real plugin.
import { describe, expect, test, vi } from "vitest";
import { simulatedConnection, WF_SKILL_NAMES } from "@/lib/api/agent-info";
import { allSkills } from "@/lib/api/skills";
import { createAgentHost } from "./agent";
import { createMockServer } from "./server";
import { skillsCatalog } from "./skills";

describe("the agent host", () => {
  test("connect tells the listeners which agent, Codex by default", () => {
    const host = createAgentHost();
    const heard: unknown[] = [];
    host.subscribe((e) => heard.push(e));
    expect(host.connect()).toBe("codex");
    expect(host.connect("claude")).toBe("claude");
    host.disconnect();
    expect(heard).toEqual([
      { event: "connect", agent: "codex" },
      { event: "connect", agent: "claude" },
      { event: "disconnect" },
    ]);
  });

  test("a listener that left hears nothing more; one that throws does not stop the others", () => {
    const host = createAgentHost();
    const quiet: unknown[] = [];
    const off = host.subscribe((e) => quiet.push(e));
    const heard: unknown[] = [];
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    host.subscribe(() => {
      throw new Error("boom");
    });
    host.subscribe((e) => heard.push(e));
    host.connect();
    off();
    host.disconnect();
    expect(quiet).toHaveLength(1);
    expect(heard).toHaveLength(2);
    expect(error).toHaveBeenCalled();
    error.mockRestore();
  });
});

describe("the mock server's agent controls", () => {
  test("connectAgent and disconnectAgent reach subscribeAgent", () => {
    const server = createMockServer({ latency: 0 });
    const heard: unknown[] = [];
    const off = server.subscribeAgent((e) => heard.push(e));
    server.controls.connectAgent();
    server.controls.connectAgent("claude");
    server.controls.disconnectAgent();
    off();
    server.controls.connectAgent("codex");
    expect(heard).toEqual([
      { event: "connect", agent: "codex" },
      { event: "connect", agent: "claude" },
      { event: "disconnect" },
    ]);
    server.dispose();
  });
});

describe("the simulated bridge", () => {
  test("lists exactly the skills of plugins/workflow/skills", () => {
    const names = allSkills(skillsCatalog())
      .filter((s) => s.plugin === "workflow")
      .map((s) => s.name)
      .sort();
    expect(names).toHaveLength(12);
    expect([...WF_SKILL_NAMES].sort()).toEqual(names);
  });

  test("Codex has every skill installed, Claude Code has none", () => {
    expect(simulatedConnection("codex")).toMatchObject({
      status: "connected",
      agent: "codex",
      mode: "simulated",
      host: "this computer",
      repo: "workflow_management",
      version: "codex 0.46",
      workspace: "web/mock/workspace",
      skills: { installed: [...WF_SKILL_NAMES], missing: [] },
    });
    expect(simulatedConnection("claude")).toMatchObject({
      agent: "claude",
      version: "claude 2.0",
      skills: { installed: [], missing: [...WF_SKILL_NAMES] },
    });
    // The lists are copies: changing one never changes the next answer.
    simulatedConnection("claude").skills?.missing.pop();
    expect(simulatedConnection("claude").skills?.missing).toHaveLength(12);
  });
});
