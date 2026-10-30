// The connect flow's rules: where it starts, when it may go on, what the last screen says.
import { describe, expect, it } from "vitest";
import { type AgentConnection, simulatedConnection } from "@/lib/api";
import {
  canContinue,
  doneCopy,
  initialAgent,
  initialStep,
  needsPairing,
  primaryLabel,
  stepsFor,
} from "./connect-flow";

const NONE: AgentConnection = { status: "none" };
const codex = simulatedConnection("codex");
const pairing = (agent: "codex" | "claude"): AgentConnection => ({
  status: "pairing",
  agent,
  mode: "bridge",
  pairCode: "4F7K-92",
  command: "node plugins/workflow/scripts/wf-bridge.mjs",
});

describe("stepsFor", () => {
  it("asks which agent first, unless the caller named it", () => {
    expect(stepsFor(false)).toEqual(["which", "run", "done"]);
    expect(stepsFor(true)).toEqual(["run", "done"]);
  });
});

describe("initialStep", () => {
  it("starts at the first question with nothing under way", () => {
    expect(initialStep(undefined, NONE)).toBe("which");
    expect(initialStep({}, { ...codex, status: "lost" })).toBe("which");
  });

  it("picks up a pairing or a connection where it is", () => {
    expect(initialStep(undefined, pairing("codex"))).toBe("run");
    expect(initialStep(undefined, codex)).toBe("run");
  });

  it("skips the question when the caller names the agent", () => {
    expect(initialStep({ agent: "claude" }, NONE)).toBe("run");
  });

  it("keeps a run to start without changing where it starts", () => {
    const then = { issueId: "wf-3k9x2", kind: "next_step" } as const;
    expect(initialStep({ then }, NONE)).toBe("which");
  });
});

describe("initialAgent", () => {
  it("is the one named, else the one in play, else the last chosen", () => {
    expect(initialAgent({ agent: "claude" }, codex, "codex")).toBe("claude");
    expect(initialAgent(undefined, pairing("claude"), "codex")).toBe("claude");
    expect(initialAgent(undefined, NONE, "claude")).toBe("claude");
  });
});

describe("needsPairing", () => {
  it("pairs again for another agent, or after the agent was lost", () => {
    expect(needsPairing("claude", codex)).toBe(true);
    expect(needsPairing("codex", NONE)).toBe(true);
    expect(needsPairing("codex", { ...codex, status: "lost" })).toBe(true);
  });

  it("keeps a pairing or a connection of the same agent", () => {
    expect(needsPairing("codex", codex)).toBe(false);
    expect(needsPairing("claude", pairing("claude"))).toBe(false);
  });
});

describe("canContinue", () => {
  it("lets the command screen go on only once that agent is connected", () => {
    expect(canContinue("run", "codex", pairing("codex"))).toBe(false);
    expect(canContinue("run", "codex", NONE)).toBe(false);
    expect(canContinue("run", "claude", codex)).toBe(false);
    expect(canContinue("run", "codex", { ...codex, status: "lost" })).toBe(false);
    expect(canContinue("run", "codex", codex)).toBe(true);
  });

  it("never holds back the first and last screens", () => {
    expect(canContinue("which", "codex", NONE)).toBe(true);
    expect(canContinue("done", "codex", codex)).toBe(true);
  });
});

describe("the last screen", () => {
  it("says where Do next step runs now", () => {
    expect(doneCopy({ ...codex, host: "laptop-2" })).toEqual({
      title: "Codex is connected",
      text: "Do next step now runs on laptop-2.",
    });
  });

  it("names the issue whose run starts next", () => {
    expect(doneCopy(simulatedConnection("claude"), "wf-3k9x2")).toEqual({
      title: "Claude Code is connected",
      text: "Do next step now runs on this computer. Next: start it on wf-3k9x2.",
    });
  });

  it("starts the run from its button when Do next step opened the flow", () => {
    expect(primaryLabel("done", true)).toBe("Do next step");
    expect(primaryLabel("done", false)).toBe("Done");
    expect(primaryLabel("which", false)).toBe("Continue");
    expect(primaryLabel("run", true)).toBe("Continue");
  });
});
