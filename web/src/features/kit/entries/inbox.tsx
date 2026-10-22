import { InboxRow, InboxView } from "@/features/inbox";
import { NotifyBanner } from "@/features/inbox/NotifyBanner";
import { entry, type KitEntry, Sandbox, V, WithSnapshot } from "../kit-ui";

const SRC = "src/features/inbox";

function InboxViewBody() {
  return (
    <V
      label="Mine · All · Answered"
      note="Answering writes to the mock data; the tab title count follows."
      fill
      height={640}
    >
      <Sandbox quiet path="/inbox">
        <InboxView />
      </Sandbox>
    </V>
  );
}

function Row({ id, label, note }: { id: string; label: string; note?: string }) {
  return (
    <V label={label} note={note} width={760}>
      <WithSnapshot>
        {(snap) => {
          const item = snap.inbox.find((i) => i.id === id);
          return item ? (
            <div className="overflow-hidden rounded-md border border-border">
              <InboxRow item={item} />
            </div>
          ) : null;
        }}
      </WithSnapshot>
    </V>
  );
}

function InboxRowBody() {
  return (
    <>
      <Row
        id="Q-4m2pz"
        label="blocking approval · wf-3k9x2"
        note="Options become inline buttons."
      />
      <Row id="Q-6vt4c" label="blocking question · wf-skf01" />
      <Row id="Q-2kx9r" label="fyi question, free-text answer · wf-b1d7v" />
      <Row id="Q-9nh2e" label="answered, waiting for wf resolve · wf-q4fs9" />
      <Row id="Q-5ys8j" label="for someone else (@mudit) · wf-y4bz7" />
    </>
  );
}

function NotifyBannerBody() {
  return (
    <V
      label="two blocking requests"
      note="Shows only until notifications are on, dismissed, or when the browser has no Notification API."
      width={760}
    >
      <NotifyBanner blocking={2} />
    </V>
  );
}

export const inboxEntries: KitEntry[] = [
  entry(
    "Inbox",
    "InboxView",
    `${SRC}/InboxView.tsx`,
    "Agents stop and ask across the whole workspace; the inbox is the one place to see everything waiting on you, blocking first, and to answer without opening each issue.",
    InboxViewBody,
  ),
  entry(
    "Inbox",
    "InboxRow",
    `${SRC}/InboxRow.tsx`,
    "A row has the question, who asked, which issue and how to answer, so most requests are one click or one sentence.",
    InboxRowBody,
  ),
  entry(
    "Inbox",
    "NotifyBanner",
    `${SRC}/NotifyBanner.tsx`,
    "Blocking requests are worth a browser notification, but only if you ask for them; the banner asks once and then gets out of the way.",
    NotifyBannerBody,
  ),
];
