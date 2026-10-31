// The words of the agent UI, in one place: the nav row, the connect flow and the Agent panel read a
// connection through these, so one state never gets two names. Pure text and rules, no React.
import {
  AGENT_KINDS,
  type AgentConnection,
  type AgentKind,
  type AgentSkills,
  agentName,
  CLAUDE_ALLOWED_TOOLS,
  claudeAllowFlags,
  claudeTeamCommands,
  codexInstallCommands,
  type InstallCommand,
  SKILLS_REPO,
  type SkillsCatalog,
} from "@/lib/api";

/** The agent that is not `kind`: what Switch offers. */
export function otherAgent(kind: AgentKind): AgentKind {
  return AGENT_KINDS.find((k) => k !== kind) ?? kind;
}

/** The agent a connection names, or Codex while none is chosen. */
export const connectionAgent = (c: AgentConnection): AgentKind => c.agent ?? "codex";

/** The nav row's words: "Connect an agent", "Codex · connected", "Codex · pairing…", "Codex · lost". */
export function statusLabel(c: AgentConnection): string {
  if (c.status === "none") return "Connect an agent";
  const name = agentName(connectionAgent(c));
  return c.status === "pairing" ? `${name} · pairing…` : `${name} · ${c.status}`;
}

/**
 * A connected agent that is missing wf skills: it answers, but Do next step would start it without
 * the skills that tell it what to do. The nav row warns in the stale tone.
 */
export const skillsMissing = (c: AgentConnection): boolean =>
  c.status === "connected" && (c.skills?.missing.length ?? 0) > 0;

/** What the row's tooltip adds: where the agent runs, or what the click does. */
export function statusHint(c: AgentConnection): string {
  switch (c.status) {
    case "none":
      return "Connect Codex or Claude Code to run Do next step from here";
    case "pairing":
      return "Waiting for the bridge. Click to finish connecting";
    case "connected": {
      const where = `Runs on ${c.host ?? "this computer"}${c.repo ? ` · ${c.repo}` : ""}`;
      return skillsMissing(c) ? `${where}. Skills missing: open to install` : where;
    }
    case "lost":
      return c.problem ?? "The agent stopped answering. Click to reconnect";
  }
}

/**
 * What to tell the person who reconnects after the agent was lost: its bridge may still run, and
 * two bridges cannot share port 7457 (the second one only prints "port 7457 is in use" in a
 * terminal the dashboard cannot see). It says "if", because a lost bridge may be gone already.
 * A connected bridge has its own line (`endedBridgeLine`), and one that stays anyway is caught as
 * it happens (`note` on the pairing, "Another bridge is still running").
 */
export function stopBridgeLine(c: AgentConnection | undefined): string | undefined {
  if (c?.mode !== "bridge" || c.status !== "lost") return undefined;
  return `If the ${agentName(connectionAgent(c))} bridge still runs, stop it first: press Ctrl+C in its terminal.`;
}

/**
 * What to tell the person who switches from a connected bridge: pairing again tells that bridge to
 * stop (so the next one finds the port free and the old code cannot be used), and the new bridge is
 * theirs to start.
 */
export function endedBridgeLine(c: AgentConnection | undefined): string | undefined {
  if (c?.mode !== "bridge" || c.status !== "connected") return undefined;
  return `The ${agentName(connectionAgent(c))} bridge on ${c.host ?? "this computer"} stopped.`;
}

/** "Bridge" for a real bridge on the person's computer, "Prototype" when the prototype answers. */
export const modeLabel = (c: AgentConnection): string =>
  c.mode === "simulated" ? "Prototype" : "Bridge";

// ---------------------------------------------------------------- skills

export interface SkillsLine {
  /** Every skill is there. */
  ok: boolean;
  /** One short sentence, for a place with no label of its own. */
  text: string;
  /** The value for a row that is already labelled "Skills": "Not installed", "5 of 12 installed". */
  value: string;
  /** Some skills are installed and some are not: the names of the missing ones are news. */
  partial: boolean;
}

/**
 * The skills check of a connection: "All 12 skills installed", "Skills not installed for Claude
 * Code" or, when some are missing, how many. Nothing known yet reads as installed: the line only
 * speaks about what the bridge listed.
 */
export function skillsLine(skills: AgentSkills | undefined, agent: AgentKind): SkillsLine {
  if (!skills)
    return { ok: true, text: "Skills not checked", value: "Not checked", partial: false };
  const total = skills.installed.length + skills.missing.length;
  if (skills.missing.length === 0)
    return {
      ok: true,
      text: `All ${total} skill${total === 1 ? "" : "s"} installed`,
      value: `All ${total} installed`,
      partial: false,
    };
  if (skills.installed.length === 0)
    return {
      ok: false,
      text: `Skills not installed for ${agentName(agent)}`,
      value: "Not installed",
      partial: false,
    };
  return {
    ok: false,
    text: `${skills.missing.length} of ${total} skills not installed for ${agentName(agent)}`,
    value: `${skills.installed.length} of ${total} installed`,
    partial: true,
  };
}

/**
 * Where to run the install commands of an agent, and what to commit. The bridge counts a skill
 * only when it is in the repository (`.claude/skills`, an `enabledPlugins` entry in
 * `.claude/settings.json`, `.agents/skills`), so a user-wide install would leave the check red;
 * committing the files is also what gives the whole team the skills.
 */
export function installWhere(agent: AgentKind): string {
  return agent === "claude"
    ? "In a shell in the repo, then commit .claude/settings.json"
    : "In a clone of this repository, then commit .agents/skills and AGENTS.md so everyone has them";
}

/**
 * The commands that install the wf skills for an agent, for everyone on the repository: the two
 * that copy them for Codex (`scripts/install-skills.sh --codex`), or the project-scope plugin
 * commands of Claude Code (the same as the Skills page's "Everyone on the repository"). Before the
 * catalog is read Claude Code has only the first step, which needs no marketplace name.
 */
export function installCommands(
  agent: AgentKind,
  catalog: SkillsCatalog | undefined,
): InstallCommand[] {
  if (agent === "codex") return codexInstallCommands();
  const commands = claudeTeamCommands(catalog);
  return commands.length > 0
    ? commands
    : [
        {
          label: "Add the marketplace to the repository",
          command: `claude plugin marketplace add ${SKILLS_REPO} --scope project`,
        },
      ];
}

// ---------------------------------------------------------------- Claude Code's allowlist

/** Where "What it can do" explains the permissions of a headless agent. */
export const ALLOW_DOC = "plugins/workflow/README.md";

// A tool pattern as the person reads it: the script's name, or the command without its wildcard.
const toolWords = (tool: string): string =>
  tool
    .replace(/^Bash\(/, "")
    .replace(/ \*\)$/, "")
    .replace(/^\*\//, "");

/**
 * A headless Claude Code in `acceptEdits` mode edits files and skips what it would have to ask
 * for: the helper scripts, `git add`, `git commit` and the project's checks. The command screen
 * says so once and offers the allowlist (`CLAUDE_ALLOWED_TOOLS`) as one button; the default stays
 * as it is, because each entry is a permission.
 */
export function allowLine(allowed: boolean): { text: string; button: string } {
  return allowed
    ? { text: `Allowed: ${CLAUDE_ALLOWED_TOOLS.map(toolWords).join(", ")}.`, button: "Undo" }
    : {
        text: "Claude Code edits files, but does not run the helper scripts or commit.",
        button: "Allow them",
      };
}

/** The pairing command with the allowlist after `--`. */
export const withAllowList = (command: string): string => `${command} ${claudeAllowFlags()}`;
