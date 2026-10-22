import { ChangesTimeline } from "@/features/issue/ChangesTimeline";
import { DecisionCards } from "@/features/issue/DecisionCards";
import { LearningCards } from "@/features/issue/LearningCards";
import { LogTab } from "@/features/issue/tabs/LogTab";
import type { DecisionEntry } from "@/gen/types";
import { entry, type KitEntry, Sandbox, V, WithDetail } from "../kit-ui";
import { ISSUE } from "./data";

const SRC = "src/features/issue";

// ---------------------------------------------------------------- LogTab

function LogFrame({ view, label }: { view: "changes" | "decisions" | "learnings"; label: string }) {
  return (
    <V label={label} width={560} height={620}>
      <Sandbox quiet path={`/w/i/${ISSUE.rich}?tab=log&log=${view}`}>
        <div className="min-h-0 flex-1 overflow-y-auto px-4 pt-4 pb-6">
          <WithDetail id={ISSUE.rich}>{(d) => <LogTab detail={d} variant="drawer" />}</WithDetail>
        </div>
      </Sandbox>
    </V>
  );
}

function LogTabBody() {
  return (
    <>
      <LogFrame view="changes" label="changes · in a drawer-height panel (scrolls)" />
      <LogFrame view="decisions" label="decisions" />
      <LogFrame view="learnings" label="learnings" />
    </>
  );
}

// ---------------------------------------------------------------- ChangesTimeline

function Timeline({
  id,
  label,
  note,
  authors,
  empty,
}: {
  id: string;
  label: string;
  note?: string;
  authors?: string[];
  empty?: boolean;
}) {
  return (
    <V label={label} note={note} width={560}>
      <Sandbox quiet>
        <WithDetail id={id}>
          {(d) => (
            <ChangesTimeline
              changes={empty ? [] : d.changes}
              issueId={d.summary.id}
              authorsFilter={authors}
            />
          )}
        </WithDetail>
      </Sandbox>
    </V>
  );
}

function ChangesTimelineBody() {
  return (
    <>
      <Timeline
        id={ISSUE.rich}
        label="wf-3k9x2 · twelve entries over two days"
        note="Includes a failure, a failing result, passing verifies and an answer."
      />
      <Timeline id={ISSUE.rich} label="filtered to @codex" authors={["codex"]} />
      <Timeline id={ISSUE.cleanDone} label="wf-m3tq8 · five entries" />
      <Timeline id={ISSUE.rich} label="no entries" empty />
    </>
  );
}

// ---------------------------------------------------------------- DecisionCards

function Decisions({
  id,
  label,
  note,
  empty,
  tweak,
}: {
  id: string;
  label: string;
  note?: string;
  empty?: boolean;
  tweak?: (d: DecisionEntry[]) => DecisionEntry[];
}) {
  return (
    <V label={label} note={note} width={560}>
      <Sandbox quiet>
        <WithDetail id={id}>
          {(d) => (
            <DecisionCards
              decisions={empty ? [] : tweak ? tweak(d.decisions) : d.decisions}
              issueId={d.summary.id}
            />
          )}
        </WithDetail>
      </Sandbox>
    </V>
  );
}

function DecisionCardsBody() {
  return (
    <>
      <Decisions
        id={ISSUE.rich}
        label="wf-3k9x2 · accepted, proposed and a superseded chain"
        note="“Poll the snapshot every 2 s” folds under “Push board updates over SSE”."
      />
      <Decisions id={ISSUE.crowded} label="wf-b1d7v · accepted and proposed" />
      <Decisions id={ISSUE.cancelled} label="wf-n7vy3 · rejected (collapsed)" />
      <Decisions
        id={ISSUE.rich}
        label="two live decisions on one topic (clash)"
        note="Spread of wf-3k9x2 with the supersedes link removed."
        tweak={(all) =>
          all.map((x) =>
            x.id === "D-7f3k2"
              ? { ...x, supersedes: undefined }
              : x.id === "D-2ab3c"
                ? { ...x, superseded_by: undefined, topic: "live-transport" }
                : x,
          )
        }
      />
      <Decisions id={ISSUE.rich} label="no decisions" empty />
    </>
  );
}

// ---------------------------------------------------------------- LearningCards

function Learnings({
  id,
  label,
  note,
  variant = "drawer",
  width = 560,
  empty,
}: {
  id: string;
  label: string;
  note?: string;
  variant?: "drawer" | "page";
  width?: number;
  empty?: boolean;
}) {
  return (
    <V label={label} note={note} width={width}>
      <WithDetail id={id}>
        {(d) => (
          <LearningCards
            learnings={empty ? [] : d.learnings}
            issueId={d.summary.id}
            variant={variant}
          />
        )}
      </WithDetail>
    </V>
  );
}

function LearningCardsBody() {
  return (
    <>
      <Learnings
        id={ISSUE.rich}
        label="wf-3k9x2 · promoted, candidate and plain"
        note="“In library” links to the promoted item; “Promote” opens the dialog."
      />
      <Learnings id={ISSUE.rich} label="page variant · two columns" variant="page" width={900} />
      <Learnings id="wf-x5hd3" label="wf-x5hd3 · mixed" />
      <Learnings id={ISSUE.rich} label="no learnings" empty />
    </>
  );
}

export const issueLogEntries: KitEntry[] = [
  entry(
    "Issue · Log",
    "LogTab",
    `${SRC}/tabs/LogTab.tsx`,
    "Changes, decisions and learnings are three append-only logs; one control switches between them and keeps its place while a long timeline scrolls.",
    LogTabBody,
  ),
  entry(
    "Issue · Log",
    "ChangesTimeline",
    `${SRC}/ChangesTimeline.tsx`,
    "The change log is the audit trail: who did what, with which result and evidence, grouped by day so you can reconstruct a session at a glance.",
    ChangesTimelineBody,
  ),
  entry(
    "Issue · Log",
    "DecisionCards",
    `${SRC}/DecisionCards.tsx`,
    "A decision card puts the choice first and the reasons after, and folds superseded ones under their successor, so the current rule is obvious and the history is one click away.",
    DecisionCardsBody,
  ),
  entry(
    "Issue · Log",
    "LearningCards",
    `${SRC}/LearningCards.tsx`,
    "Learnings are what the next issue should not have to rediscover; each card states the rule, shows its evidence and offers promotion to the library.",
    LearningCardsBody,
  ),
];
