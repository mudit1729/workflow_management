// The connect flow's state and its keys (plan D10). One hook holds the answer, the screen on show
// and the pairing, so the dialog and the gallery's frames run the same flow. The connection itself
// is the shared store of `@/lib/api` (`useAgent`): this hook starts a pairing, never keeps one.
import {
  type KeyboardEvent,
  type RefObject,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import type { AgentStart, AgentThen } from "@/app/shell-store";
import { isTypingTarget } from "@/features/add-work/parts";
import {
  type AgentConnection,
  type AgentKind,
  useAgent,
  useAgentControls,
  usePreferredAgent,
} from "@/lib/api";
import {
  canContinue,
  initialAgent,
  initialStep,
  needsPairing,
  type StepId,
  stepsFor,
} from "./connect-flow";

/** What a gallery frame fixes: the screen, the answer and the connection it shows. */
export interface FlowSeed {
  step?: StepId;
  agent?: AgentKind;
  /** Show this connection and talk to no bridge: picking, retrying and Simulate do nothing. */
  connection?: AgentConnection;
}

export interface ConnectFlow {
  step: StepId;
  steps: StepId[];
  index: number;
  /** The answer to "Which agent?": the agent being connected. */
  agent: AgentKind;
  connection: AgentConnection;
  /** The run to start when the flow ends: Do next step opened it. */
  then?: AgentThen;
  /** The screen's answer is complete: the person can go on. */
  ready: boolean;
  /** Choose an agent without leaving the screen (a number key, an arrow). */
  pick: (agent: AgentKind) => void;
  /** Go on, first choosing `agent` (a click on an answer button). The last screen finishes. */
  advance: (agent?: AgentKind) => void;
  back: () => void;
  goTo: (index: number) => void;
  /** Pair again with a new code (a pairing that stopped for good). */
  retry: () => void;
  /** Dev only: connect without a bridge, as the prototype. */
  simulate: () => void;
  /** Number keys, Backspace, ← and Enter, for the element that holds the flow. */
  onKeyDown: (e: KeyboardEvent) => void;
  /** Screens put their number-key handler here. */
  digits: RefObject<((n: number) => void) | undefined>;
}

export function useConnectFlow({
  start,
  onFinish,
  seed,
}: {
  start?: AgentStart;
  /** The last screen was passed: close, and start the run `then` names. */
  onFinish: (then?: AgentThen) => void;
  seed?: FlowSeed;
}): ConnectFlow {
  const live = useAgent();
  const controls = useAgentControls();
  const preferred = usePreferredAgent();
  const frozen = seed?.connection !== undefined;
  const connection = seed?.connection ?? live;

  const skipWhich = !!start?.agent;
  const then = start?.then;
  const steps = stepsFor(skipWhich);
  const [agent, setAgent] = useState<AgentKind>(
    () => seed?.agent ?? initialAgent(start, connection, preferred),
  );
  const [step, setStep] = useState<StepId>(() => seed?.step ?? initialStep(start, connection));
  const digits = useRef<((n: number) => void) | undefined>(undefined);

  // Opened on the command screen with nothing paired yet (Switch to…, Reconnect): the pairing
  // starts when the flow opens, and only then. The ref keeps the strict-mode double run from
  // making two codes.
  const began = useRef(false);
  // biome-ignore lint/correctness/useExhaustiveDependencies: on opening only; a later change of the connection is not a reason to pair again.
  useEffect(() => {
    if (began.current) return;
    began.current = true;
    if (!frozen && step === "run" && needsPairing(agent, connection)) void controls.begin(agent);
  }, []);

  const at = Math.max(0, steps.indexOf(step));
  const ready = canContinue(step, agent, connection);

  const pair = useCallback(
    (kind: AgentKind) => {
      if (!frozen && needsPairing(kind, connection)) void controls.begin(kind);
    },
    [frozen, connection, controls],
  );

  const advance = useCallback(
    (kind?: AgentKind) => {
      const chosen = kind ?? agent;
      if (kind) setAgent(kind);
      if (step === "which") {
        pair(chosen);
        setStep("run");
      } else if (step === "run") {
        if (canContinue(step, chosen, connection)) setStep("done");
      } else {
        onFinish(then);
      }
    },
    [agent, step, connection, pair, onFinish, then],
  );

  // Leaving the command screen backwards ends a pairing nobody finished; a connection stays.
  const leave = useCallback(() => {
    if (step === "run" && connection.status === "pairing" && !frozen) controls.cancel();
  }, [step, connection.status, frozen, controls]);

  const back = useCallback(() => {
    if (at === 0) return;
    leave();
    setStep(steps[at - 1]);
  }, [at, steps, leave]);

  const goTo = useCallback(
    (i: number) => {
      if (i < 0 || i >= at) return;
      leave();
      setStep(steps[i]);
    },
    [at, steps, leave],
  );

  const onKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.nativeEvent.isComposing) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (isTypingTarget(e.target)) return;
      if (/^[1-9]$/.test(e.key)) {
        if (digits.current) {
          e.preventDefault();
          digits.current(Number(e.key));
        }
      } else if (e.key === "Backspace" || e.key === "ArrowLeft") {
        e.preventDefault();
        back();
      } else if (e.key === "Enter") {
        // A focused button or answer handles Enter itself.
        if ((e.target as HTMLElement).closest("button, a, [role='radio']")) return;
        e.preventDefault();
        advance();
      }
    },
    [back, advance],
  );

  return {
    step,
    steps,
    index: at,
    agent,
    connection,
    then,
    ready,
    pick: setAgent,
    advance,
    back,
    goTo,
    retry: () => {
      if (!frozen) void controls.begin(agent);
    },
    simulate: () => {
      if (!frozen) controls.simulate(agent);
    },
    onKeyDown,
    digits,
  };
}
