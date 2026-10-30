// Kit entries of the Criteria, Git and CI tabs (plan D1 and D2). Not registered yet: the integrator
// adds `issueDeliveryEntries` to `registry.ts`, and may give Git and CI groups of their own in
// `kit-ui.tsx` (they sit in Issue · Goal and Issue · Log for now).
import { CiDot, RunStateIcon, TrailerCopy } from "@/features/issue/delivery-ui";
import { CiTab, PipelineRow } from "@/features/issue/tabs/CiTab";
import { CriteriaTab } from "@/features/issue/tabs/CriteriaTab";
import { CommitRow, GitTab, PullRequestRow } from "@/features/issue/tabs/GitTab";
import type { Commit, PipelineRun, PullRequest } from "@/lib/api";
import { entry, type KitEntry, Row, Sandbox, V, WithDetail } from "../kit-ui";
import { ISSUE } from "./data";

const SRC = "src/features/issue";

const ago = (minutes: number) => new Date(Date.now() - minutes * 60_000).toISOString();

/** The rows are list items: give them the list the tabs put them in. */
function RowList({ children }: { children: React.ReactNode }) {
  return (
    <ul className="flex flex-col divide-y divide-border rounded-md border border-border">
      {children}
    </ul>
  );
}

// ---------------------------------------------------------------- CriteriaTab

function CriteriaTabBody() {
  return (
    <>
      <V label="wf-3k9x2 · 2 verified, 1 claimed, 2 open, one criterion without a task" width={560}>
        <Sandbox quiet>
          <WithDetail id={ISSUE.rich}>
            {(d) => <CriteriaTab detail={d} variant="drawer" />}
          </WithDetail>
        </Sandbox>
      </V>
      <V label="wf-m3tq8 · all verified" width={560}>
        <Sandbox quiet>
          <WithDetail id={ISSUE.cleanDone}>
            {(d) => <CriteriaTab detail={d} variant="drawer" />}
          </WithDetail>
        </Sandbox>
      </V>
      <V label="wf-h2tb7 · criteria without a plan" width={560}>
        <Sandbox quiet>
          <WithDetail id={ISSUE.noPlan}>
            {(d) => <CriteriaTab detail={d} variant="drawer" />}
          </WithDetail>
        </Sandbox>
      </V>
      <V
        label="wf-7yq2m · goal.md does not parse"
        note="No criteria can be read, so the tab points at the Goal tab, which shows the finding."
        width={560}
      >
        <Sandbox quiet>
          <WithDetail id={ISSUE.badYaml}>
            {(d) => <CriteriaTab detail={{ ...d, criteria: [] }} variant="drawer" />}
          </WithDetail>
        </Sandbox>
      </V>
      <V label="no criteria yet" note="Spread of wf-f6qa2 with an empty list." width={560}>
        <Sandbox quiet>
          <WithDetail id="wf-f6qa2">
            {(d) => <CriteriaTab detail={{ ...d, criteria: [] }} variant="drawer" />}
          </WithDetail>
        </Sandbox>
      </V>
    </>
  );
}

// ---------------------------------------------------------------- GitTab

function GitTabBody() {
  return (
    <>
      <V
        label="wf-3k9x2 · a draft and an open pull request, six commits"
        note="A T-n pill switches to the Plan tab and selects that task. #41 scrolls to its pull request. The sha copies on click."
        width={560}
      >
        <Sandbox quiet>
          <WithDetail id={ISSUE.rich}>{(d) => <GitTab detail={d} variant="drawer" />}</WithDetail>
        </Sandbox>
      </V>
      <V label="wf-b1d7v · one draft, four merged" width={560}>
        <Sandbox quiet>
          <WithDetail id={ISSUE.crowded}>
            {(d) => <GitTab detail={d} variant="drawer" />}
          </WithDetail>
        </Sandbox>
      </V>
      <V label="wf-c2pn6 · a merged and a closed pull request with a failed check" width={560}>
        <Sandbox quiet>
          <WithDetail id={ISSUE.doneUnmet}>
            {(d) => <GitTab detail={d} variant="drawer" />}
          </WithDetail>
        </Sandbox>
      </V>
      <V
        label="wf-a7ne5 · nothing links to the issue yet"
        note="The empty state teaches the link: the trailer, or a branch named after the issue."
        width={560}
      >
        <Sandbox quiet>
          <WithDetail id={ISSUE.stale}>{(d) => <GitTab detail={d} variant="drawer" />}</WithDetail>
        </Sandbox>
      </V>
    </>
  );
}

// ---------------------------------------------------------------- PullRequestRow

const pr = (over: Partial<PullRequest> & Pick<PullRequest, "number" | "state">): PullRequest => ({
  title: "Push board updates over SSE",
  branch: `${ISSUE.rich}/sse-delta-stream`,
  author: "codex",
  updated_at: ago(12),
  checks: { passed: 5, failed: 0, pending: 0 },
  review: "pending",
  url: null,
  ...over,
});

function PullRequestRowBody() {
  return (
    <V label="every state · review and checks vary" width={560}>
      <RowList>
        <PullRequestRow
          pr={pr({ number: 41, state: "draft", checks: { passed: 5, failed: 0, pending: 1 } })}
          issueId={ISSUE.rich}
          fresh={false}
        />
        <PullRequestRow
          pr={pr({
            number: 36,
            state: "open",
            title: "Diff snapshots and suppress watcher echoes",
            review: "changes_requested",
            checks: { passed: 6, failed: 0, pending: 0 },
          })}
          issueId={ISSUE.rich}
          fresh={false}
        />
        <PullRequestRow
          pr={pr({
            number: 37,
            state: "open",
            title: "Stop retrying the watcher on a failed rescan",
            review: "pending",
            checks: { passed: 4, failed: 1, pending: 0 },
            author: "claude-opus",
          })}
          issueId={ISSUE.rich}
          fresh={false}
        />
        <PullRequestRow
          pr={pr({ number: 29, state: "merged", review: "approved", updated_at: ago(3 * 60) })}
          issueId={ISSUE.rich}
          fresh={false}
        />
        <PullRequestRow
          pr={pr({
            number: 20,
            state: "closed",
            review: "changes_requested",
            checks: { passed: 0, failed: 0, pending: 0 },
            updated_at: ago(2 * 24 * 60),
          })}
          issueId={ISSUE.rich}
          fresh={false}
        />
      </RowList>
    </V>
  );
}

// ---------------------------------------------------------------- CommitRow

const commit = (
  over: Partial<Commit> & Pick<Commit, "sha" | "subject">,
  minutes: number,
): Commit => ({
  author: "codex",
  at: ago(minutes),
  branch: `${ISSUE.rich}/sse-delta-stream`,
  files_changed: 2,
  trailer: `Issue: ${ISSUE.rich}`,
  ...over,
});

function CommitRowBody() {
  return (
    <V
      label="linked by the trailer, by the branch name only, and with no task or pull request"
      note="Hover the sha: the tooltip says how the commit found the issue."
      width={560}
    >
      <Sandbox quiet>
        <WithDetail id={ISSUE.rich}>
          {(d) => {
            const tasks = d.plan?.phases.flatMap((p) => p.tasks) ?? [];
            const task = (id: string) => tasks.find((t) => t.id === id);
            return (
              <RowList>
                <CommitRow
                  commit={commit(
                    { sha: "0d4a6c1", subject: "Send snapshot on connect", task: "T-3", pr: 41 },
                    33,
                  )}
                  issueId={ISSUE.rich}
                  task={task("T-3")}
                  prs={[pr({ number: 41, state: "draft" })]}
                  onOpenTask={() => undefined}
                  fresh={false}
                />
                <CommitRow
                  commit={commit(
                    {
                      sha: "b81f03a",
                      subject: "Test live_append within 2 s",
                      task: "T-1",
                      pr: 36,
                      trailer: undefined,
                      branch: `${ISSUE.rich}/index-deltas`,
                    },
                    26 * 60,
                  )}
                  issueId={ISSUE.rich}
                  task={task("T-1")}
                  prs={[pr({ number: 36, state: "open" })]}
                  onOpenTask={() => undefined}
                  fresh={false}
                />
                <CommitRow
                  commit={commit(
                    {
                      sha: "7e21c0f",
                      subject: "Fix typo in the SSE retry comment",
                      files_changed: 1,
                      author: "shruti",
                    },
                    3 * 24 * 60,
                  )}
                  issueId={ISSUE.rich}
                  prs={[]}
                  onOpenTask={() => undefined}
                  fresh={false}
                />
              </RowList>
            );
          }}
        </WithDetail>
      </Sandbox>
    </V>
  );
}

// ---------------------------------------------------------------- CiTab

function CiTabBody() {
  return (
    <>
      <V
        label="wf-3k9x2 · a run in progress, passed runs, one failure"
        note="The newest run starts open. A run a Codex run adds flashes once at the top."
        width={560}
      >
        <Sandbox quiet>
          <WithDetail id={ISSUE.rich}>{(d) => <CiTab detail={d} variant="drawer" />}</WithDetail>
        </Sandbox>
      </V>
      <V label="wf-z9mw2 · the newest run passed after a failure" width={560}>
        <Sandbox quiet>
          <WithDetail id="wf-z9mw2">{(d) => <CiTab detail={d} variant="drawer" />}</WithDetail>
        </Sandbox>
      </V>
      <V label="wf-a7ne5 · no runs yet" width={560}>
        <Sandbox quiet>
          <WithDetail id={ISSUE.stale}>{(d) => <CiTab detail={d} variant="drawer" />}</WithDetail>
        </Sandbox>
      </V>
    </>
  );
}

// ---------------------------------------------------------------- PipelineRow

const run = (
  over: Partial<PipelineRun> & Pick<PipelineRun, "id" | "status">,
  minutes: number,
): PipelineRun => ({
  workflow: "CI",
  trigger: "push",
  branch: `${ISSUE.rich}/sse-delta-stream`,
  sha: "9f1e2ab",
  started_at: ago(minutes),
  jobs: [
    { name: "fmt", conclusion: "success", duration_s: 6 },
    { name: "clippy", conclusion: "success", duration_s: 48 },
    { name: "test", conclusion: "success", duration_s: 157 },
  ],
  ...over,
});

function PipelineRowBody() {
  const noop = () => undefined;
  return (
    <V label="queued, running, passed, failed, cancelled · the first two are open" width={560}>
      <RowList>
        <PipelineRow
          run={run(
            {
              id: "ci-4005",
              status: "queued",
              trigger: "pull_request",
              jobs: [{ name: "fmt" }, { name: "clippy" }, { name: "test" }],
            },
            0.2,
          )}
          issueId={ISSUE.rich}
          open
          onOpenChange={noop}
          fresh={false}
        />
        <PipelineRow
          run={run(
            {
              id: "ci-4004",
              status: "in_progress",
              jobs: [
                { name: "fmt", conclusion: "success", duration_s: 6 },
                { name: "clippy", conclusion: "success", duration_s: 48 },
                { name: "test" },
              ],
            },
            2,
          )}
          issueId={ISSUE.rich}
          open
          onOpenChange={noop}
          fresh={false}
        />
        <PipelineRow
          run={run(
            { id: "ci-4003", status: "completed", conclusion: "success", duration_s: 214 },
            40,
          )}
          issueId={ISSUE.rich}
          open={false}
          onOpenChange={noop}
          fresh={false}
        />
        <PipelineRow
          run={run(
            {
              id: "ci-4002",
              status: "completed",
              conclusion: "failure",
              duration_s: 97,
              jobs: [
                { name: "fmt", conclusion: "success", duration_s: 6 },
                { name: "clippy", conclusion: "success", duration_s: 44 },
                { name: "test", conclusion: "failure", duration_s: 47 },
              ],
            },
            3 * 60,
          )}
          issueId={ISSUE.rich}
          open
          onOpenChange={noop}
          fresh={false}
        />
        <PipelineRow
          run={run(
            {
              id: "ci-4001",
              status: "completed",
              conclusion: "cancelled",
              duration_s: 31,
              jobs: [
                { name: "fmt", conclusion: "success", duration_s: 6 },
                { name: "clippy", conclusion: "cancelled", duration_s: 25 },
                { name: "test" },
              ],
            },
            26 * 60,
          )}
          issueId={ISSUE.rich}
          open={false}
          onOpenChange={noop}
          fresh={false}
        />
      </RowList>
    </V>
  );
}

// ---------------------------------------------------------------- RunStateIcon

function RunStateIconBody() {
  return (
    <>
      <V
        label="the five states, 14 px"
        note="Color is for status only. A running run turns slowly; reduced motion stops it."
      >
        <Row>
          {(["success", "failure", "in_progress", "queued", "cancelled"] as const).map((s) => (
            <span key={s} className="inline-flex items-center gap-1.5 text-fg-muted text-sm">
              <RunStateIcon state={s} />
              {s.replace("_", " ")}
            </span>
          ))}
        </Row>
      </V>
      <V label="the dot on the CI tab">
        <Row>
          {(["success", "failure", "in_progress", "queued", "cancelled"] as const).map((s) => (
            <span key={s} className="inline-flex items-center gap-1.5 text-fg-muted text-sm">
              <CiDot state={s} />
              {s.replace("_", " ")}
            </span>
          ))}
        </Row>
      </V>
      <V label="the commit trailer to copy" width={320}>
        <TrailerCopy trailer={`Issue: ${ISSUE.stale}`} />
      </V>
    </>
  );
}

export const issueDeliveryEntries: KitEntry[] = [
  entry(
    "Issue · Goal",
    "CriteriaTab",
    `${SRC}/tabs/CriteriaTab.tsx`,
    "Criteria have a tab of their own: the checklist you tick and the coverage by task sit together, so how we know the issue is done is one key away (3).",
    CriteriaTabBody,
  ),
  entry(
    "Issue · Log",
    "GitTab",
    `${SRC}/tabs/GitTab.tsx`,
    "Pull requests and commits of the issue, derived from git and GitHub, so anyone can trace a task to the code that did it. The empty state says how a commit finds the issue.",
    GitTabBody,
  ),
  entry(
    "Issue · Log",
    "PullRequestRow",
    `${SRC}/tabs/GitTab.tsx`,
    "One pull request: state, review and checks in a fixed order, so a failed check or a requested change is the only thing that stands out.",
    PullRequestRowBody,
  ),
  entry(
    "Issue · Log",
    "CommitRow",
    `${SRC}/tabs/GitTab.tsx`,
    "One commit: sha, subject, author, time, branch, pull request. The T-n pill is the link back to the plan.",
    CommitRowBody,
  ),
  entry(
    "Issue · Log",
    "CiTab",
    `${SRC}/tabs/CiTab.tsx`,
    "Pipeline runs of the issue, newest first, each open to its jobs. A run that Codex starts shows up here without a reload.",
    CiTabBody,
  ),
  entry(
    "Issue · Log",
    "PipelineRow",
    `${SRC}/tabs/CiTab.tsx`,
    "One CI run: workflow, result, duration, trigger, branch and sha, with the jobs under it. A failed run names the failed job before you open it.",
    PipelineRowBody,
  ),
  entry(
    "Issue · Log",
    "RunStateIcon",
    `${SRC}/delivery-ui.tsx`,
    "The glyph for a CI run, a job or a pull request's checks: green check, red cross, a turning arc while it runs, a dashed ring while it waits.",
    RunStateIconBody,
  ),
];
