// Ask one question: find the best passages in exactly the chosen pages (always, so the panel can
// show them), then let whoever answers write the answer. One question runs at a time: asking again
// stops the one before. A stream that fails or stops leaves the passages on screen.
import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "@/lib/api";
import type { LibraryPassage } from "@/lib/api/types";
import { type AskMode, requestFor, useResponder } from "./agent";
import { type ParsedAnswer, parseAnswer } from "./answer";

/** The passages shown with no answer. */
export const PASSAGES_SHOWN = 5;

export type AskRun =
  | { status: "idle" }
  | {
      status: "running";
      question: string;
      /** The markdown so far, when the answerer streams. */
      text: string;
      passages?: LibraryPassage[];
    }
  | {
      status: "done";
      question: string;
      mode: AskMode;
      /** Who answered, `@codex`; the prototype is "prototype". */
      by?: string;
      passages: LibraryPassage[];
      /** The agent's output as printed; none when there is no answer. */
      text?: string;
      parsed?: ParsedAnswer;
    }
  | { status: "failed"; question: string; message: string; passages?: LibraryPassage[] };

export interface Asker {
  run: AskRun;
  ask: (question: string) => void;
  /** Forget the answer (the scope changed, or a new question starts). */
  reset: () => void;
}

export function useAsker(issue: string | undefined, pages: string[]): Asker {
  const responder = useResponder();
  const [run, setRun] = useState<AskRun>({ status: "idle" });
  const stop = useRef<AbortController | undefined>(undefined);
  useEffect(() => () => stop.current?.abort(), []);

  const reset = useCallback(() => {
    stop.current?.abort();
    setRun({ status: "idle" });
  }, []);

  const ask = useCallback(
    (raw: string) => {
      const question = raw.trim();
      if (!question || !issue || pages.length === 0) return;
      stop.current?.abort();
      const control = new AbortController();
      stop.current = control;
      const live = () => !control.signal.aborted;
      setRun({ status: "running", question, text: "" });

      void (async () => {
        let passages: LibraryPassage[] | undefined;
        try {
          // Exactly the chosen pages: the search takes the list, never the whole library.
          passages = await api.librarySearch(question, { pages }, PASSAGES_SHOWN);
          if (!live()) return;
          const agent = responder.agent;
          if (!agent) {
            setRun({ status: "done", question, mode: "none", passages });
            return;
          }
          setRun({ status: "running", question, text: "", passages });
          const text = await agent.ask(
            requestFor(issue, pages, question),
            control.signal,
            (partial) => live() && setRun({ status: "running", question, text: partial, passages }),
          );
          if (!live()) return;
          setRun({
            status: "done",
            question,
            mode: responder.mode,
            by: agent.handle,
            passages,
            text,
            parsed: parseAnswer(text),
          });
        } catch (err) {
          if (!live()) return;
          setRun({
            status: "failed",
            question,
            message: err instanceof Error ? err.message : "The answer did not come.",
            ...(passages ? { passages } : {}),
          });
        }
      })();
    },
    [issue, pages, responder.agent, responder.mode],
  );

  return { run, ask, reset };
}
