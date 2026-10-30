// Kit entries for Ask library (spec 6): the panel's states, each inside a frame that stands in for
// the side panel (the real panel is fixed to the window edge). Frames run the real body on the
// sample world the kit holds: wf-3k9x2, the pages it links, and the prototype's own answer. The
// last entry opens the real panel.
import type { ReactNode } from "react";
import { toast } from "sonner";
import { StatusIcon } from "@/components/common";
import { AskLibraryButton } from "@/features/ask/AskLibraryButton";
import { AskBody, AskResult } from "@/features/ask/AskPanel";
import { IssuePicker } from "@/features/ask/IssuePicker";
import { PassageList } from "@/features/ask/PassageList";
import { suggestQuestions } from "@/features/ask/questions";
import type { AskRun } from "@/features/ask/useAsker";
import { useIssue, useLibrarySearch } from "@/lib/api";
import { entry, type KitEntry, Loading, Sandbox, V } from "../kit-ui";
import { ISSUE } from "./data";

const SRC = "src/features/ask";

/** The panel's header and body, as the side panel draws them. */
function PanelFrame({ issueId, children }: { issueId?: string; children: ReactNode }) {
  const issue = useIssue(issueId).data;
  return (
    <div data-wf="AskPanelFrame" className="flex min-h-0 flex-1 flex-col bg-bg text-fg">
      <header className="flex min-h-(--wf-topbar-h) shrink-0 items-center gap-2 border-border border-b py-1.5 pr-2 pl-4">
        <div className="flex min-w-0 flex-1 flex-col">
          <h2 className="m-0 truncate font-semibold text-base text-fg">Ask library</h2>
          {issueId ? (
            <div className="flex min-w-0 items-center gap-1.5 text-fg-muted text-sm">
              {issue && <StatusIcon status={issue.summary.status} size={12} />}
              <span className="shrink-0 font-mono text-xs">{issueId}</span>
              <span className="min-w-0 truncate">{issue?.summary.title}</span>
            </div>
          ) : (
            <span className="text-fg-faint text-sm">Pick an issue first</span>
          )}
        </div>
      </header>
      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">{children}</div>
    </div>
  );
}

/** The panel for the rich issue; with `ask` the first suggested question is asked at once. */
function Panel({ ask }: { ask?: boolean }) {
  const detail = useIssue(ISSUE.rich).data;
  if (!detail) return <Loading height={160} />;
  const question = ask ? suggestQuestions(detail)[0] : undefined;
  return (
    <PanelFrame issueId={ISSUE.rich}>
      <AskBody issueId={ISSUE.rich} start={[]} question={question} />
    </PanelFrame>
  );
}

const titleOf = (address: string) =>
  address.slice(address.lastIndexOf("/") + 1).replace(/\.md$/, "");

/** A result under the question, for a state the live panel only reaches by waiting. */
function ResultFrame({
  run,
  mode = "prototype",
}: {
  run: AskRun;
  mode?: "agent" | "prototype" | "none";
}) {
  const detail = useIssue(ISSUE.rich).data;
  return (
    <PanelFrame issueId={ISSUE.rich}>
      <div className="px-4 py-4">
        <AskResult
          run={run}
          issueId={ISSUE.rich}
          detail={detail}
          mode={mode}
          scopePages={2}
          titleOf={titleOf}
          onRetry={() => toast("Try again asks the same question")}
        />
      </div>
    </PanelFrame>
  );
}

function Passages() {
  const passages = useLibrarySearch("lease heartbeat", "all", 5).data;
  if (!passages) return <Loading height={160} />;
  return (
    <ResultFrame
      mode="none"
      run={{ status: "done", question: "How does a lease expire?", mode: "none", passages }}
    />
  );
}

const WIDTH = 440;

function Frame({
  label,
  note,
  height = 640,
  children,
}: {
  label: string;
  note?: string;
  height?: number;
  children: ReactNode;
}) {
  return (
    <V label={label} note={note} width={WIDTH} height={height}>
      <Sandbox quiet path={`/w/i/${ISSUE.rich}`}>
        {children}
      </Sandbox>
    </V>
  );
}

function AskPanelBody() {
  return (
    <>
      <Frame
        label="ready · scope, suggested questions and a box"
        note="Buttons choose where to look; the size line says how much that is. The suggestions come from the issue's open request, its next unverified criterion and its goal."
      >
        <Panel />
      </Frame>
      <Frame
        label="answered · numbered citations, sources, and what to do next"
        note="A citation opens the cited section in place. Link cited pages and Save to log are one click each and say what they did in a line, not a toast."
        height={780}
      >
        <Panel ask />
      </Frame>
    </>
  );
}

function AskStatesBody() {
  return (
    <>
      <Frame label="reading the pages" height={260}>
        <ResultFrame
          run={{
            status: "running",
            question: "How should the board get updates?",
            text: "Push live updates over SSE. [1] WebSocket is two-way and needs more code. [2]",
          }}
        />
      </Frame>
      <Frame
        label="no agent connected · the best passages are the answer"
        note="With no agent the five best passages are shown, with the matching words marked, and a button to connect one."
        height={600}
      >
        <Passages />
      </Frame>
      <Frame label="the answer did not come" height={240}>
        <ResultFrame
          run={{
            status: "failed",
            question: "How should the board get updates?",
            message: "The agent stopped before it finished.",
          }}
          mode="agent"
        />
      </Frame>
      <Frame
        label="no issue yet · opened from a library page"
        note="Ask about this page opens the panel with no issue: pick the one the answer is for."
        height={420}
      >
        <PanelFrame>
          <IssuePicker onPick={(id) => toast(`The panel would ask for ${id}`)} />
        </PanelFrame>
      </Frame>
    </>
  );
}

function PassageListBody() {
  return (
    <Frame label="passages" height={520}>
      <PanelFrame issueId={ISSUE.rich}>
        <div className="px-4 py-4">
          <PassagesOnly />
        </div>
      </PanelFrame>
    </Frame>
  );
}

function PassagesOnly() {
  const passages = useLibrarySearch("lease heartbeat", "all", 3).data;
  if (!passages) return <Loading height={120} />;
  return <PassageList passages={passages} onConnect={() => toast("No agent is connected")} />;
}

function RealPanelBody() {
  return (
    <V
      label="the button · it opens the real panel"
      note="The panel opens at the right of the window and keeps the issue in view when there is room. Esc closes only the panel."
    >
      <AskLibraryButton issueId={ISSUE.rich} />
    </V>
  );
}

export const libraryAskEntries: KitEntry[] = [
  entry(
    "Library · Ask",
    "AskPanel",
    `${SRC}/AskPanel.tsx`,
    "A question about an issue is asked next to the issue, of exactly the pages you chose, and the answer says which sections it came from.",
    AskPanelBody,
  ),
  entry(
    "Library · Ask",
    "AskPanel · states",
    `${SRC}/AskPanel.tsx`,
    "While it reads, when no agent is connected, when it fails, and before an issue is chosen, the panel says what is happening and what to press.",
    AskStatesBody,
  ),
  entry(
    "Library · Ask",
    "PassageList",
    `${SRC}/PassageList.tsx`,
    "With no agent the best matching passages are the answer, marked where the words match, so a question still gets something useful.",
    PassageListBody,
  ),
  entry(
    "Library · Ask",
    "AskLibraryButton",
    `${SRC}/AskLibraryButton.tsx`,
    "The Ask library button in an issue's header opens the real panel.",
    RealPanelBody,
  ),
];
