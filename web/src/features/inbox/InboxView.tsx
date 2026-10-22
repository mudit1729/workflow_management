// The needs-you inbox for the whole workspace: what agents ask, what they wait on, what you answered.
// A Workflow view: the Workflow tabs sit at the left of the top bar, Mine | All | Answered is the
// page's own filter at the right.
import { CircleCheck, Inbox, MessageSquareReply, TriangleAlert, Users } from "lucide-react";
import { type ReactNode, useMemo, useState } from "react";
import { EmptyState, ViewTabs } from "@/components/common";
import { Button, Segmented, Skeleton } from "@/components/ui";
import type { NeedsYouItem } from "@/gen/types";
import { useInbox, useSnapshot } from "@/lib/api";
import { cn } from "@/lib/cn";
import { parseTs } from "@/lib/format";
import { InboxRow } from "./InboxRow";
import { NotifyBanner } from "./NotifyBanner";

type InboxTab = "mine" | "all" | "answered";

const byAskedAsc = (a: NeedsYouItem, b: NeedsYouItem) => parseTs(a.asked) - parseTs(b.asked);
const byAskedDesc = (a: NeedsYouItem, b: NeedsYouItem) => parseTs(b.asked) - parseTs(a.asked);
const byAnsweredDesc = (a: NeedsYouItem, b: NeedsYouItem) =>
  parseTs(b.answered_at ?? b.asked) - parseTs(a.answered_at ?? a.asked);

export function InboxView() {
  const snapshot = useSnapshot();
  const inbox = useInbox();
  const [tab, setTab] = useState<InboxTab>("mine");

  const lists = useMemo(
    () => ({
      mine: inbox.mine.filter((i) => !i.answered),
      all: inbox.all.filter((i) => !i.answered),
      answered: inbox.all.filter((i) => i.answered).sort(byAnsweredDesc),
    }),
    [inbox.mine, inbox.all],
  );
  const blockingForMe = lists.mine.filter((i) => i.urgency === "blocking").length;
  const loading = snapshot.isPending;
  const failed = snapshot.isError && !snapshot.data;

  return (
    <div data-wf="InboxView" className="flex h-full min-h-0 min-w-0 flex-col bg-bg">
      <header className="flex h-(--wf-topbar-h) shrink-0 items-center gap-3 border-border border-b bg-bg px-4">
        <h1 className="sr-only">Workflow · Inbox</h1>
        <ViewTabs view="workflow" />
        <span className="flex-1" />
        <Segmented<InboxTab>
          size="sm"
          aria-label="Show requests"
          value={tab}
          onChange={setTab}
          options={[
            { value: "mine", label: "Mine", count: loading ? undefined : lists.mine.length },
            { value: "all", label: "All", count: loading ? undefined : lists.all.length },
            {
              value: "answered",
              label: "Answered",
              count: loading ? undefined : lists.answered.length,
            },
          ]}
        />
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto flex w-full max-w-[880px] flex-col gap-5 px-4 py-5">
          {loading ? (
            <InboxSkeleton />
          ) : failed ? (
            <EmptyState
              icon={<TriangleAlert strokeWidth={1.75} />}
              title="Could not load the inbox"
              hint="The server did not answer. Your files are safe."
              action={
                <Button size="sm" onClick={() => void snapshot.refetch()}>
                  Try again
                </Button>
              }
            />
          ) : (
            <>
              {tab === "mine" && (
                <RequestList
                  items={lists.mine}
                  empty={
                    <EmptyState
                      icon={<CircleCheck strokeWidth={1.75} className="text-status-done" />}
                      title="Nothing needs you"
                      hint={
                        lists.all.length > 0
                          ? `${lists.all.length} ${lists.all.length === 1 ? "request waits" : "requests wait"} on other people.`
                          : "Agents ask here when they are blocked or want your approval."
                      }
                      action={
                        lists.all.length > 0 ? (
                          <Button size="sm" onClick={() => setTab("all")}>
                            <Users aria-hidden size={14} strokeWidth={1.75} />
                            See everyone’s requests
                          </Button>
                        ) : undefined
                      }
                    />
                  }
                />
              )}
              {tab === "all" && (
                <RequestList
                  items={lists.all}
                  empty={
                    <EmptyState
                      icon={<Inbox strokeWidth={1.75} />}
                      title="No open requests"
                      hint="No agent is waiting on anyone right now."
                    />
                  }
                />
              )}
              {tab === "answered" && (
                <RequestList
                  items={lists.answered}
                  grouped={false}
                  empty={
                    <EmptyState
                      icon={<MessageSquareReply strokeWidth={1.75} />}
                      title="No answers waiting"
                      hint="An answer stays here until the agent runs wf resolve."
                    />
                  }
                />
              )}
            </>
          )}

          {/* A setting, not a request: it waits below the requests, quiet. */}
          <NotifyBanner blocking={blockingForMe} />
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- list

function RequestList({
  items,
  empty,
  grouped = true,
}: {
  items: NeedsYouItem[];
  empty: ReactNode;
  /** Group by urgency: Blocking first, then FYI. */
  grouped?: boolean;
}) {
  if (items.length === 0) return <div className="py-10">{empty}</div>;

  if (!grouped) {
    return (
      <Card label="Answered requests">
        {items.map((item) => (
          <InboxRow key={`${item.issue}/${item.id}`} item={item} />
        ))}
      </Card>
    );
  }

  const blocking = items.filter((i) => i.urgency === "blocking").sort(byAskedAsc);
  const fyi = items.filter((i) => i.urgency !== "blocking").sort(byAskedDesc);
  return (
    <div className="flex flex-col gap-6">
      {blocking.length > 0 && (
        <Section
          title="Blocking"
          note="Agents stop until you answer."
          count={blocking.length}
          dot="bg-accent"
        >
          {blocking.map((item) => (
            <InboxRow key={`${item.issue}/${item.id}`} item={item} />
          ))}
        </Section>
      )}
      {fyi.length > 0 && (
        <Section title="FYI" note="Work continues." count={fyi.length} dot="bg-fg-faint">
          {fyi.map((item) => (
            <InboxRow key={`${item.issue}/${item.id}`} item={item} />
          ))}
        </Section>
      )}
    </div>
  );
}

function Section({
  title,
  note,
  count,
  dot,
  children,
}: {
  title: string;
  note: string;
  count: number;
  dot: string;
  children: ReactNode;
}) {
  return (
    <section data-wf="InboxSection" aria-label={title} className="flex flex-col gap-2">
      <h2 className="flex items-baseline gap-2 px-1 font-medium text-fg-muted text-sm">
        <span aria-hidden className={cn("size-1.5 self-center rounded-full", dot)} />
        {title}
        <span className="font-normal text-fg-faint tabular">{count}</span>
        <span className="ml-auto font-normal text-fg-faint text-xs">{note}</span>
      </h2>
      <Card label={`${title} requests`}>{children}</Card>
    </section>
  );
}

function Card({ label, children }: { label: string; children: ReactNode }) {
  return (
    <ul
      aria-label={label}
      className="m-0 list-none divide-y divide-border overflow-hidden rounded-lg border border-border bg-bg p-0"
    >
      {children}
    </ul>
  );
}

function InboxSkeleton() {
  return (
    <div role="status" aria-label="Loading inbox" className="flex flex-col gap-2">
      <Skeleton className="h-3 w-20" />
      <div className="divide-y divide-border overflow-hidden rounded-lg border border-border">
        {[0, 1, 2].map((i) => (
          <div key={i} className="flex gap-3 px-4 py-3">
            <Skeleton className="size-6 shrink-0 rounded-md" />
            <div className="flex min-w-0 flex-1 flex-col gap-2">
              <Skeleton className="h-3.5 w-3/4" />
              <Skeleton className="h-3 w-1/2" />
              <Skeleton className="h-7 w-40 rounded-md" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
