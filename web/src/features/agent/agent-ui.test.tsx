// The agent UI's parts that need no data layer: what the connect flow's command screen says before
// and after the bridge answers, the Skills section of the Agent panel, and the nav row's warning
// for a connected agent without skills. (The test environment has no DOM, so these render to
// markup.)
import { QueryClientProvider } from "@tanstack/react-query";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { TooltipProvider } from "@/components/ui";
import {
  type AgentConnection,
  pairCommand,
  queryClient,
  simulatedConnection,
  WF_SKILL_NAMES,
} from "@/lib/api";
import { AgentPanelBody } from "./AgentPanel";
import { AgentStatusRow } from "./AgentStatus";
import { ConnectScreen } from "./ConnectScreens";
import { CommandBox } from "./parts";
import type { ConnectFlow } from "./useConnectFlow";

const view = (node: React.ReactElement) =>
  renderToStaticMarkup(
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>{node}</TooltipProvider>
    </QueryClientProvider>,
  );

const noop = () => undefined;
const codex = simulatedConnection("codex");
const claude = simulatedConnection("claude");
const bridge = (c: AgentConnection): AgentConnection => ({
  ...c,
  mode: "bridge",
  host: "laptop-2",
});

const pairing = (agent: "codex" | "claude"): AgentConnection => ({
  status: "pairing",
  agent,
  mode: "bridge",
  pairCode: "7RQT-KN",
  command: pairCommand(agent, "7RQT-KN"),
});

/** The command screen on a fixed connection, as the gallery frames it. */
function flowOf(connection: AgentConnection, extra: Partial<ConnectFlow> = {}): ConnectFlow {
  return {
    step: "run",
    steps: ["which", "run", "done"],
    index: 1,
    agent: connection.agent ?? "codex",
    connection,
    ready: connection.status === "connected",
    pick: noop,
    advance: noop,
    back: noop,
    goTo: noop,
    retry: noop,
    simulate: noop,
    onKeyDown: noop,
    digits: { current: undefined },
    ...extra,
  };
}

describe("the command screen", () => {
  it("shows the command with Copy while it waits for the bridge", () => {
    const html = view(<ConnectScreen flow={flowOf(pairing("codex"))} />);
    expect(html).toContain("--pair");
    expect(html).toContain("Copy");
    expect(html).toContain("Open a terminal at the repo root");
    expect(html).toContain("Waiting for the bridge");
  });

  it("asks to stop the old bridge first when the agent was lost", () => {
    const stop = "If the Codex bridge still runs, stop it first: press Ctrl+C in its terminal.";
    const html = view(<ConnectScreen flow={flowOf(pairing("codex"), { stopBridge: stop })} />);
    expect(html).toContain(stop);
    expect(html).toContain("Then paste this at the repo root");
  });

  it("says the connected bridge stopped when another agent is paired", () => {
    const html = view(
      <ConnectScreen
        flow={flowOf(pairing("claude"), { stopped: "The Codex bridge on laptop-2 stopped." })}
      />,
    );
    expect(html).toContain("The Codex bridge on laptop-2 stopped.");
    expect(html).toContain("Paste this at the repo root to start the new one");
    expect(html).not.toContain("Open a terminal at the repo root");
  });

  it("tells Claude Code's permissions in one line with a button, and points to the README", () => {
    const html = view(<ConnectScreen flow={flowOf(pairing("claude"))} />);
    expect(html).toContain('data-wf="AllowLine"');
    expect(html).toContain("does not run the helper scripts or commit");
    expect(html).toContain("Allow them");
    expect(html).toContain("plugins/workflow/README.md");
    // Off until asked: the command carries no allowlist.
    expect(html).not.toContain("--allowedTools");
  });

  it("has no permissions line for Codex", () => {
    const html = view(<ConnectScreen flow={flowOf(pairing("codex"))} />);
    expect(html).not.toContain('data-wf="AllowLine"');
  });

  it("says what an old bridge on the port is, without calling it an error", () => {
    const html = view(
      <ConnectScreen
        flow={flowOf({ ...pairing("claude"), note: "Another bridge is still running." })}
      />,
    );
    expect(html).toContain("Another bridge is still running.");
    expect(html).toContain('data-wf="PairNote"');
    expect(html).not.toContain("Try again");
  });

  it("keeps the spent code to one quiet line, with Copy only for the install commands", () => {
    const connected = bridge({ ...codex, skills: { installed: [...WF_SKILL_NAMES], missing: [] } });
    // The connection forgets the command once it is connected; the screen keeps what it had.
    const html = view(
      <ConnectScreen flow={flowOf({ ...connected, command: pairing("codex").command })} />,
    );
    expect(html).toContain("Paired with code");
    expect(html).toContain("7RQT-KN");
    expect(html).not.toContain("Copy");
    expect(html).not.toContain("wf-bridge.mjs");
    expect(html).toContain("Leave the bridge running");
  });

  it("names no code for the prototype, which never ran the command", () => {
    const html = view(
      <ConnectScreen flow={flowOf({ ...claude, command: pairCommand("claude", "7RQT-KN") })} />,
    );
    expect(html).not.toContain("Paired with code");
    expect(html).toContain("Prototype: there is no bridge to run.");
  });

  it("gives the Skills row a short value and the commands that install for the repository", () => {
    const html = view(<ConnectScreen flow={flowOf(bridge(claude), { agent: "claude" })} />);
    expect(html).toContain("Not installed");
    expect(html).not.toContain("Skills not installed");
    expect(html).toContain("In a shell in the repo, then commit .claude/settings.json");
    expect(html).toContain("--scope");
    expect(html).not.toContain("You can go on without them");
  });
});

describe("CommandBox", () => {
  const text = (html: string) => html.replace(/<wbr\/>|<[^>]+>/g, "");

  it("keeps the command's text for Copy and for selection", () => {
    const command = pairCommand("claude", "3GV4-NR");
    // The words are tokens in the markup, but the characters are the command's own.
    expect(text(view(<CommandBox command={command} />))).toContain(command);
  });

  it("keeps a flag with its value and the file name in one piece", () => {
    const html = view(<CommandBox command={pairCommand("claude", "3GV4-NR")} />);
    // `--agent claude` and `--pair 3GV4-NR` are each one token: a narrow line breaks between them.
    expect(html).toMatch(/whitespace-nowrap">--agent claude</);
    expect(html).toMatch(/whitespace-nowrap">--pair 3GV4-NR</);
    // `wf-bridge.mjs` does not break at its hyphen: the path breaks only after a slash.
    expect(html).toMatch(/whitespace-nowrap">wf-bridge\.mjs</);
  });
});

describe("the Agent panel's Skills section", () => {
  const body = (connection: AgentConnection, waitingFor?: string) =>
    view(
      <AgentPanelBody
        connection={connection}
        runs={[]}
        waitingFor={waitingFor}
        onConnect={noop}
        onSwitch={noop}
        onDisconnect={noop}
        onReconnect={noop}
        onCheck={noop}
        onOpenIssue={noop}
      />,
    );

  it("says it once when none is installed, and does not list eight names", () => {
    const html = body(bridge(claude));
    expect(html).toContain("Not installed");
    expect(html).not.toContain("Missing:");
    expect(html).not.toContain("0 of 12");
    expect(html).not.toContain("Skills not installed for Claude Code");
  });

  it("names the missing skills when some are installed", () => {
    const skills = { installed: WF_SKILL_NAMES.slice(0, 5), missing: WF_SKILL_NAMES.slice(5) };
    const html = body(bridge({ ...codex, skills }));
    expect(html).toContain("5 of 12 installed");
    expect(html).toContain("Missing:");
    expect(html).toContain(WF_SKILL_NAMES[7]);
  });

  it("has no install commands once every skill is there", () => {
    const html = body(bridge(codex));
    expect(html).toContain("All 12 installed");
    expect(html).not.toContain('data-wf="InstallSkills"');
  });

  it("holds the step that waits inside the one warning of a lost agent", () => {
    const lost: AgentConnection = { ...bridge(codex), status: "lost", problem: "It stopped." };
    const html = body(lost, "wf-3k9x2");
    expect(html.replace(/<[^>]+>/g, "")).toContain(
      "Reconnect, then Do next step starts on wf-3k9x2.",
    );
    // One band: the sentence is the warning's second line, before its Check again, and no accent
    // band competes with it.
    expect(html).not.toContain("bg-accent-subtle");
    const at = (text: string) => html.indexOf(text);
    expect(at("It stopped.")).toBeLessThan(at("Reconnect, then"));
    expect(at("Reconnect, then")).toBeLessThan(at("Check again"));
  });
});

describe("the nav row", () => {
  const row = (connection: AgentConnection) =>
    view(<AgentStatusRow connection={connection} onClick={noop} />);

  it("warns in the stale tone for a connected agent without skills, and keeps its label", () => {
    const html = row(claude);
    expect(html).toContain("data-warn");
    expect(html).toContain("text-stale-text");
    expect(html).toContain("bg-stale");
    expect(html).toContain("connected");
  });

  it("stays calm for an agent with every skill", () => {
    const html = row(codex);
    expect(html).not.toContain("data-warn");
    expect(html).not.toContain("text-stale-text");
    expect(html).toContain("bg-status-done");
  });
});
