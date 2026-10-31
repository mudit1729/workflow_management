// The words of the agent UI: the nav row's four states, the skills check and the install commands.
import { describe, expect, it } from "vitest";
import {
  type AgentConnection,
  CLAUDE_ALLOWED_TOOLS,
  claudeAllowFlags,
  simulatedConnection,
  WF_SKILL_NAMES,
} from "@/lib/api";
import {
  allowLine,
  connectionAgent,
  endedBridgeLine,
  installCommands,
  installWhere,
  modeLabel,
  otherAgent,
  skillsLine,
  skillsMissing,
  statusHint,
  statusLabel,
  stopBridgeLine,
  withAllowList,
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

  it("says when the skills are missing, so the row's warning has a reason", () => {
    expect(statusHint({ ...claude, host: "laptop-2" })).toBe(
      "Runs on laptop-2 · workflow_management. Skills missing: open to install",
    );
    // Nothing missing, nothing said; the label stays "Claude Code · connected" either way.
    expect(statusHint(codex)).not.toContain("Skills");
    expect(statusLabel(claude)).toBe("Claude Code · connected");
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

describe("skillsMissing", () => {
  it("is true only for a connected agent that lists missing skills", () => {
    expect(skillsMissing(claude)).toBe(true);
    expect(skillsMissing(codex)).toBe(false);
    expect(skillsMissing({ status: "none" })).toBe(false);
    expect(skillsMissing({ ...claude, status: "lost" })).toBe(false);
    // A bridge that has not said anything about skills claims nothing.
    expect(skillsMissing({ ...claude, skills: undefined })).toBe(false);
  });
});

describe("stopBridgeLine", () => {
  it("asks to stop the old bridge when the agent was lost, with an if", () => {
    const lost: AgentConnection = { ...codex, mode: "bridge", status: "lost" };
    expect(stopBridgeLine(lost)).toBe(
      "If the Codex bridge still runs, stop it first: press Ctrl+C in its terminal.",
    );
    expect(stopBridgeLine({ ...lost, agent: "claude" })).toContain("Claude Code bridge");
  });

  it("says nothing for a connected bridge (it has its own line), or where there is none", () => {
    expect(stopBridgeLine({ ...codex, mode: "bridge" })).toBeUndefined();
    expect(stopBridgeLine({ ...codex, status: "lost" })).toBeUndefined();
    expect(stopBridgeLine({ status: "none" })).toBeUndefined();
    expect(stopBridgeLine(undefined)).toBeUndefined();
  });
});

describe("endedBridgeLine", () => {
  it("says a connected bridge stopped when another agent is paired", () => {
    const connected: AgentConnection = { ...codex, mode: "bridge", host: "laptop-2" };
    expect(endedBridgeLine(connected)).toBe("The Codex bridge on laptop-2 stopped.");
    expect(endedBridgeLine({ ...connected, agent: "claude", host: undefined })).toBe(
      "The Claude Code bridge on this computer stopped.",
    );
  });

  it("says nothing for the prototype, a lost bridge, no connection or a pairing", () => {
    expect(endedBridgeLine(codex)).toBeUndefined();
    expect(endedBridgeLine({ ...codex, mode: "bridge", status: "lost" })).toBeUndefined();
    expect(endedBridgeLine({ status: "pairing", agent: "codex", mode: "bridge" })).toBeUndefined();
    expect(endedBridgeLine({ status: "none" })).toBeUndefined();
    expect(endedBridgeLine(undefined)).toBeUndefined();
  });
});

describe("allowLine", () => {
  it("says what a headless Claude Code does not run, and offers the allowlist", () => {
    expect(allowLine(false)).toEqual({
      text: "Claude Code edits files, but does not run the helper scripts or commit.",
      button: "Allow them",
    });
  });

  it("names every allowed tool once it is on, as a person reads them", () => {
    const on = allowLine(true);
    expect(on.button).toBe("Undo");
    expect(on.text).toBe("Allowed: wf-env.sh, wf-status.sh, git add, git commit, pnpm.");
    expect(on.text.split(",").length).toBe(CLAUDE_ALLOWED_TOOLS.length);
  });

  it("puts the allowlist after the bridge's own arguments, behind `--`", () => {
    const command = withAllowList(
      "node plugins/workflow/scripts/wf-bridge.mjs --agent claude --pair 4F7K-92",
    );
    expect(command).toBe(
      `node plugins/workflow/scripts/wf-bridge.mjs --agent claude --pair 4F7K-92 ${claudeAllowFlags()}`,
    );
    expect(command).toMatch(/--pair 4F7K-92 -- --allowedTools 'Bash\(\*\/wf-env\.sh \*\)'/);
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
      text: "All 8 skills installed",
      value: "All 8 installed",
      partial: false,
    });
  });

  it("names the agent when none of the skills is installed", () => {
    expect(skillsLine(claude.skills, "claude")).toEqual({
      ok: false,
      text: "Skills not installed for Claude Code",
      value: "Not installed",
      partial: false,
    });
  });

  it("counts what is missing when some are", () => {
    const skills = { installed: WF_SKILL_NAMES.slice(0, 5), missing: WF_SKILL_NAMES.slice(5) };
    expect(skillsLine(skills, "codex")).toEqual({
      ok: false,
      text: "3 of 8 skills not installed for Codex",
      value: "5 of 8 installed",
      partial: true,
    });
  });

  it("gives a labelled row a value that does not repeat its label", () => {
    // The row already says "Skills": "Skills not installed" would say it twice.
    expect(skillsLine(claude.skills, "claude").value).not.toMatch(/skill/i);
    expect(skillsLine(undefined, "codex").value).toBe("Not checked");
  });

  it("does not claim anything about skills nobody listed", () => {
    expect(skillsLine(undefined, "codex")).toEqual({
      ok: true,
      text: "Skills not checked",
      value: "Not checked",
      partial: false,
    });
  });
});

describe("installCommands", () => {
  const catalog = {
    marketplace: { name: "wf-market", path: ".claude-plugin/marketplace.json" },
    plugins: [
      { name: "workflow", description: "", path: "plugins/workflow", tags: [], skills: [] },
    ],
  };

  it("copies the skills for Codex", () => {
    expect(installCommands("codex", undefined)[0]?.command).toBe(
      "scripts/install-skills.sh --codex",
    );
  });

  it("installs for the repository for Claude Code, which is what the bridge counts", () => {
    // `/plugin install` and `claude plugin install` default to user scope: the bridge looks only in
    // the repository's `.claude`, so a user-scope install would leave the check red.
    expect(installCommands("claude", catalog).map((c) => c.command)).toEqual([
      expect.stringMatching(/^claude plugin marketplace add .+ --scope project$/),
      "claude plugin install workflow@wf-market --scope project",
    ]);
    expect(
      installCommands("claude", catalog)
        .map((c) => c.command)
        .join("\n"),
    ).not.toContain("/plugin");
  });

  it("adds the marketplace to the repository before the catalog is read", () => {
    const [first, ...rest] = installCommands("claude", undefined);
    expect(first?.command).toMatch(/^claude plugin marketplace add .+ --scope project$/);
    expect(rest).toEqual([]);
  });
});

describe("installWhere", () => {
  it("says to commit what the install wrote, so the whole team has the skills", () => {
    expect(installWhere("claude")).toBe(
      "In a shell in the repo, then commit .claude/settings.json",
    );
    expect(installWhere("codex")).toBe(
      "In a clone of this repository, then commit .agents/skills and AGENTS.md so everyone has them",
    );
  });
});
