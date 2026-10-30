// ⌘K — search issues, groups, library items, glossary terms, skills and files, and run actions. Filters the
// snapshot on the client (cmdk's scorer, capped per section). "Move … to…" opens
// a second page listing statuses; Esc or Backspace on an empty field goes back.
import { useNavigate } from "@tanstack/react-router";
import { defaultFilter } from "cmdk";
import {
  ArrowLeftRight,
  ArrowRight,
  ArrowUpRight,
  BookText,
  Bot,
  ClipboardCopy,
  Component,
  Eye,
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
  Plug,
  Rows3,
  ScrollText,
  Search,
  Square,
  SquareTerminal,
  StepForward,
  SunMoon,
  Unplug,
  UserRound,
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
import { otherAgent } from "@/features/agent/agent-copy";
import { openAskPanel } from "@/features/ask";
import { copyCodexCommand, useNextStep } from "@/features/codex";
import { useFilesNav } from "@/features/files";
import { copyContextWithToast, showContext } from "@/features/issue/handoff";
import type {
  GlossaryTerm,
  GroupNode,
  IssueStatus,
  IssueSummary,
  LibrarySummary,
} from "@/gen/types";
import type { AgentConnection, Skill, WorkspaceFileInfo } from "@/lib/api";
import {
  agentControls,
  agentName,
  allSkills,
  useAgent,
  useGlossary,
  useGroupTree,
  useIssueMap,
  useMoveIssue,
  usePreferredAgent,
  useSkills,
  useSnapshot,
  useWorkspaceFiles,
} from "@/lib/api";
import { parseTs } from "@/lib/format";
import { useGo, useOpenIssue, useOpenIssueId, usePathname } from "@/lib/nav";
import { resolveTheme, usePrefs } from "@/lib/prefs";
import { isLegalTransition, STATUS_LABEL, STATUS_ORDER } from "@/lib/status";
import { playNextEvent, withMockControls } from "./mock-controls";
import { useReturnFocus } from "./return-focus";
import { openAddLibrary, openAddWork, openAgent, openAgentPanel, useShell } from "./shell-store";
import { useNavRail } from "./useNavRail";
import { useSelectGroup } from "./useSelectGroup";

const ICON = { size: 14, strokeWidth: 1.75 } as const;
const LIMIT = { issues: 8, groups: 5, library: 5, glossary: 4, skills: 4, files: 5, recent: 6 };

type Page = "root" | "move";

export function CommandPalette() {
  const open = useShell((s) => s.paletteOpen);
  const setOpen = useShell((s) => s.setPaletteOpen);
  const focus = useReturnFocus("paletteOpen");

  return (
    <CommandDialog
      open={open}
      onOpenChange={setOpen}
      title="Command palette"
      commandProps={{ shouldFilter: false, loop: true }}
      onCloseAutoFocus={focus.onCloseAutoFocus}
    >
      <PaletteBody
        // An item that takes the person somewhere (an issue, a page, another dialog) closes the
        // palette and lets that place have focus; Esc and the in-place actions give focus back to
        // what had it before the palette opened.
        close={() => {
          focus.release();
          setOpen(false);
        }}
        closeInPlace={() => setOpen(false)}
      />
    </CommandDialog>
  );
}

/** Lives inside the dialog content, so its state resets every time the palette closes. */
function PaletteBody({ close, closeInPlace }: { close: () => void; closeInPlace: () => void }) {
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
          <MovePage issue={openIssue} query={query} close={closeInPlace} />
        ) : (
          <RootPage
            query={query}
            openIssue={openIssue}
            setPage={setPage}
            close={close}
            closeInPlace={closeInPlace}
          />
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

/**
 * The library's search box, once the palette has closed and the lazy view has mounted it (a frame
 * at a time, for a second): focus set while the palette is still open is taken back as it closes.
 */
function focusLibrarySearch(tries = 60) {
  const box = document.querySelector<HTMLElement>('[data-wf="LibrarySearchBox"] input');
  const dialogOpen = document.querySelector('[role="dialog"][data-state="open"]');
  if (box && !dialogOpen) box.focus();
  else if (tries > 0) requestAnimationFrame(() => focusLibrarySearch(tries - 1));
}

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
  /** Keep the palette open (sub-pages, and a row that has nothing to do right now). */
  stay?: boolean;
  /** Takes the person nowhere: focus goes back to where it was when the palette closes. */
  inPlace?: boolean;
  /** Listed and selectable, but it does nothing now (a run is going). A reader hears it as unavailable. */
  unavailable?: boolean;
  run: () => void;
}

function RootPage({
  query,
  openIssue,
  setPage,
  close,
  closeInPlace,
}: {
  query: string;
  openIssue?: IssueSummary;
  setPage: (p: Page) => void;
  close: () => void;
  closeInPlace: () => void;
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
    if (!a.stay) (a.inPlace ? closeInPlace : close)();
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
            // Not `disabled`: cmdk skips a disabled row, and Enter would run the next match (a
            // skill page) instead of saying why this one does nothing.
            aria-disabled={a.unavailable || undefined}
            className={a.unavailable ? "text-fg-muted" : undefined}
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
  const inLibrary = usePathname().startsWith("/lib");
  const theme = usePrefs((s) => s.theme);
  const setTheme = usePrefs((s) => s.setTheme);
  const density = usePrefs((s) => s.density);
  const setDensity = usePrefs((s) => s.setDensity);
  const { collapsed: navCollapsed, toggle: toggleNav } = useNavRail();
  const shell = useShell();
  // The same hook and the same copy as the header and the card menu: one toast per run.
  const nextStep = useNextStep(openIssue);
  // The agent the buttons name (plan D12), and the one that is connected, if any.
  const agent = useAgent();
  const preferred = usePreferredAgent();
  const busyName = agentName(nextStep.run?.agent ?? preferred);

  const dark = resolveTheme(theme) === "dark";
  const actions: Action[] = [
    {
      id: "add-work",
      label: "Add work…",
      icon: <FolderPlus {...ICON} />,
      shortcut: "n",
      hint: "Split into issues",
      keywords: ["create", "new", "group", "split", "issues", "outcome"],
      // The same start as the `n` key and the toolbar button: the first question, "What are you
      // adding?". "Add one issue…" below is the direct path.
      run: () => openAddWork(),
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
    // The agent first: it is what an open issue is most often opened for.
    actions.push(
      {
        id: "open-codex",
        label: `Open ${openIssue.id} in ${agentName(preferred)}`,
        icon: <SquareTerminal {...ICON} />,
        hint: "Copies the command",
        inPlace: true,
        keywords: [
          "open in codex",
          "open in claude",
          "codex",
          "claude",
          "agent",
          "terminal",
          "cli",
          "command",
          openIssue.title,
        ],
        run: () => void copyCodexCommand(openIssue),
      },
      {
        id: "next-step",
        label: `Do the next step of ${openIssue.id}`,
        icon: <StepForward {...ICON} />,
        hint: nextStep.busy
          ? `${busyName} is working on it`
          : agent.status === "connected"
            ? `${agentName(preferred)}, in the background`
            : "Connects an agent first",
        keywords: [
          "codex",
          "claude",
          "run",
          "continue",
          "agent",
          "do next step",
          "do the next step",
          openIssue.title,
        ],
        inPlace: true,
        // A run is going: the row stays and says so, instead of running or being skipped.
        unavailable: nextStep.busy,
        stay: nextStep.busy,
        run: () =>
          nextStep.busy
            ? void toast(`${busyName} is already working on ${openIssue.id}`, {
                id: `codex-busy:${openIssue.id}`,
              })
            : void nextStep.start(),
      },
      ...(nextStep.busy
        ? [
            {
              id: "cancel-run",
              label: `Cancel ${busyName}'s run on ${openIssue.id}`,
              icon: <Square {...ICON} />,
              hint: "Stops the run",
              keywords: ["stop", "abort", "cancel", "codex", "claude", "run", openIssue.title],
              inPlace: true,
              run: () => void nextStep.cancel(),
            } satisfies Action,
          ]
        : []),
      {
        id: "copy-context",
        label: `Hand over ${openIssue.id}: copy its context`,
        icon: <ClipboardCopy {...ICON} />,
        hint: "Copies the context bundle",
        keywords: [
          "handoff",
          "hand off",
          "hand over",
          "bundle",
          "context",
          "copy context",
          "markdown",
          "share",
          openIssue.title,
        ],
        inPlace: true,
        run: () => void copyContextWithToast(openIssue.id),
      },
      {
        id: "view-context",
        label: `View the context of ${openIssue.id}`,
        icon: <Eye {...ICON} />,
        hint: "What a hand-off copies",
        keywords: ["handoff", "bundle", "read", "show", "context", "markdown", openIssue.title],
        // Opens a dialog of its own, which takes focus: the palette must not take it back.
        run: () => showContext(openIssue.id),
      },
      {
        id: "ask-library",
        label: `Ask the library about ${openIssue.id}`,
        icon: <MessageCircleQuestionMark {...ICON} />,
        hint: "Opens a side panel",
        keywords: ["ask", "question", "library", "answer", "citations", "query", openIssue.title],
        // The panel opens beside the issue, so nothing here takes focus away from it.
        run: () => openAskPanel({ issue: openIssue.id }),
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
    );
  }

  actions.push(...agentActions(agent));

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
      label: "Library",
      icon: <Library {...ICON} />,
      shortcut: "g l",
      keywords: ["go to library", "go to workdatabase", "patterns", "playbooks", "gotchas", "wiki"],
      run: () => go.library(),
    },
    {
      id: "go-personal",
      label: "Open personal library",
      icon: <UserRound {...ICON} />,
      shortcut: "g p",
      keywords: ["library personal", "my library", "topics", "research", "notes", "codebases"],
      run: () => void navigate({ to: "/lib/me" }),
    },
    {
      id: "go-team-libraries",
      label: "Library · Team libraries",
      icon: <Library {...ICON} />,
      shortcut: "g t",
      keywords: ["team library", "team libraries", "handbook", "wiki", "github"],
      run: () => void navigate({ to: "/lib/t" }),
    },
    ...(openIssue
      ? []
      : [
          {
            id: "ask-library",
            label: "Ask the library…",
            icon: <MessageCircleQuestionMark {...ICON} />,
            hint: "Pick an issue first",
            keywords: ["ask", "question", "library", "answer", "citations", "query"],
            run: () => openAskPanel(),
          } satisfies Action,
        ]),
    {
      id: "add-team-library",
      label: "Add team library…",
      icon: <FolderPlus {...ICON} />,
      hint: "Paste a GitHub link",
      keywords: ["library", "team", "github", "link", "handbook", "wiki", "repo", "connect"],
      run: openAddLibrary,
    },
    {
      id: "search-library",
      label: "Search the library",
      icon: <Search {...ICON} />,
      shortcut: "/",
      keywords: ["find", "pages", "libraries", "wiki", "personal", "team", "docs"],
      run: () => {
        if (!inLibrary) void go.library();
        requestAnimationFrame(() => focusLibrarySearch());
      },
    },
    {
      id: "go-glossary",
      label: "Library · Glossary",
      icon: <BookText {...ICON} />,
      shortcut: "g g",
      keywords: ["go to glossary", "terms", "words", "vocabulary"],
      run: () => void navigate({ to: "/glossary" }),
    },
    {
      id: "open-files",
      label: "Library · Files",
      icon: <FolderTree {...ICON} />,
      shortcut: "g f",
      keywords: ["go to files", "open workspace files", "source", "markdown", "edit", "tree"],
      run: () => void files.open(),
    },
    {
      id: "go-skills",
      label: "Library · Skills",
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

/**
 * The agent's commands (plan D11): Connect an agent while none is, Switch and Disconnect while one
 * is, and Agent status always. They open the same dialogs as the nav row.
 */
function agentActions(agent: AgentConnection): Action[] {
  const kind = agent.agent;
  const name = kind ? agentName(kind) : undefined;
  const keywords = ["agent", "codex", "claude", "bridge", "pair", "connect"];
  const actions: Action[] = [];
  if (agent.status === "none" || agent.status === "pairing")
    actions.push({
      id: "connect-agent",
      label: "Connect an agent",
      icon: <Plug {...ICON} />,
      hint: agent.status === "pairing" ? `${name}, waiting for the bridge` : "Codex or Claude Code",
      keywords: [...keywords, "link", "start"],
      run: () => openAgent(),
    });
  if (kind && name && (agent.status === "connected" || agent.status === "lost")) {
    const other = otherAgent(kind);
    actions.push(
      {
        id: "switch-agent",
        label: `Switch to ${agentName(other)}`,
        icon: <ArrowLeftRight {...ICON} />,
        hint: `Instead of ${name}`,
        keywords: [...keywords, "change", "switch agent"],
        run: () => openAgent({ agent: other }),
      },
      {
        id: "disconnect-agent",
        label: `Disconnect ${name}`,
        icon: <Unplug {...ICON} />,
        hint: "Do next step needs an agent",
        keywords: [...keywords, "disconnect", "unpair", "forget", "stop"],
        inPlace: true,
        run: () => {
          agentControls.disconnect();
          toast(`Disconnected ${name}`);
        },
      },
    );
  }
  actions.push({
    id: "agent-status",
    label: "Agent status",
    icon: <Bot {...ICON} />,
    hint: name && agent.status !== "pairing" ? `${name} · ${agent.status}` : "Not connected",
    keywords: [...keywords, "status", "runs", "skills", "host"],
    run: () => openAgentPanel(),
  });
  return actions;
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
