import { Archive, BookOpen, FileSearch, Play, Plus } from "lucide-react";
import { useMemo } from "react";
import { toast } from "sonner";
import {
  AuthorAvatar,
  AuthorChip,
  AuthorStack,
  CodeBlock,
  CopyButton,
  EmptyState,
  GroupPath,
  KIND_LABEL,
  type Kind,
  KindIcon,
  LintBadge,
  MarkdownProse,
  ProgressRing,
  RefLink,
  RelativeTime,
  StatusIcon,
  StatusSelect,
} from "@/components/common";
import { Button } from "@/components/ui";
import { MetaLine } from "@/features/issue/MetaLine";
import { ASK, SkillHint, SkillLink } from "@/features/issue/skill-hint";
import type { IssueStatus, TaskStatus } from "@/gen/types";
import { agentName, useAuthors, useIssue, usePreferredAgent } from "@/lib/api";
import { STATUS_LABEL, STATUS_ORDER, TASK_STATUS_LABEL } from "@/lib/status";
import { Caption, entry, type KitEntry, Row, V, WithSummary } from "../kit-ui";
import { AUTHORS, ISSUE } from "./data";

const SRC = "src/components/common";

// ---------------------------------------------------------------- StatusIcon

const ALL_STATUS: { status: IssueStatus | TaskStatus; label: string }[] = [
  ...STATUS_ORDER.map((s) => ({ status: s, label: STATUS_LABEL[s] })),
  { status: "todo", label: `${TASK_STATUS_LABEL.todo} (task)` },
];

function StatusIconBody() {
  return (
    <>
      {[14, 20].map((size) => (
        <V key={size} label={`${size} px`}>
          <div className="grid grid-cols-[repeat(2,max-content)] gap-x-8 gap-y-2.5">
            {ALL_STATUS.map(({ status, label }) => (
              <span key={status} className="inline-flex items-center gap-2 text-base">
                <StatusIcon status={status} size={size} />
                {label}
              </span>
            ))}
          </div>
        </V>
      ))}
    </>
  );
}

// ---------------------------------------------------------------- StatusSelect

function SelectDemo({
  id,
  label,
  size,
  variant,
  note,
}: {
  id: string;
  label: string;
  size: "sm" | "md";
  variant: "pill" | "icon";
  note?: string;
}) {
  return (
    <V label={label} note={note}>
      <WithSummary id={id}>
        {(s) => <StatusSelect issue={s} size={size} variant={variant} />}
      </WithSummary>
    </V>
  );
}

function StatusSelectBody() {
  return (
    <>
      <SelectDemo
        id="wf-v1cm9"
        label="pill · md (backlog)"
        size="md"
        variant="pill"
        note="Opens a menu. Illegal moves are muted and open the gate."
      />
      <SelectDemo id={ISSUE.plain} label="pill · md (in progress)" size="md" variant="pill" />
      <SelectDemo id={ISSUE.blocked} label="pill · sm (blocked)" size="sm" variant="pill" />
      <SelectDemo id={ISSUE.cleanDone} label="pill · md (done)" size="md" variant="pill" />
      <SelectDemo id={ISSUE.cancelled} label="icon · md (cancelled)" size="md" variant="icon" />
      <SelectDemo id={ISSUE.fyi} label="icon · sm (review)" size="sm" variant="icon" />
    </>
  );
}

// ---------------------------------------------------------------- ProgressRing

const RINGS: { label: string; v: number; c: number; t: number }[] = [
  { label: "0/0 · no criteria", v: 0, c: 0, t: 0 },
  { label: "0 of 5", v: 0, c: 0, t: 5 },
  { label: "2 claimed of 5", v: 0, c: 2, t: 5 },
  { label: "3 verified, 1 claimed of 5", v: 3, c: 1, t: 5 },
  { label: "5 of 5", v: 5, c: 0, t: 5 },
];

function ProgressRingBody() {
  return (
    <>
      {RINGS.map((r) => (
        <V key={r.label} label={r.label}>
          <div className="flex items-center gap-4">
            <ProgressRing verified={r.v} claimed={r.c} total={r.t} size={14} />
            <ProgressRing verified={r.v} claimed={r.c} total={r.t} size={14} label />
            <ProgressRing verified={r.v} claimed={r.c} total={r.t} size={28} />
            <ProgressRing verified={r.v} claimed={r.c} total={r.t} size={28} label />
          </div>
        </V>
      ))}
    </>
  );
}

// ---------------------------------------------------------------- AuthorChip, AuthorAvatar, AuthorStack

function AuthorChipBody() {
  const handles = [...AUTHORS, "ghost-writer"];
  return (
    <V
      width={960}
      label="six authors and an unknown handle · avatar, chip, text × xs, sm"
      note="Agents are rounded squares with a bot glyph, humans are circles with initials. Hover for the authors.md card. The unknown handle goes gray (Q012)."
    >
      <div className="w-full overflow-x-auto rounded-md border border-border">
        <div className="grid min-w-[880px] grid-cols-[120px_70px_70px_150px_170px_140px_140px] items-center gap-y-2 px-3 py-2">
          <span />
          {(["avatar xs", "avatar sm", "chip xs", "chip sm", "text xs", "text sm"] as const).map(
            (h) => (
              <Caption key={h}>{h}</Caption>
            ),
          )}
          {handles.map((h) => (
            <div key={h} className="contents">
              <code className="truncate font-mono text-fg-muted text-xs">{h}</code>
              <AuthorChip handle={h} variant="avatar" size="xs" />
              <AuthorChip handle={h} variant="avatar" size="sm" />
              <AuthorChip handle={h} variant="chip" size="xs" />
              <AuthorChip handle={h} variant="chip" size="sm" />
              <AuthorChip handle={h} variant="text" size="xs" />
              <AuthorChip handle={h} variant="text" size="sm" />
            </div>
          ))}
        </div>
      </div>
    </V>
  );
}

function AuthorAvatarBody() {
  const authors = useAuthors();
  return (
    <V label="14, 16, 20, 24, 28 px · agent (rounded square) and human (circle)">
      <div className="flex flex-col gap-3">
        {["claude-opus", "codex", "shruti", "mudit"].map((h) => (
          <div key={h} className="flex items-center gap-3">
            <code className="w-24 font-mono text-fg-muted text-xs">{h}</code>
            {[14, 16, 20, 24, 28].map((px) => (
              <AuthorAvatar key={px} handle={h} author={authors.get(h)} px={px} />
            ))}
          </div>
        ))}
        <div className="flex items-center gap-3">
          <code className="w-24 font-mono text-fg-muted text-xs">unknown</code>
          {[14, 16, 20, 24, 28].map((px) => (
            <AuthorAvatar key={px} handle="ghost-writer" px={px} />
          ))}
        </div>
      </div>
    </V>
  );
}

function AuthorStackBody() {
  return (
    <>
      <V label="2 authors">
        <Row>
          <AuthorStack handles={AUTHORS.slice(0, 2)} />
          <AuthorStack handles={AUTHORS.slice(0, 2)} size="xs" />
        </Row>
      </V>
      <V label="4 authors, max 3 (+2 shown as +N)">
        <Row>
          <AuthorStack handles={AUTHORS.slice(0, 4)} max={3} />
          <AuthorStack handles={AUTHORS.slice(0, 4)} max={3} size="xs" />
        </Row>
      </V>
      <V label="7 authors, max 3">
        <Row>
          <AuthorStack handles={[...AUTHORS, "ghost-writer"]} max={3} />
          <AuthorStack handles={[...AUTHORS, "ghost-writer"]} max={3} size="xs" />
        </Row>
      </V>
      <V label="7 authors, max 6">
        <AuthorStack handles={[...AUTHORS, "ghost-writer"]} max={6} />
      </V>
      <V label="one author">
        <AuthorStack handles={["codex"]} />
      </V>
    </>
  );
}

// ---------------------------------------------------------------- RelativeTime, GroupPath

function RelativeTimeBody() {
  const samples = useMemo(() => {
    const at = (min: number) => new Date(Date.now() + min * 60_000).toISOString();
    return [
      ["just now", at(-0.2)],
      ["4 minutes", at(-4)],
      ["3 hours", at(-180)],
      ["2 days", at(-2 * 1440)],
      ["older than 14 days (a date)", at(-30 * 1440)],
      ["in 25 minutes (lease)", at(25)],
    ] as const;
  }, []);
  return (
    <>
      {samples.map(([label, ts]) => (
        <V key={label} label={label} note="Hover for the absolute time.">
          <Row>
            <RelativeTime ts={ts} />
            <RelativeTime ts={ts} long className="text-fg-muted" />
          </Row>
        </V>
      ))}
      <V label="unreadable timestamp">
        <RelativeTime ts="sometime last week" />
      </V>
    </>
  );
}

function GroupPathBody() {
  return (
    <>
      <V label="wf / web">
        <GroupPath path={["wf", "web"]} />
      </V>
      <V label="three levels">
        <GroupPath path={["platform", "auth", "sso"]} />
      </V>
      <V label="one level">
        <GroupPath path={["docs"]} />
      </V>
      <V label="truncates in 140 px" width={140}>
        <GroupPath path={["platform", "authentication", "single sign-on"]} />
      </V>
      <V label="empty renders nothing">
        <GroupPath path={[]} />
      </V>
    </>
  );
}

// ---------------------------------------------------------------- RefLink, CopyButton, LintBadge

function RefLinkBody() {
  return (
    <>
      <V label="issue [[wf-3k9x2]]" note="Status glyph, title from the snapshot.">
        <RefLink target="wf-3k9x2" />
      </V>
      <V label="entry [[wf-3k9x2#D-7f3k2]]">
        <RefLink target="wf-3k9x2#D-7f3k2" />
      </V>
      <V label="entry from inside the same issue [[#D-7f3k2]]">
        <RefLink target="#D-7f3k2" issueId="wf-3k9x2" />
      </V>
      <V label="task [[#T-4]]">
        <RefLink target="#T-4" issueId="wf-3k9x2" />
      </V>
      <V label="criterion [[wf-3k9x2#SC-2]]">
        <RefLink target="wf-3k9x2#SC-2" />
      </V>
      <V label="library [[lib-4tz7c]]">
        <RefLink target="lib-4tz7c" />
      </V>
      <V label="dangling issue [[wf-nope1]] (F009)">
        <RefLink target="wf-nope1" />
      </V>
      <V label="dangling library [[lib-zzzzz]]">
        <RefLink target="lib-zzzzz" />
      </V>
      <V label="dangling entry [[wf-3k9x2#D-0000]]">
        <RefLink target="wf-3k9x2#D-0000" />
      </V>
    </>
  );
}

function CopyButtonBody() {
  return (
    <>
      <V label="icon · sm">
        <CopyButton text="wf-3k9x2" label="Copy issue id" />
      </V>
      <V label="icon · md">
        <CopyButton text="wf-3k9x2" label="Copy id" size="md" />
      </V>
      <V label="button · sm">
        <CopyButton
          text="Hand wf-3k9x2 over: use the handing-off skill."
          label="Copy prompt"
          variant="button"
        />
      </V>
      <V label="button · md">
        <CopyButton
          text="Hand wf-3k9x2 over: use the handing-off skill."
          label="Copy prompt"
          variant="button"
          size="md"
        />
      </V>
    </>
  );
}

function LintBadgeBody() {
  const cases: [string, { error: number; warn: number; info: number }][] = [
    ["errors only", { error: 2, warn: 0, info: 0 }],
    ["warnings only", { error: 0, warn: 3, info: 0 }],
    ["info only", { error: 0, warn: 0, info: 4 }],
    ["all three", { error: 1, warn: 8, info: 7 }],
  ];
  return (
    <>
      {cases.map(([label, counts]) => (
        <V key={label} label={label}>
          <Row>
            <LintBadge counts={counts} variant="dot" />
            <LintBadge counts={counts} variant="badge" />
            <LintBadge counts={counts} variant="badge" onClick={() => undefined} />
          </Row>
        </V>
      ))}
      <V label="no findings renders nothing">
        <LintBadge counts={{ error: 0, warn: 0, info: 0 }} />
      </V>
    </>
  );
}

// ---------------------------------------------------------------- EmptyState

/** The empty board's state: it names the agent the nav row names, as the board does. */
function NoWorkYet() {
  const agent = agentName(usePreferredAgent());
  return (
    <EmptyState
      title="No work yet"
      hint={`Add a group of work and ${agent} splits it into issues, or add one issue.`}
      action={
        <div className="flex items-center gap-2">
          <Button variant="primary" size="sm">
            <Plus size={14} strokeWidth={1.75} />
            Add work
          </Button>
          <Button variant="secondary" size="sm">
            Add one issue
          </Button>
        </div>
      }
    />
  );
}

function EmptyStateBody() {
  return (
    <>
      <V
        label="skill + command props"
        note="The skill is a real one of the workflow plugin and the command is codex, which exists today. Issue screens use SkillHint (below) so the skill name links to its page."
        width={420}
      >
        <div className="rounded-md border border-border">
          <EmptyState
            icon={<BookOpen strokeWidth={1.75} />}
            title="No plan yet"
            hint="A plan breaks the goal into tasks that agents can claim."
            skill="planning-issues"
            command="codex 'Plan wf-3k9x2 with the planning-issues skill.'"
          />
        </div>
      </V>
      <V label="with a SkillHint and a button" width={420}>
        <div className="rounded-md border border-border">
          <EmptyState
            icon={<BookOpen strokeWidth={1.75} />}
            title="No plan yet"
            hint="A plan splits the goal into tasks that agents can claim in parallel."
            action={
              <div className="flex flex-col items-center gap-3">
                <Button variant="secondary">
                  <Play size={14} strokeWidth={1.75} className="fill-current" />
                  Do next step
                </Button>
                <SkillHint skill="planning-issues" prompt={ASK.plan("wf-3k9x2")} />
              </div>
            }
          />
        </div>
      </V>
      <V label="with an action" width={420}>
        <div className="rounded-md border border-border">
          <EmptyState
            icon={<FileSearch strokeWidth={1.75} />}
            title="No issues match"
            hint="Nothing in this view matches the filters."
            action={
              <Button variant="secondary" size="sm">
                Clear filters
              </Button>
            }
          />
        </div>
      </V>
      <V label="board · no work yet" width={420}>
        <div className="rounded-md border border-border">
          <NoWorkYet />
        </div>
      </V>
      <V label="title only" width={320}>
        <div className="rounded-md border border-border">
          <EmptyState title="Nothing needs you" />
        </div>
      </V>
      <V label="compact · inside a panel" width={420}>
        <div className="rounded-md border border-border px-3">
          <EmptyState
            compact
            icon={<Archive strokeWidth={1.75} />}
            title="No current state yet"
            hint="An agent writes a short snapshot here at the end of each session."
            action={<SkillHint skill="handing-off" prompt={ASK.state("wf-3k9x2")} align="start" />}
          />
        </div>
      </V>
    </>
  );
}

// ---------------------------------------------------------------- SkillHint, MetaLine

function SkillHintBody() {
  return (
    <>
      <V
        label="centered"
        note="The skill name links to its page in Library · Skills; Copy puts the whole codex command on the clipboard."
        width={420}
      >
        <SkillHint skill="planning-issues" prompt={ASK.plan("wf-3k9x2")} />
      </V>
      <V label="left-aligned, in a compact empty state" width={420}>
        <SkillHint skill="logging-work" prompt={ASK.decision("wf-3k9x2")} align="start" />
      </V>
      <V label="a long prompt truncates, the command keeps whole" width={320}>
        <SkillHint skill="doing-next-step" prompt={ASK.verify("wf-3k9x2", "SC-3")} align="start" />
      </V>
      <V label="SkillLink alone" width={320}>
        <p className="text-fg-muted text-sm">
          Written by <SkillLink skill="handing-off" />.
        </p>
      </V>
    </>
  );
}

function MetaLineBody() {
  const facts = (
    <>
      <span>Updated 25m ago by @claude-opus</span>
      <span>Live transport</span>
      <span className="font-mono text-xs">cc-7d2e</span>
    </>
  );
  return (
    <>
      <V label="fits one line" width={460}>
        <MetaLine className="text-fg-faint text-sm">{facts}</MetaLine>
      </V>
      <V
        label="wraps at 220 px"
        note="The dot that would end or start a line is clipped instead of drawn."
        width={220}
      >
        <MetaLine className="text-fg-faint text-sm">{facts}</MetaLine>
      </V>
    </>
  );
}

// ---------------------------------------------------------------- KindIcon

const CHANGE_KINDS: Kind[] = [
  "progress",
  "fix",
  "refactor",
  "docs",
  "test",
  "research",
  "review",
  "verify",
  "failure",
  "answer",
];

function KindGrid({ kinds }: { kinds: Kind[] }) {
  return (
    <div className="grid grid-cols-[repeat(auto-fill,minmax(120px,max-content))] gap-x-6 gap-y-2.5">
      {kinds.map((k) => {
        return (
          <span key={k} className="inline-flex items-center gap-2 text-base">
            <KindIcon kind={k} />
            {KIND_LABEL[k]}
          </span>
        );
      })}
    </div>
  );
}

function KindIconBody() {
  return (
    <>
      <V label="change kinds · 14 px" width={420}>
        <KindGrid kinds={CHANGE_KINDS} />
      </V>
      <V label="learning kinds" width={300}>
        <KindGrid kinds={["tip", "gotcha", "pattern"]} />
      </V>
      <V label="library kinds" width={300}>
        <KindGrid kinds={["pattern", "playbook", "gotcha", "decision"]} />
      </V>
      <V label="size variants · 14 px is the default">
        <Row>
          <KindIcon kind="verify" size={16} />
          <KindIcon kind="failure" size={20} />
          <KindIcon kind="playbook" size={20} />
        </Row>
      </V>
    </>
  );
}

// ---------------------------------------------------------------- MarkdownProse, CodeBlock

const SAMPLE = `### Why live updates

The board must show \`wf serve\` changes within **one second**; see [[wf-3k9x2]] and the decision [[wf-3k9x2#D-7f3k2]]. @shruti approved it and @codex built the stream. The gotcha is in [[lib-4tz7c]], and [[wf-nope1]] no longer exists.

- A bullet with \`inline code\` and a [link](https://example.com)
- A second bullet with *emphasis*

1. Connect and receive a \`snapshot\`
2. Apply each \`delta\` when its \`rev\` is newer

- [x] Verify SC-1 with a command
- [ ] Verify SC-3 on a slow network

| Event | Source | Latency |
| --- | --- | --- |
| snapshot | connect | 40 ms |
| delta | watcher | 120 ms |

\`\`\`ts
export function applyDelta(snapshot: Snapshot, delta: Delta): Snapshot {
  if (delta.rev <= snapshot.rev) return snapshot;
  return { ...snapshot, rev: delta.rev };
}
\`\`\`

> One-way push is enough: the browser never needs to send over the stream.

\`\`\`wf-diagram
live-board-architecture
\`\`\`
`;

function MarkdownProseBody() {
  const diagrams = useIssue(ISSUE.rich).data?.diagrams;
  return (
    <>
      <V label="rich sample · code, table, task list, refs, @handles, diagram" width={620}>
        <MarkdownProse md={SAMPLE} diagrams={diagrams} issueId={ISSUE.rich} />
      </V>
      <V label="compact" width={420}>
        <MarkdownProse md={SAMPLE.split("```ts")[0]} issueId={ISSUE.rich} compact />
      </V>
      <V label="document typography · page (14 px body, 16 / 14 / 13 headings)" width={620}>
        <MarkdownProse
          md={`# A page of markdown\n\nBody text at 14 px with a 1.65 line height.\n\n## A section\n\n${SAMPLE}`}
          diagrams={diagrams}
          issueId={ISSUE.rich}
          document="page"
        />
      </V>
      <V
        label="traced · source={{ path }}"
        note="Every block carries data-src-line. Point at one: the tag in the left margin names path:line."
        width={620}
      >
        <MarkdownProse
          md={SAMPLE.split("```ts")[0]}
          issueId={ISSUE.rich}
          source={{
            path: "issues/wf/web/live-board-updates/goal.md",
            lineOffset: 14,
            gutter: 150,
            onJump: (line) => toast(`Would show line ${line} of goal.md`),
          }}
        />
      </V>
    </>
  );
}

function CodeBlockBody() {
  const code = `---\nid: wf-7yq2m\ntitle: "Fix tab-title count\nstatus: planned\n---\n`;
  return (
    <>
      <V label="with a language label (hover for copy)" width={420}>
        <CodeBlock
          lang="rust"
          code={`fn snapshot(&self) -> Snapshot {\n    self.index.read().clone()\n}`}
        />
      </V>
      <V label="highlighted line" width={420}>
        <CodeBlock lang="yaml" code={code} highlightLine={3} />
      </V>
      <V label="compact, height capped at 80 px" width={420}>
        <CodeBlock
          compact
          maxHeight={80}
          code={Array.from(
            { length: 12 },
            (_, i) => `line ${i + 1}: pnpm -s -C web wf:lint web/mock/workspace`,
          ).join("\n")}
        />
      </V>
      <V label="no language" width={300}>
        <CodeBlock code="codex 'Hand wf-3k9x2 over: use the handing-off skill.'" />
      </V>
    </>
  );
}

export const sharedEntries: KitEntry[] = [
  entry(
    "Shared",
    "StatusIcon",
    `${SRC}/StatusIcon.tsx`,
    "Status is the first thing every card, row and header says; a distinct glyph per status means it reads at 14 px and never relies on color alone.",
    StatusIconBody,
  ),
  entry(
    "Shared",
    "StatusSelect",
    `${SRC}/StatusSelect.tsx`,
    "Changing status is the most common write; the menu shows legal moves normally and gates illegal ones, so the rules are taught where you use them.",
    StatusSelectBody,
  ),
  entry(
    "Shared",
    "ProgressRing",
    `${SRC}/ProgressRing.tsx`,
    "One 14 px ring shows verified versus claimed versus open criteria, which is the honest measure of 'how done' that a task count cannot give.",
    ProgressRingBody,
  ),
  entry(
    "Shared",
    "AuthorChip",
    `${SRC}/AuthorChip.tsx`,
    "People and agents are told apart by shape, hue and handle together, so who did what is clear without relying on color.",
    AuthorChipBody,
  ),
  entry(
    "Shared",
    "AuthorAvatar",
    `${SRC}/AuthorChip.tsx`,
    "The bare identity tile is used where a handle would not fit: stacks, timelines and pills.",
    AuthorAvatarBody,
  ),
  entry(
    "Shared",
    "AuthorStack",
    `${SRC}/AuthorStack.tsx`,
    "Several holders of leases fit in the width of one name, and the overflow says how many more there are.",
    AuthorStackBody,
  ),
  entry(
    "Shared",
    "RelativeTime",
    `${SRC}/RelativeTime.tsx`,
    "'4m' scans faster than a timestamp, and the absolute time is one hover away; times come from file content, never from file mtimes.",
    RelativeTimeBody,
  ),
  entry(
    "Shared",
    "GroupPath",
    `${SRC}/GroupPath.tsx`,
    "A faint trail tells you where an issue lives without taking the weight of a label.",
    GroupPathBody,
  ),
  entry(
    "Shared",
    "RefLink",
    `${SRC}/RefLink.tsx`,
    "Issues, entries, tasks and library items refer to each other by id; a ref link shows the title and status instead, and marks a dangling ref before it misleads anyone.",
    RefLinkBody,
  ),
  entry(
    "Shared",
    "CopyButton",
    `${SRC}/CopyButton.tsx`,
    "Ids, links and commands are copied constantly; one button confirms the copy and works even when the clipboard API is blocked.",
    CopyButtonBody,
  ),
  entry(
    "Shared",
    "LintBadge",
    `${SRC}/LintBadge.tsx`,
    "Lint is a health signal, so it is a 6 px dot on cards and a counted badge on headers, and says nothing when there is nothing wrong.",
    LintBadgeBody,
  ),
  entry(
    "Shared",
    "EmptyState",
    `${SRC}/EmptyState.tsx`,
    "An empty panel should tell you what fills it: a button when the dashboard can do it, and the one skill that does it without the dashboard, with the command to copy for the connected agent (`codex` or `claude`), so an empty tab is an instruction, not a dead end.",
    EmptyStateBody,
  ),
  entry(
    "Shared",
    "SkillHint",
    "src/features/issue/skill-hint.tsx",
    "What an empty state offers instead of a command that does not exist: the one skill of the workflow plugin that does the job, linked to its page, and the codex command that asks for it.",
    SkillHintBody,
  ),
  entry(
    "Shared",
    "MetaLine",
    "src/features/issue/MetaLine.tsx",
    "Small facts separated by dots that wrap without leaving a dot at the end or start of a line.",
    MetaLineBody,
  ),
  entry(
    "Shared",
    "KindIcon",
    `${SRC}/KindIcon.tsx`,
    "One glyph per kind of change, learning and library item lets a timeline be scanned by shape.",
    KindIconBody,
  ),
  entry(
    "Shared",
    "MarkdownProse",
    `${SRC}/MarkdownProse.tsx`,
    "Every prose field is markdown; one calm renderer turns refs, handles and diagram fences into live elements and keeps everything else quiet and safe.",
    MarkdownProseBody,
  ),
  entry(
    "Shared",
    "CodeBlock",
    `${SRC}/CodeBlock.tsx`,
    "Commands and raw files appear as mono blocks with a copy button, and can mark the one line a lint finding points at.",
    CodeBlockBody,
  ),
];
