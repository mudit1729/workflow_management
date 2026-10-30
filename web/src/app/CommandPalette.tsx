// ⌘K — search issues, groups, library items, glossary terms, skills and files, and run actions. Filters the
// snapshot on the client (cmdk's scorer, capped per section). "Move … to…" opens
// a second page listing statuses; Esc or Backspace on an empty field goes back.
import { useNavigate } from "@tanstack/react-router";
import { defaultFilter } from "cmdk";
import {
  ArrowRight,
  ArrowUpRight,
  BookText,
  Component,
  FilePenLine,
  FilePlus,
  FileText,
  FolderPlus,
  FolderTree,
  Keyboard,
  LayoutGrid,
  Library,
  MessageCircleQuestionMark,
  PanelLeft,
  Play,
  Rows3,
  ScrollText,
  SquareTerminal,
  StepForward,
  SunMoon,
  Terminal,
  Zap,
} from "lucide-react";
import { type ReactNode, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { KindIcon, StatusIcon } from "@/components/common";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  Kbd,
} from "@/components/ui";
import { useFilesNav } from "@/features/files";
import type {
  GlossaryTerm,
  GroupNode,
  IssueStatus,
  IssueSummary,
  LibrarySummary,
} from "@/gen/types";
import type { CodexRunControls, Skill, WorkspaceFileInfo } from "@/lib/api";
import {
  allSkills,
  codexCommand,
  useGlossary,
  useGroupTree,
  useIssueMap,
  useMoveIssue,
  useSkills,
  useSnapshot,
  useStartCodexRun,
  useWorkspaceFiles,
} from "@/lib/api";
import { parseTs } from "@/lib/format";
import { useGo, useOpenIssue, useOpenIssueId } from "@/lib/nav";
import { resolveTheme, usePrefs } from "@/lib/prefs";
import { isLegalTransition, STATUS_LABEL, STATUS_ORDER } from "@/lib/status";
import { copyText } from "./clipboard";
import { playNextEvent, withMockControls } from "./mock-controls";
import { openAddWork, useShell } from "./shell-store";
import { useNavRail } from "./useNavRail";
import { useSelectGroup } from "./useSelectGroup";

const ICON = { size: 14, strokeWidth: 1.75 } as const;
const LIMIT = { issues: 8, groups: 5, library: 5, glossary: 4, skills: 4, files: 5, recent: 6 };

type Page = "root" | "move";

export function CommandPalette() {
  const open = useShell((s) => s.paletteOpen);
  const setOpen = useShell((s) => s.setPaletteOpen);

  return (
    <CommandDialog
      open={open}
      onOpenChange={setOpen}
      title="Command palette"
      commandProps={{ shouldFilter: false, loop: true }}
    >
      <PaletteBody close={() => setOpen(false)} />
    </CommandDialog>
  );
}

/** Lives inside the dialog content, so its state resets every time the palette closes. */
function PaletteBody({ close }: { close: () => void }) {
  const [query, setQuery] = useState("");
  const [page, setPageState] = useState<Page>("root");
  const openId = useOpenIssueId();
  const issueMap = useIssueMap();
  const openIssue = openId ? issueMap.get(openId) : undefined;

  const setPage = (next: Page) => {
    setPageState(next);
    setQuery("");
  };

  // Esc on a sub-page goes back instead of closing. A window capture listener runs
  // before Radix's document-level Escape handler, which skips handled events.
  useEffect(() => {
    if (page === "root") return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.preventDefault();
      setPageState("root");
      setQuery("");
    };
    window.addEventListener("keydown", onKey, { capture: true });
    return () => window.removeEventListener("keydown", onKey, { capture: true });
  }, [page]);

  return (
    <div data-wf="CommandPalette" className="flex min-h-0 flex-col">
      {page === "move" && openIssue && (
        <div className="flex items-center gap-1.5 px-3 pt-2.5 text-fg-muted text-xs">
          <span className="rounded-sm bg-muted px-1.5 py-0.5 font-mono">{openIssue.id}</span>
          <span className="min-w-0 truncate">{openIssue.title}</span>
        </div>
      )}
      <CommandInput
        value={query}
        onValueChange={setQuery}
        placeholder={
          page === "move" && openIssue
            ? `Move ${openIssue.id} to…`
            : "Search issues, library, glossary and files, or type a command…"
        }
        aria-label="Search or run a command"
        onKeyDown={(e) => {
          if (page !== "root" && e.key === "Backspace" && query === "") {
            e.preventDefault();
            setPage("root");
          }
        }}
      />
      <CommandList>
        {page === "move" && openIssue ? (
          <MovePage issue={openIssue} query={query} close={close} />
        ) : (
          <RootPage query={query} openIssue={openIssue} setPage={setPage} close={close} />
        )}
      </CommandList>
      <PaletteFooter page={page} />
    </div>
  );
}

// ---------------------------------------------------------------- ranking

/**
 * cmdk's scorer accepts any subsequence, so "move" would match half the workspace.
 * Word and prefix matches score above 0.5, scattered letters below 0.15: cut there.
 */
const MIN_SCORE = 0.2;

interface Ranked<T> {
  items: T[];
  /** Best score in the list, used to order the sections. */
  best: number;
}

/** Keep the items `score` rates at least MIN_SCORE, best first (stable among equals), up to `limit`. */
function rankBy<T>(items: T[], query: string, score: (t: T) => number, limit: number): Ranked<T> {
  if (!query) return { items: [], best: 0 };
  const scored = items
    .map((item) => ({ item, score: score(item) }))
    .filter((r) => r.score >= MIN_SCORE)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
  return { items: scored.map((r) => r.item), best: scored[0]?.score ?? 0 };
}

function rank<T>(
  items: T[],
  query: string,
  text: (t: T) => [string, string[]],
  limit: number,
): Ranked<T> {
  return rankBy(
    items,
    query,
    (item) => {
      const [value, keywords] = text(item);
      return defaultFilter(value, query, keywords);
    },
    limit,
  );
}

/**
 * Glossary terms and files hold words that are also the names of places ("files", "library",
 * "glossary.md"), so they must not outrank the navigation action of that name: cmdk scores a word
 * match 0.89 and a prefix 0.99. A term or file named exactly like the query (0.95) beats a word
 * match elsewhere; anything looser sits below the actions, and meaning-only matches below that.
 */
const EXACT_NAME_SCORE = 0.95;
const LOOSE_NAME_WEIGHT = 0.85;
const MEANING_WEIGHT = 0.5;

const baseName = (path: string) => path.slice(path.lastIndexOf("/") + 1);
const dirOf = (path: string) => path.slice(0, Math.max(0, path.lastIndexOf("/")));

function flattenGroups(root: GroupNode): { node: GroupNode; path: string[] }[] {
  const out: { node: GroupNode; path: string[] }[] = [];
  const walk = (nodes: GroupNode[], path: string[]) => {
    for (const node of nodes) {
      out.push({ node, path });
      walk(node.children, [...path, node.title]);
    }
  };
  walk(root.children, []);
  return out;
}

// ---------------------------------------------------------------- root page

interface Action {
  id: string;
  label: string;
  icon: ReactNode;
  shortcut?: string;
  hint?: string;
  keywords?: string[];
  /** Keep the palette open (sub-pages). */
  stay?: boolean;
  run: () => void;
}

function RootPage({
  query,
  openIssue,
  setPage,
  close,
}: {
  query: string;
  openIssue?: IssueSummary;
  setPage: (p: Page) => void;
  close: () => void;
}) {
  const snapshot = useSnapshot().data;
  const root = useGroupTree();
  const open = useOpenIssue();
  const go = useGo();
  const navigate = useNavigate();
  const filesNav = useFilesNav();
  const selectGroup = useSelectGroup();
  const actions = useActions(openIssue, setPage);
  const q = query.trim();

  const issues = useMemo<Ranked<IssueSummary>>(() => {
    const all = snapshot?.issues ?? [];
    if (!q) {
      const recent = [...all]
        .filter((i) => i.status !== "cancelled" && i.status !== "done")
        .sort(
          (a, b) =>
            (b.last_activity ? parseTs(b.last_activity.ts) : 0) -
            (a.last_activity ? parseTs(a.last_activity.ts) : 0),
        )
        .slice(0, LIMIT.recent);
      return { items: recent, best: 1 };
    }
    return rank(
      all,
      q,
      (i) => [`${i.id} ${i.title}`, [...i.group_path, ...i.labels]],
      LIMIT.issues,
    );
  }, [snapshot, q]);

  const groups = useMemo(
    () =>
      root
        ? rank(
            flattenGroups(root),
            q,
            (g) => [g.node.title, [...g.path, g.node.slug]],
            LIMIT.groups,
          )
        : { items: [], best: 0 },
    [root, q],
  );

  const library = useMemo(
    () =>
      rank(
        snapshot?.library ?? [],
        q,
        (l) => [`${l.id} ${l.title}`, [l.kind, l.description, ...l.tags]],
        LIMIT.library,
      ),
    [snapshot, q],
  );

  const glossaryTerms = useGlossary().data;
  const terms = useMemo(
    () =>
      rankBy(
        glossaryTerms ?? [],
        q,
        (t) => {
          if (t.term.toLowerCase() === q.toLowerCase()) return EXACT_NAME_SCORE;
          return Math.max(
            LOOSE_NAME_WEIGHT * defaultFilter(t.term, q),
            MEANING_WEIGHT * defaultFilter(t.term, q, [t.means, ...t.avoid]),
          );
        },
        LIMIT.glossary,
      ),
    [glossaryTerms, q],
  );

  const skillList = useSkills().data;
  const skills = useMemo(
    () =>
      rankBy(
        allSkills(skillList),
        q,
        (k: Skill) => {
          if (k.name.toLowerCase() === q.toLowerCase()) return EXACT_NAME_SCORE;
          // A description is long enough for scattered letters to match anything, so only a
          // phrase of the query that it really contains counts.
          const inDescription = k.description.toLowerCase().includes(q.toLowerCase());
          return Math.max(LOOSE_NAME_WEIGHT * defaultFilter(k.name, q), inDescription ? 0.45 : 0);
        },
        LIMIT.skills,
      ),
    [skillList, q],
  );

  const workspaceFiles = useWorkspaceFiles().data;
  const issueTitles = useMemo(
    () => new Map((snapshot?.issues ?? []).map((i) => [i.id, i.title])),
    [snapshot],
  );
  const files = useMemo(() => {
    // Among equal matches (every issue has a goal.md) the open issue's own files come first.
    const own = openIssue ? `${openIssue.path}/` : undefined;
    const list = own
      ? [...(workspaceFiles ?? [])].sort(
          (a, b) => Number(b.path.startsWith(own)) - Number(a.path.startsWith(own)),
        )
      : (workspaceFiles ?? []);
    return rankBy(
      list,
      q,
      (f) => {
        const name = baseName(f.path);
        if (name.toLowerCase() === q.toLowerCase()) return EXACT_NAME_SCORE;
        return LOOSE_NAME_WEIGHT * defaultFilter(name, q, [f.path]);
      },
      LIMIT.files,
    );
  }, [workspaceFiles, openIssue, q]);

  const matchedActions = useMemo<Ranked<Action>>(() => {
    if (!q) return { items: actions, best: 0.5 };
    const scored = actions
      .map((a) => ({ a, score: defaultFilter(a.label, q, a.keywords) }))
      .filter((r) => r.score >= MIN_SCORE)
      .sort((x, y) => y.score - x.score);
    return { items: scored.map((r) => r.a), best: scored[0]?.score ?? 0 };
  }, [actions, q]);

  const runAction = (a: Action) => {
    if (!a.stay) close();
    a.run();
  };

  type SectionKey = "issues" | "groups" | "library" | "glossary" | "skills" | "files" | "actions";
  const sections: Record<SectionKey, ReactNode> = {
    issues: issues.items.length > 0 && (
      <CommandGroup key="issues" heading={q ? "Issues" : "Recent issues"}>
        {issues.items.map((issue) => (
          <CommandItem
            key={issue.id}
            value={`issue:${issue.id}`}
            icon={<StatusIcon status={issue.status} size={14} />}
            hint={issue.group_path.join(" / ")}
            onSelect={() => {
              close();
              void open(issue.id);
            }}
          >
            <span className="mr-2 inline-block w-[64px] font-mono text-fg-faint text-xs">
              {issue.id}
            </span>
            {issue.title}
          </CommandItem>
        ))}
      </CommandGroup>
    ),
    groups: groups.items.length > 0 && (
      <CommandGroup key="groups" heading="Groups">
        {groups.items.map(({ node, path }) => (
          <CommandItem
            key={node.id}
            value={`group:${node.id}`}
            icon={
              <span
                className="size-2 rounded-full"
                style={{ background: `var(--wf-hue-${node.color})` }}
              />
            }
            hint={`${node.rollup.issues} ${node.rollup.issues === 1 ? "issue" : "issues"}`}
            onSelect={() => {
              close();
              selectGroup(node.id);
            }}
          >
            {path.length > 0 && <span className="text-fg-faint">{path.join(" / ")} / </span>}
            <span className={node.implicit ? "text-fg-muted italic" : undefined}>{node.title}</span>
          </CommandItem>
        ))}
      </CommandGroup>
    ),
    library: library.items.length > 0 && (
      <CommandGroup key="library" heading="Library">
        {library.items.map((item: LibrarySummary) => (
          <CommandItem
            key={item.id}
            value={`lib:${item.id}`}
            icon={<KindIcon kind={item.kind} size={14} />}
            hint={item.status === "draft" ? "Draft" : item.description}
            onSelect={() => {
              close();
              go.libraryItem(item.id);
            }}
          >
            {item.title}
          </CommandItem>
        ))}
      </CommandGroup>
    ),
    glossary: terms.items.length > 0 && (
      <CommandGroup key="glossary" heading="Glossary">
        {terms.items.map((t: GlossaryTerm) => (
          <CommandItem
            key={t.term}
            value={`term:${t.term}`}
            icon={<BookText {...ICON} />}
            hint={t.means}
            onSelect={() => {
              close();
              void navigate({ to: "/glossary", search: { q: t.term } });
            }}
          >
            {t.term}
          </CommandItem>
        ))}
      </CommandGroup>
    ),
    skills: skills.items.length > 0 && (
      <CommandGroup key="skills" heading="Skills">
        {skills.items.map((k: Skill) => (
          <CommandItem
            key={k.path}
            value={`skill:${k.name}`}
            icon={<ScrollText {...ICON} />}
            hint={k.plugin}
            onSelect={() => {
              close();
              void navigate({ to: "/skills", search: { skill: k.name } });
            }}
          >
            {k.name}
          </CommandItem>
        ))}
      </CommandGroup>
    ),
    files: files.items.length > 0 && (
      <CommandGroup key="files" heading="Files">
        {files.items.map((f: WorkspaceFileInfo) => (
          <CommandItem
            key={f.path}
            value={`file:${f.path}`}
            icon={<FileText {...ICON} />}
            hint={(f.issue && issueTitles.get(f.issue)) || dirOf(f.path)}
            onSelect={() => {
              close();
              void filesNav.open(f.path);
            }}
          >
            {baseName(f.path)}
          </CommandItem>
        ))}
      </CommandGroup>
    ),
    actions: matchedActions.items.length > 0 && (
      <CommandGroup key="actions" heading="Actions">
        {matchedActions.items.map((a) => (
          <CommandItem
            key={a.id}
            value={`action:${a.id}`}
            icon={a.icon}
            shortcut={a.shortcut}
            hint={a.hint}
            onSelect={() => runAction(a)}
          >
            {a.label}
          </CommandItem>
        ))}
      </CommandGroup>
    ),
  };
  // The section holding the best match comes first, so Enter runs what you typed. Scores within
  // 0.05 of each other are a tie (cmdk scores "glossary" 0.8910 in an action and 0.8912 in an
  // issue title), and on a tie the actions win: "files", "glossary" and "board" are names of
  // places, and a command named like the query is what the person means before an issue that
  // merely contains the word. Other ties keep the default order. Without a query: recent issues,
  // then actions.
  const tier = (score: number) => Math.round(score * 20);
  const order = (["issues", "groups", "library", "glossary", "skills", "files", "actions"] as const)
    .map((key, i) => ({
      key,
      i,
      best: tier(
        {
          issues,
          groups,
          library,
          glossary: terms,
          skills,
          files,
          actions: matchedActions,
        }[key].best,
      ),
    }))
    .sort(
      (x, y) =>
        y.best - x.best || Number(y.key === "actions") - Number(x.key === "actions") || x.i - y.i,
    )
    .map((x) => x.key);

  return (
    <>
      <CommandEmpty>
        <span className="block text-fg">No results for “{q}”</span>
        <span className="mt-1 block text-fg-faint">
          Try an issue id like wf-3k9x2, a group name or a command.
        </span>
      </CommandEmpty>

      {order.map((key) => sections[key])}
    </>
  );
}

function useActions(openIssue: IssueSummary | undefined, setPage: (p: Page) => void): Action[] {
  const go = useGo();
  const navigate = useNavigate();
  const files = useFilesNav();
  const theme = usePrefs((s) => s.theme);
  const setTheme = usePrefs((s) => s.setTheme);
  const density = usePrefs((s) => s.density);
  const setDensity = usePrefs((s) => s.setDensity);
  const { collapsed: navCollapsed, toggle: toggleNav } = useNavRail();
  const shell = useShell();
  const { start: startRun } = useStartCodexRun();

  const dark = resolveTheme(theme) === "dark";
  const actions: Action[] = [
    {
      id: "add-work",
      label: "Add work…",
      icon: <FolderPlus {...ICON} />,
      shortcut: "n",
      hint: "Split into issues",
      keywords: ["create", "new", "group", "split", "issues", "outcome"],
      run: () => openAddWork({ kind: "group" }),
    },
    {
      id: "add-issue",
      label: "Add one issue…",
      icon: <FilePlus {...ICON} />,
      keywords: ["create", "new issue", "single", "task"],
      run: () => openAddWork({ kind: "issue" }),
    },
  ];

  if (openIssue) {
    // Codex first: it is what an open issue is most often opened for.
    actions.push(
      {
        id: "open-codex",
        label: `Open ${openIssue.id} in Codex`,
        icon: <SquareTerminal {...ICON} />,
        hint: "Copies the command",
        keywords: [
          "open in codex",
          "codex",
          "agent",
          "terminal",
          "cli",
          "handoff",
          openIssue.title,
        ],
        run: () =>
          void copyText(
            codexCommand(openIssue).command,
            `Codex command copied for ${openIssue.id}. Paste it in a terminal.`,
          ),
      },
      {
        id: "next-step",
        label: `Do the next step of ${openIssue.id}`,
        icon: <StepForward {...ICON} />,
        hint: "Codex, in the background",
        keywords: ["codex", "run", "continue", "agent", "do next step", openIssue.title],
        run: () => void doNextStep(openIssue, startRun),
      },
      {
        id: "move",
        label: `Move ${openIssue.id} to…`,
        icon: <ArrowRight {...ICON} />,
        keywords: ["status", "change status", openIssue.title],
        stay: true,
        run: () => setPage("move"),
      },
      {
        id: "open-page",
        label: `Open ${openIssue.id} as a full page`,
        icon: <ArrowUpRight {...ICON} />,
        shortcut: "o",
        keywords: ["page", "expand"],
        run: () => go.issuePage(openIssue.id),
      },
      {
        id: "edit-goal",
        label: `Edit goal.md of ${openIssue.id}`,
        icon: <FilePenLine {...ICON} />,
        keywords: ["source", "markdown", "file", "edit", openIssue.title],
        run: () => void files.edit(`${openIssue.path}/goal.md`),
      },
      {
        id: "copy-context",
        label: `Copy “wf context ${openIssue.id}”`,
        icon: <Terminal {...ICON} />,
        keywords: ["handoff", "agent", "cli", "command"],
        run: () => copyText(`wf context ${openIssue.id}`, "Command copied"),
      },
    );
  }

  actions.push(
    {
      id: "go-board",
      label: "Workflow · Board",
      icon: <LayoutGrid {...ICON} />,
      shortcut: "g w",
      keywords: ["go to board", "go to workflow", "open board", "kanban", "issues"],
      run: () => go.board(),
    },
    {
      id: "go-needs-you",
      label: "Workflow · Needs you",
      icon: <MessageCircleQuestionMark {...ICON} />,
      hint: "Board filter",
      keywords: ["inbox", "go to inbox", "requests", "questions", "blocked on me", "waiting"],
      run: () => go.needsYou(),
    },
    {
      id: "go-library",
      label: "Workdatabase · Library",
      icon: <Library {...ICON} />,
      shortcut: "g l",
      keywords: ["go to library", "go to workdatabase", "patterns", "playbooks", "gotchas"],
      run: () => go.library(),
    },
    {
      id: "go-glossary",
      label: "Workdatabase · Glossary",
      icon: <BookText {...ICON} />,
      shortcut: "g g",
      keywords: ["go to glossary", "terms", "words", "vocabulary"],
      run: () => void navigate({ to: "/glossary" }),
    },
    {
      id: "open-files",
      label: "Workdatabase · Files",
      icon: <FolderTree {...ICON} />,
      shortcut: "g f",
      keywords: ["go to files", "open workspace files", "source", "markdown", "edit", "tree"],
      run: () => void files.open(),
    },
    {
      id: "go-skills",
      label: "Workdatabase · Skills",
      icon: <ScrollText {...ICON} />,
      shortcut: "g s",
      keywords: ["go to skills", "plugins", "install", "codex", "claude", "marketplace"],
      run: () => void navigate({ to: "/skills" }),
    },
    {
      id: "go-kit",
      label: "Kit (prototype tools)",
      icon: <Component {...ICON} />,
      shortcut: "g k",
      keywords: ["go to kit", "component kit", "gallery", "components", "prototype tools"],
      run: () => go.kit(),
    },
    {
      id: "theme",
      label: dark ? "Switch to light theme" : "Switch to dark theme",
      icon: <SunMoon {...ICON} />,
      keywords: ["theme", "dark", "light", "appearance"],
      run: () => setTheme(dark ? "light" : "dark"),
    },
    {
      id: "density",
      label: density === "comfy" ? "Switch to compact density" : "Switch to comfortable density",
      icon: <Rows3 {...ICON} />,
      keywords: ["density", "compact", "comfortable", "spacing"],
      run: () => setDensity(density === "comfy" ? "compact" : "comfy"),
    },
    {
      id: "nav",
      label: navCollapsed ? "Expand sidebar" : "Collapse sidebar",
      icon: <PanelLeft {...ICON} />,
      shortcut: "mod+b",
      keywords: ["sidebar", "nav", "navigation"],
      run: toggleNav,
    },
    {
      id: "shortcuts",
      label: "Keyboard shortcuts",
      icon: <Keyboard {...ICON} />,
      shortcut: "?",
      keywords: ["help", "keys", "hotkeys"],
      run: () => shell.setShortcutsOpen(true),
    },
    {
      id: "conflict",
      label: "Simulate a conflict on the next write",
      icon: <Zap {...ICON} />,
      hint: "Prototype",
      keywords: ["409", "mock", "prototype"],
      run: () => {
        const ran = withMockControls((c) => c.conflictNextWrite());
        if (!ran) return;
        toast("The next write will conflict", {
          description: "Move a card or tick a box to see the rollback.",
        });
      },
    },
    {
      id: "play-event",
      label: "Play the next live event",
      icon: <Play {...ICON} />,
      hint: "Prototype",
      keywords: ["live", "sse", "mock", "prototype", "event"],
      run: () => withMockControls((c) => playNextEvent(c)),
    },
  );

  return actions;
}

// ---------------------------------------------------------------- Codex

/** Start a Codex run on the next ready task and say what happened. */
async function doNextStep(issue: IssueSummary, start: CodexRunControls["start"]) {
  const run = await start(issue.id, "next_step");
  if (!run) return; // The hook has already said why.
  if (run.status === "nothing_ready") {
    toast(run.reason ?? "No task is ready.", { description: issue.id });
    return;
  }
  toast(`Codex started${run.task ? ` ${run.task}` : ""} on ${issue.id}`, {
    description: run.task_title,
  });
}

// ---------------------------------------------------------------- move page

function MovePage({
  issue,
  query,
  close,
}: {
  issue: IssueSummary;
  query: string;
  close: () => void;
}) {
  const { move } = useMoveIssue();
  const q = query.trim();
  const statuses = q
    ? STATUS_ORDER.filter((s) => defaultFilter(STATUS_LABEL[s], q) > 0)
    : STATUS_ORDER;

  return (
    <>
      <CommandEmpty>No status matches “{q}”.</CommandEmpty>
      <CommandGroup heading="Status">
        {statuses.map((status: IssueStatus) => {
          const current = status === issue.status;
          const legal = isLegalTransition(issue.status, status);
          return (
            <CommandItem
              key={status}
              value={`status:${status}`}
              disabled={current}
              icon={<StatusIcon status={status} size={14} />}
              hint={current ? "Current" : legal ? undefined : "Needs Move anyway"}
              onSelect={() => {
                close();
                move(issue, status);
              }}
              className={legal || current ? undefined : "text-fg-muted"}
            >
              {STATUS_LABEL[status]}
            </CommandItem>
          );
        })}
      </CommandGroup>
    </>
  );
}

// ---------------------------------------------------------------- footer

function PaletteFooter({ page }: { page: Page }) {
  return (
    <div className="flex h-9 shrink-0 items-center gap-4 border-border border-t px-3 text-fg-faint text-xs">
      <span className="flex items-center gap-1">
        <Kbd>↑</Kbd>
        <Kbd>↓</Kbd>
        <span className="ml-0.5">to move</span>
      </span>
      <span className="flex items-center gap-1">
        <Kbd combo="Enter" />
        <span className="ml-0.5">to select</span>
      </span>
      <span className="flex items-center gap-1">
        <Kbd combo="Escape" />
        <span className="ml-0.5">{page === "root" ? "to close" : "to go back"}</span>
      </span>
    </div>
  );
}
