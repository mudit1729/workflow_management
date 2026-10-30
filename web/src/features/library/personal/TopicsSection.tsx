// Research topics (spec 3): a card for each folder `topics/<slug>/` that has an index page. The
// card reads the page's frontmatter: the question, the status and the date it was updated.
import { useQueries } from "@tanstack/react-query";
import { Plus } from "lucide-react";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { EmptyState, RelativeTime } from "@/components/common";
import { Button, Chip, Input } from "@/components/ui";
import { api, qk, savePage } from "@/lib/api";
import type { LibraryPage, LibraryTree, LibraryTreeNode } from "@/lib/api/types";
import { libraryHref, useOpenPage } from "@/lib/nav";
import { PERSONAL_ALIAS } from "../address";
import { kebab } from "../meta";
import { asTimestamp } from "../page-text";
import { SectionHeader } from "./SectionHeader";

const ICON = { size: 14, strokeWidth: 1.75 } as const;

export type TopicStatus = "active" | "paused" | "done";

const STATUS: Record<
  TopicStatus,
  { label: string; tone: "accent" | "outline" | "success"; rank: number }
> = {
  active: { label: "Active", tone: "accent", rank: 0 },
  paused: { label: "Paused", tone: "outline", rank: 1 },
  done: { label: "Done", tone: "success", rank: 2 },
};

const statusOf = (value: unknown): TopicStatus =>
  value === "paused" || value === "done" ? value : "active";

const text = (value: unknown) => (typeof value === "string" ? value.trim() : "");

/**
 * The topics of the tree: the folders of `topics/` that have an index page. A topic with no notes
 * yet is a folder of one page, which the tree shows as that page.
 */
export function topicsOf(tree: LibraryTree | undefined): LibraryTreeNode[] {
  const folder = tree?.root.children?.find((n) => n.type === "section" && n.path === "topics");
  return (folder?.children ?? []).filter(
    (n) => (n.type === "section" && n.page) || (n.type === "page" && /\/index\.md$/i.test(n.path)),
  );
}

/** What the card shows of one topic. */
export interface Topic {
  node: LibraryTreeNode;
  /** The notes under it: the pages of the folder but its own. */
  notes: number;
  status: TopicStatus;
  question: string;
  updated: string;
}

export function readTopic(node: LibraryTreeNode, page: LibraryPage | undefined): Topic {
  const data = page?.frontmatter ?? {};
  return {
    node,
    notes: Math.max(0, (node.count ?? 1) - 1),
    status: statusOf(data.status),
    question: text(data.question),
    updated: page?.updated ?? text(data.updated),
  };
}

export function TopicCard({ topic }: { topic: Topic }) {
  const open = useOpenPage();
  const { node, status } = topic;
  const path = node.page ?? node.path;
  const s = STATUS[status];
  return (
    <article
      data-wf="TopicCard"
      data-status={status}
      className="relative flex min-w-0 flex-col gap-2 rounded-lg border border-border bg-bg p-4 transition-colors duration-100 ease-wf focus-within:border-border-strong hover:border-border-strong hover:bg-subtle"
    >
      <div className="flex items-center justify-between gap-2">
        <Chip tone={s.tone}>{s.label}</Chip>
        <span className="tabular text-fg-faint text-sm">
          {topic.notes} {topic.notes === 1 ? "note" : "notes"}
        </span>
      </div>
      <h3 className="m-0 min-w-0 font-semibold text-fg text-md leading-snug">
        <a
          href={libraryHref(PERSONAL_ALIAS, path)}
          onClick={(e) => {
            if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
            e.preventDefault();
            open({ alias: PERSONAL_ALIAS, path });
          }}
          className="after:absolute after:inset-0 after:rounded-lg"
        >
          {node.title}
        </a>
      </h3>
      <p
        className={`m-0 line-clamp-2 text-base leading-snug ${topic.question ? "text-fg-muted" : "text-fg-faint"}`}
      >
        {topic.question || "No question yet."}
      </p>
      {topic.updated && (
        <p className="m-0 mt-auto pt-1 text-fg-faint text-sm">
          Updated <RelativeTime ts={asTimestamp(topic.updated)} long />
        </p>
      )}
    </article>
  );
}

/** The template of a new topic: the sections of spec 3, empty. */
export function newTopicText(title: string, today: string): string {
  return [
    "---",
    `title: ${JSON.stringify(title)}`,
    "kind: topic",
    "status: active",
    'question: ""',
    `updated: ${today}`,
    "---",
    "",
    "## Summary",
    "",
    "## Findings",
    "",
    "## Open questions",
    "",
    "## Notes",
    "",
  ].join("\n");
}

/** `topics/<slug>/index.md` for a title, not one that is taken. */
export function newTopicPath(title: string, taken: Set<string>): string {
  const base = kebab(title, 40) || "topic";
  let slug = base;
  for (let n = 2; taken.has(slug); n++) slug = `${base}-${n}`;
  return `topics/${slug}/index.md`;
}

function NewTopic({ taken }: { taken: Set<string> }) {
  const open = useOpenPage();
  const [adding, setAdding] = useState(false);
  const [title, setTitle] = useState("");
  const [busy, setBusy] = useState(false);
  const field = useRef<HTMLInputElement>(null);

  async function create() {
    const name = title.trim();
    if (!name || busy) return;
    setBusy(true);
    const path = newTopicPath(name, taken);
    const saved = await savePage({
      alias: PERSONAL_ALIAS,
      path,
      text: newTopicText(name, new Date().toLocaleDateString("en-CA")),
    });
    setBusy(false);
    if (!saved) return;
    toast.success("Topic started", { description: `${path} · pushed ${saved.commit}` });
    setAdding(false);
    setTitle("");
    open({ alias: PERSONAL_ALIAS, path });
  }

  if (!adding)
    return (
      <Button
        variant="secondary"
        size="sm"
        onClick={() => {
          setAdding(true);
          requestAnimationFrame(() => field.current?.focus());
        }}
      >
        <Plus aria-hidden {...ICON} />
        New topic
      </Button>
    );
  return (
    <form
      data-wf="NewTopic"
      className="flex items-center gap-1.5"
      onSubmit={(e) => {
        e.preventDefault();
        void create();
      }}
      onKeyDown={(e) => {
        if (e.key === "Escape") setAdding(false);
      }}
    >
      <Input
        ref={field}
        aria-label="Name of the topic"
        placeholder="What are you researching?"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        className="h-6 w-56 max-w-[50vw] text-sm"
      />
      <Button type="submit" size="sm" variant="primary" disabled={!title.trim() || busy}>
        {busy ? "Starting…" : "Start"}
      </Button>
      <Button size="sm" variant="ghost" onClick={() => setAdding(false)}>
        Cancel
      </Button>
    </form>
  );
}

/** Active topics first, then paused, then done; the one updated last first within each. */
export function sortTopics(topics: Topic[]): Topic[] {
  return [...topics].sort(
    (a, b) =>
      STATUS[a.status].rank - STATUS[b.status].rank ||
      (a.updated < b.updated ? 1 : a.updated > b.updated ? -1 : 0) ||
      a.node.title.localeCompare(b.node.title),
  );
}

export function TopicsSection({ tree }: { tree: LibraryTree | undefined }) {
  const nodes = topicsOf(tree);
  const pages = useQueries({
    queries: nodes.map((n) => ({
      queryKey: qk.libraryPage(PERSONAL_ALIAS, n.page ?? n.path),
      queryFn: () => api.libraryPage(PERSONAL_ALIAS, n.page ?? n.path),
    })),
  });
  const topics = sortTopics(nodes.map((n, i) => readTopic(n, pages[i]?.data)));
  const taken = new Set(
    (tree?.root.children?.find((n) => n.path === "topics")?.children ?? []).map(
      (n) => n.path.split("/")[1] ?? "",
    ),
  );
  return (
    <section
      data-wf="TopicsSection"
      aria-labelledby="personal-topics"
      className="flex flex-col gap-3"
    >
      <SectionHeader
        id="personal-topics"
        title="Research topics"
        count={topics.length || undefined}
        hint="What you are working out. Each topic holds a question, findings with sources, and notes."
        action={<NewTopic taken={taken} />}
      />
      {topics.length === 0 ? (
        <EmptyState
          compact
          title="No topics yet"
          hint="A topic is a question you are researching. Start one and add notes under it."
          skill="keeping-a-library"
        />
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {topics.map((t) => (
            <TopicCard key={t.node.path} topic={t} />
          ))}
        </div>
      )}
    </section>
  );
}
