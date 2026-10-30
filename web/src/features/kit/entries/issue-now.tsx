import { NeedsYouList } from "@/features/issue/NeedsYouList";
import { StateSnapshot } from "@/features/issue/StateSnapshot";
import { NowTab } from "@/features/issue/tabs/NowTab";
import type { IssueDetail } from "@/gen/types";
import { entry, type KitEntry, V, WithDetail, WithSnapshot } from "../kit-ui";
import { ISSUE } from "./data";

const SRC = "src/features/issue";

// ---------------------------------------------------------------- StateSnapshot

function Snapshot({
  id,
  label,
  note,
  tweak,
}: {
  id: string;
  label: string;
  note?: string;
  tweak?: (d: IssueDetail) => IssueDetail;
}) {
  return (
    <V label={label} note={note} width={560}>
      <WithDetail id={id}>
        {(d) => {
          const detail = tweak ? tweak(d) : d;
          return detail.state ? <StateSnapshot state={detail.state} detail={detail} /> : null;
        }}
      </WithDetail>
    </V>
  );
}

function StateSnapshotBody() {
  return (
    <>
      <Snapshot id={ISSUE.rich} label="wf-3k9x2 · fresh, blocking request, in flight" />
      <Snapshot
        id={ISSUE.stale}
        label="wf-a7ne5 · older than the staleness window"
        note="The updated line turns amber."
      />
      <Snapshot
        id={ISSUE.rich}
        label="behind the log (Q005)"
        note="Spread of wf-3k9x2 with state_behind_changes set."
        tweak={(d) => ({
          ...d,
          summary: {
            ...d.summary,
            signals: { ...d.summary.signals, state_behind_changes: true },
          },
        })}
      />
      <Snapshot
        id={ISSUE.rich}
        label="over 400 words (Q008)"
        tweak={(d) => (d.state ? { ...d, state: { ...d.state, word_count: 436 } } : d)}
      />
      <Snapshot id={ISSUE.blocked} label="wf-w8vz4 · blocked section" />
      <Snapshot id={ISSUE.skills} label="wf-skf01 · blocking question" />
    </>
  );
}

// ---------------------------------------------------------------- NeedsYouList

function Needs({
  ids,
  label,
  note,
  compact,
}: {
  ids: string[];
  label: string;
  note?: string;
  compact?: boolean;
}) {
  return (
    <V label={label} note={note} width={560}>
      <WithSnapshot>
        {(snap) => {
          const items = snap.inbox.filter((i) => ids.includes(i.id));
          return (
            <NeedsYouList items={items} issueId={items[0]?.issue ?? ISSUE.rich} compact={compact} />
          );
        }}
      </WithSnapshot>
    </V>
  );
}

function NeedsYouListBody() {
  return (
    <>
      <Needs ids={["Q-4m2pz"]} label="approval, blocking (options as buttons)" />
      <Needs ids={["Q-2kx9r"]} label="question, fyi (free-text answer)" />
      <Needs
        ids={["Q-9nh2e"]}
        label="answered, waiting for the agent to pick it up"
        note="Q-9nh2e was asked of @mudit and already answered."
      />
      <Needs
        ids={["Q-5ys8j"]}
        label="addressed to someone else"
        note="Asked of @mudit, so you can answer anyway."
      />
      <Needs ids={["Q-4m2pz", "Q-2kx9r", "Q-5ys8j"]} label="three mixed, compact" compact />
      <V label="none" width={560}>
        <NeedsYouList items={[]} issueId={ISSUE.rich} />
      </V>
    </>
  );
}

// ---------------------------------------------------------------- NowTab

function NowTabBody() {
  return (
    <>
      <V label="with a snapshot · wf-3k9x2" width={560}>
        <WithDetail id={ISSUE.rich}>{(d) => <NowTab detail={d} variant="drawer" />}</WithDetail>
      </V>
      <V label="no current_state.md · wf-k8dv6" width={560}>
        <WithDetail id={ISSUE.heavyLint}>
          {(d) => <NowTab detail={d} variant="drawer" />}
        </WithDetail>
      </V>
    </>
  );
}

export const issueNowEntries: KitEntry[] = [
  entry(
    "Issue · Now",
    "StateSnapshot",
    `${SRC}/StateSnapshot.tsx`,
    "It answers 'where are we' in one glance: the summary line is the hero, anything that needs you comes first, and the rest folds away until you want it.",
    StateSnapshotBody,
  ),
  entry(
    "Issue · Now",
    "NeedsYouList",
    `${SRC}/NeedsYouList.tsx`,
    "Agents stop and ask; this list is where a human unblocks them, with the question, who asked and the buttons or box to answer in place.",
    NeedsYouListBody,
  ),
  entry(
    "Issue · Now",
    "NowTab",
    `${SRC}/tabs/NowTab.tsx`,
    "The first tab is the current state because the next agent, and the next human, both start by asking where the work stands.",
    NowTabBody,
  ),
];
