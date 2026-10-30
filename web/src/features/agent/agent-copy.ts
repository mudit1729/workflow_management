// The words of the agent UI, in one place: the nav row, the connect flow and the Agent panel read a
// connection through these, so one state never gets two names. Pure text and rules, no React.
import {
  AGENT_KINDS,
  type AgentConnection,
  type AgentKind,
  type AgentSkills,
  agentName,
  claudeInstallCommands,
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

/** What the row's tooltip adds: where the agent runs, or what the click does. */
export function statusHint(c: AgentConnection): string {
  switch (c.status) {
    case "none":
      return "Connect Codex or Claude Code to run Do next step from here";
    case "pairing":
      return "Waiting for the bridge. Click to finish connecting";
    case "connected":
      return `Runs on ${c.host ?? "this computer"}${c.repo ? ` · ${c.repo}` : ""}`;
    case "lost":
      return c.problem ?? "The agent stopped answering. Click to reconnect";
  }
}

/** "Bridge" for a real bridge on the person's computer, "Prototype" when the prototype answers. */
export const modeLabel = (c: AgentConnection): string =>
  c.mode === "simulated" ? "Prototype" : "Bridge";

// ---------------------------------------------------------------- skills

export interface SkillsLine {
  /** Every skill is there. */
  ok: boolean;
  /** One short sentence. */
  text: string;
}

/**
 * The skills check of a connection: "All 8 skills installed", "Skills not installed for Claude
 * Code" or, when some are missing, how many. Nothing known yet reads as installed: the line only
 * speaks about what the bridge listed.
 */
export function skillsLine(skills: AgentSkills | undefined, agent: AgentKind): SkillsLine {
  if (!skills) return { ok: true, text: "Skills not checked" };
  const total = skills.installed.length + skills.missing.length;
  if (skills.missing.length === 0)
    return { ok: true, text: `All ${total} skill${total === 1 ? "" : "s"} installed` };
  if (skills.installed.length === 0)
    return { ok: false, text: `Skills not installed for ${agentName(agent)}` };
  return {
    ok: false,
    text: `${skills.missing.length} of ${total} skills not installed for ${agentName(agent)}`,
  };
}

/** Where to run the install commands of an agent. */
export function installWhere(agent: AgentKind): string {
  return agent === "claude" ? "In a Claude Code session" : "In a clone of this repository";
}

/**
 * The commands that install the wf skills for an agent: the two that copy them for Codex
 * (`scripts/install-skills.sh --codex`), or the plugin commands of Claude Code. Before the catalog
 * is read Claude Code has only the first step, which needs no marketplace name.
 */
export function installCommands(
  agent: AgentKind,
  catalog: SkillsCatalog | undefined,
): InstallCommand[] {
  if (agent === "codex") return codexInstallCommands();
  const commands = claudeInstallCommands(catalog);
  return commands.length > 0
    ? commands
    : [{ label: "Add the marketplace", command: `/plugin marketplace add ${SKILLS_REPO}` }];
}
