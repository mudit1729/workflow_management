// The words of the agent UI: the nav row's four states, the skills check and the install commands.
import { describe, expect, it } from "vitest";
import { type AgentConnection, simulatedConnection, WF_SKILL_NAMES } from "@/lib/api";
import {
  connectionAgent,
  installCommands,
  modeLabel,
  otherAgent,
  skillsLine,
  statusHint,
  statusLabel,
} from "./agent-copy";

const codex = simulatedConnection("codex");
const claude = simulatedConnection("claude");

describe("statusLabel", () => {
  it("asks to connect an agent while there is none", () => {
    expect(statusLabel({ status: "none" })).toBe("Connect an agent");
  });

  it("names the agent and the state", () => {
    expect(statusLabel(codex)).toBe("Codex · connected");
    expect(statusLabel(claude)).toBe("Claude Code · connected");
    expect(statusLabel({ status: "pairing", agent: "codex" })).toBe("Codex · pairing…");
    expect(statusLabel({ ...codex, status: "lost" })).toBe("Codex · lost");
  });
});

describe("statusHint", () => {
  it("says where the agent runs, and what the click does otherwise", () => {
    expect(statusHint({ status: "none" })).toContain("Connect Codex or Claude Code");
    expect(statusHint({ status: "pairing", agent: "claude" })).toContain("Waiting for the bridge");
    expect(statusHint({ ...codex, host: "laptop-2" })).toBe(
      "Runs on laptop-2 · workflow_management",
    );
  });

  it("gives a lost agent's own reason, else asks to reconnect", () => {
    const lost: AgentConnection = {
      ...codex,
      status: "lost",
      problem: "The bridge does not answer.",
    };
    expect(statusHint(lost)).toBe("The bridge does not answer.");
    expect(statusHint({ ...lost, problem: undefined })).toContain("reconnect");
  });
});

describe("agent names", () => {
  it("offers the other agent to switch to", () => {
    expect(otherAgent("codex")).toBe("claude");
    expect(otherAgent("claude")).toBe("codex");
  });

  it("falls back to Codex while no agent is chosen", () => {
    expect(connectionAgent({ status: "none" })).toBe("codex");
    expect(connectionAgent(claude)).toBe("claude");
  });

  it("calls a real bridge Bridge and the simulation Prototype", () => {
    expect(modeLabel({ ...codex, mode: "bridge" })).toBe("Bridge");
    expect(modeLabel(codex)).toBe("Prototype");
  });
});

describe("skillsLine", () => {
  it("is ok when every skill is installed", () => {
    expect(skillsLine(codex.skills, "codex")).toEqual({
      ok: true,
      text: "All 12 skills installed",
    });
  });

  it("names the agent when none of the skills is installed", () => {
    expect(skillsLine(claude.skills, "claude")).toEqual({
      ok: false,
      text: "Skills not installed for Claude Code",
    });
  });

  it("counts what is missing when some are", () => {
    const skills = { installed: WF_SKILL_NAMES.slice(0, 5), missing: WF_SKILL_NAMES.slice(5) };
    expect(skillsLine(skills, "codex")).toEqual({
      ok: false,
      text: "7 of 12 skills not installed for Codex",
    });
  });

  it("does not claim anything about skills nobody listed", () => {
    expect(skillsLine(undefined, "codex")).toEqual({ ok: true, text: "Skills not checked" });
  });
});

describe("installCommands", () => {
  it("copies the skills for Codex", () => {
    expect(installCommands("codex", undefined)[0]?.command).toBe(
      "scripts/install-skills.sh --codex",
    );
  });

  it("adds the marketplace for Claude Code before the catalog is read", () => {
    const [first] = installCommands("claude", undefined);
    expect(first?.command).toMatch(/^\/plugin marketplace add /);
  });

  it("adds the marketplace and installs each plugin once the catalog is read", () => {
    const catalog = {
      marketplace: { name: "wf-market", path: ".claude-plugin/marketplace.json" },
      plugins: [
        { name: "workflow", description: "", path: "plugins/workflow", tags: [], skills: [] },
      ],
    };
    expect(installCommands("claude", catalog).map((c) => c.command)).toEqual([
      expect.stringMatching(/^\/plugin marketplace add /),
      "/plugin install workflow@wf-market",
    ]);
  });
});
