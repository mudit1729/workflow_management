// Git, pull requests and CI of an issue (plan D2). The data is derived, never stored in the
// workspace: `wf serve` reads it from git and GitHub, the prototype from a fixture while the
// sample is loaded plus whatever a Codex run adds.
import { useQuery } from "@tanstack/react-query";
import type { IssueId } from "@/gen/types";
import { api } from "./client";
import { useCodexLive } from "./codex";
import { qk } from "./keys";
import type { Commit, Delivery, PipelineRun, PullRequest } from "./types";

const NO_COMMITS: Commit[] = [];
const NO_PRS: PullRequest[] = [];
const NO_PIPELINES: PipelineRun[] = [];

export interface DeliveryState extends Delivery {
  /** True until the first read finishes. */
  isLoading: boolean;
  /** The failed read, if any: a missing issue is a `NotFoundError`. */
  error: Error | null;
}

/**
 * Commits, pull requests and CI runs of an issue, each list newest first. The lists are empty
 * (and stable) until the first read, and for an issue that has none, such as every new issue.
 * They refresh when a Codex run adds a commit or a CI run.
 */
export function useDelivery(issueId?: IssueId): DeliveryState {
  useCodexLive();
  const delivery = useQuery({
    queryKey: qk.delivery(issueId ?? ""),
    queryFn: () => api.delivery(issueId as string),
    enabled: !!issueId,
  });
  return {
    commits: delivery.data?.commits ?? NO_COMMITS,
    prs: delivery.data?.prs ?? NO_PRS,
    pipelines: delivery.data?.pipelines ?? NO_PIPELINES,
    isLoading: !!issueId && delivery.isPending,
    error: delivery.error,
  };
}
