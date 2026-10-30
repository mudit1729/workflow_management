import { CoverageStrip } from "@/features/issue/CoverageStrip";
import { CriteriaChecklist } from "@/features/issue/CriteriaChecklist";
import { GoalTab } from "@/features/issue/tabs/GoalTab";
import type { IssueDetail } from "@/gen/types";
import { entry, type KitEntry, V, WithDetail } from "../kit-ui";
import { ISSUE } from "./data";

const SRC = "src/features/issue";

const tasksOf = (d: IssueDetail) => d.plan?.phases.flatMap((p) => p.tasks) ?? [];

// ---------------------------------------------------------------- CriteriaChecklist

function Criteria({ id, label, note }: { id: string; label: string; note?: string }) {
  return (
    <V label={label} note={note} width={560}>
      <WithDetail id={id}>
        {(d) => <CriteriaChecklist criteria={d.criteria} issueId={d.summary.id} />}
      </WithDetail>
    </V>
  );
}

function CriteriaChecklistBody() {
  return (
    <>
      <Criteria
        id={ISSUE.rich}
        label="wf-3k9x2 · 2 verified, 1 claimed, 2 open"
        note="Open is empty, claimed is hatched, verified is solid. Tick an open box for the claimed hint; untick a verified one to confirm. Both write to the mock data."
      />
      <Criteria id={ISSUE.cleanDone} label="wf-m3tq8 · all verified" />
      <Criteria id={ISSUE.doneUnmet} label="wf-c2pn6 · marked done, two unmet" />
      <Criteria
        id={ISSUE.heavyLint}
        label="wf-k8dv6 · freeform and not measurable warnings (S07, S08)"
      />
      <V label="no criteria" width={560}>
        <CriteriaChecklist criteria={[]} issueId={ISSUE.rich} />
      </V>
    </>
  );
}

// ---------------------------------------------------------------- CoverageStrip

function Coverage({
  id,
  label,
  note,
  bare,
}: {
  id: string;
  label: string;
  note?: string;
  bare?: boolean;
}) {
  return (
    <V label={label} note={note} width={560}>
      <WithDetail id={id}>
        {(d) => <CoverageStrip criteria={d.criteria} tasks={bare ? [] : tasksOf(d)} />}
      </WithDetail>
    </V>
  );
}

function CoverageStripBody() {
  return (
    <>
      <Coverage id={ISSUE.rich} label="wf-3k9x2 · every criterion has a task" />
      <Coverage id={ISSUE.heavyLint} label="wf-k8dv6 · uncovered criteria (Q006)" />
      <Coverage id={ISSUE.noPlan} label="wf-h2tb7 · no tasks at all" bare />
    </>
  );
}

// ---------------------------------------------------------------- GoalTab

function GoalTabBody() {
  return (
    <>
      <V
        label="wf-3k9x2 · context with diagrams, out of scope, linked context"
        note="The success criteria are in the Criteria tab."
        width={560}
      >
        <WithDetail id={ISSUE.rich}>{(d) => <GoalTab detail={d} variant="drawer" />}</WithDetail>
      </V>
      <V
        label="wf-7yq2m · F001 raw file with the bad line marked"
        note="Frontmatter does not parse, so the finding and the raw file replace the form."
        width={560}
      >
        <WithDetail id={ISSUE.badYaml}>{(d) => <GoalTab detail={d} variant="drawer" />}</WithDetail>
      </V>
      <V label="wf-h2tb7 · criteria without a plan" width={560}>
        <WithDetail id={ISSUE.noPlan}>{(d) => <GoalTab detail={d} variant="drawer" />}</WithDetail>
      </V>
      <V label="no goal yet" note="Spread of wf-f6qa2 with an empty goal." width={560}>
        <WithDetail id="wf-f6qa2">
          {(d) => (
            <GoalTab
              detail={{
                ...d,
                criteria: [],
                goal: { ...d.goal, context_md: "", links_md: "", out_of_scope_md: "" },
              }}
              variant="drawer"
            />
          )}
        </WithDetail>
      </V>
    </>
  );
}

export const issueGoalEntries: KitEntry[] = [
  entry(
    "Issue · Criteria",
    "CriteriaChecklist",
    `${SRC}/CriteriaChecklist.tsx`,
    "Done is a claim you can check: each criterion shows its three states, the command or person that verifies it and the evidence, so 'claimed' never passes for 'verified'.",
    CriteriaChecklistBody,
  ),
  entry(
    "Issue · Criteria",
    "CoverageStrip",
    `${SRC}/CoverageStrip.tsx`,
    "It shows which tasks satisfy which criterion and flags the ones nothing covers, so a plan cannot quietly skip a requirement.",
    CoverageStripBody,
  ),
  entry(
    "Issue · Goal",
    "GoalTab",
    `${SRC}/tabs/GoalTab.tsx`,
    "The goal explains why the issue exists and what it leaves out; a file with broken frontmatter still shows, with the exact bad line, instead of vanishing.",
    GoalTabBody,
  ),
];
