// Add work (plan D6): Codex splits a group into issue proposals, and `create_work` writes the
// group and the issues the person keeps in one commit.
import { useCallback, useRef, useState } from "react";
import { toast } from "sonner";
import type { WorkspaceSnapshot } from "@/gen/types";
import { api } from "./client";
import { firstProblem, isConflictError, isUnprocessableError } from "./error";
import { qk } from "./keys";
import { queryClient } from "./query-client";
import {
  type CreateWorkResult,
  SPLIT_STEPS,
  type SplitInput,
  type SplitResult,
  type WorkGroup,
  type WorkIssueInput,
  type WorkOpResult,
} from "./types";

/**
 * Say why a request failed, once. The toast has a stable id per kind of request, so two failures
 * of the same request (React StrictMode runs an effect twice in development) replace each other
 * instead of stacking.
 */
function explain(err: unknown, what: string) {
  const id = `work:${what}`;
  if (isConflictError(err)) {
    toast.warning(`${err.body.reason}. Try again.`, { id, description: "Nothing was added." });
    return;
  }
  if (isUnprocessableError(err)) {
    const { message, hint } = firstProblem(err);
    toast.error(message, { id, ...(hint ? { description: hint } : {}) });
    return;
  }
  toast.error(`Could not ${what}`, {
    id,
    description: err instanceof Error ? err.message : "Try again in a moment.",
  });
}

export interface SplitWork {
  /**
   * Ask Codex to split a group into issues. Takes about 2 s. Resolves to 3 to 5 proposals, or to
   * `undefined` after a toast when the request failed.
   */
  split: (input: SplitInput) => Promise<SplitResult | undefined>;
  /** The progress lines, in order. */
  steps: readonly string[];
  /** Index in `steps` of the step in progress; -1 when no split is running. */
  step: number;
  pending: boolean;
}

export function useSplitWork(): SplitWork {
  const [step, setStep] = useState(-1);
  // A second split may start while the first one still runs (the person went back and changed
  // the outcome): only the latest call drives the progress.
  const latest = useRef(0);

  const split = useCallback(async (input: SplitInput) => {
    latest.current += 1;
    const call = latest.current;
    const show = (value: number) => {
      if (latest.current === call) setStep(value);
    };
    show(0);
    try {
      return await api.splitWork(input, show);
    } catch (err) {
      // A later call took over (the person went back, or StrictMode ran the effect twice): its
      // answer is the one to report.
      if (latest.current === call) explain(err, "draft with Codex");
      return undefined;
    } finally {
      show(-1);
    }
  }, []);

  return { split, steps: SPLIT_STEPS, step, pending: step >= 0 };
}

/**
 * Add work: the group (an id, or a new one under a parent) and 1 to 8 issues, written together in
 * one commit. Resolves to the ids it created, or to `undefined` after a toast when the server
 * refused the change. Nothing is optimistic: the board shows the issues when the commit lands.
 */
export function useCreateWork() {
  return useCallback(
    async (args: {
      group: WorkGroup;
      issues: WorkIssueInput[];
      base_rev?: string;
    }): Promise<CreateWorkResult | undefined> => {
      const base =
        args.base_rev ?? queryClient.getQueryData<WorkspaceSnapshot>(qk.snapshot())?.rev ?? "";
      try {
        const res = (await api.ops({
          op: "create_work",
          base_rev: base,
          group: args.group,
          issues: args.issues,
        })) as WorkOpResult;
        void queryClient.invalidateQueries({ queryKey: qk.snapshot() });
        // Linked library items list who uses them: they read again.
        if (args.issues.some((i) => i.links?.length)) {
          void queryClient.invalidateQueries({ queryKey: ["library"] });
          void queryClient.invalidateQueries({ queryKey: ["issue"] });
        }
        return res.work ?? { groupId: res.created ?? "", issueIds: [] };
      } catch (err) {
        void queryClient.invalidateQueries({ queryKey: qk.snapshot() });
        explain(err, "add the work");
        return undefined;
      }
    },
    [],
  );
}
