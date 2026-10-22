// ⌘K — search issues, groups and library items, and run actions. Filters the
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
  FolderPlus,
  FolderTree,
  Inbox,
  Keyboard,
  LayoutGrid,
  Library,
  PanelLeft,
  Play,
  Plus,
  Rows3,
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
import type { GroupNode, IssueStatus, IssueSummary, LibrarySummary } from "@/gen/types";
import { useGroupTree, useIssueMap, useMoveIssue, useSnapshot } from "@/lib/api";
import { parseTs } from "@/lib/format";
import { useGo, useOpenIssue, useOpenIssueId } from "@/lib/nav";
import { resolveTheme, usePrefs } from "@/lib/prefs";
import { isLegalTransition, STATUS_LABEL, STATUS_ORDER } from "@/lib/status";
import { copyText } from "./clipboard";
import { withMockControls } from "./mock-controls";
import { useShell } from "./shell-store";
import { useSelectGroup } from "./useSelectGroup";

const ICON = { size: 14, strokeWidth: 1.75 } as const;
const LIMIT = { issues: 8, groups: 5, library: 5, recent: 6 };

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
            : "Search issues, groups and library, or type a command…"
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

function rank<T>(
  items: T[],
  query: string,
  text: (t: T) => [string, string[]],
  limit: number,
): Ranked<T> {
  if (!query) return { items: [], best: 0 };
  const scored = items
    .map((item) => {
      const [value, keywords] = text(item);
      return { item, score: defaultFilter(value, query, keywords) };
    })
    .filter((r) => r.score >= MIN_SCORE)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
  return { items: scored.map((r) => r.item), best: scored[0]?.score ?? 0 };
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

  type SectionKey = "issues" | "groups" | "library" | "actions";
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
  // The section holding the best match comes first, so Enter runs what you typed.
  // Ties keep the default order. Without a query: recent issues, then actions.
  const order = (["issues", "groups", "library", "actions"] as const)
    .map((key, i) => ({
      key,
      i,
      best: { issues, groups, library, actions: matchedActions }[key].best,
    }))
    .sort((x, y) => y.best - x.best || x.i - y.i)
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
  const navCollapsed = usePrefs((s) => s.navCollapsed);
  const toggleNav = usePrefs((s) => s.toggleNav);
  const shell = useShell();

  const dark = resolveTheme(theme) === "dark";
  const actions: Action[] = [
    {
      id: "new-issue",
      label: "New issue…",
      icon: <Plus {...ICON} />,
      shortcut: "n",
      keywords: ["create", "add"],
      run: () => shell.setNewIssueOpen(true),
    },
    {
      id: "new-group",
      label: "New group…",
      icon: <FolderPlus {...ICON} />,
      keywords: ["create", "add", "folder"],
      run: () => shell.setNewGroupOpen(true),
    },
  ];

  if (openIssue) {
    actions.push(
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
      id: "go-inbox",
      label: "Workflow · Inbox",
      icon: <Inbox {...ICON} />,
      shortcut: "g i",
      keywords: ["go to inbox", "needs you", "requests"],
      run: () => go.inbox(),
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
      keywords: [
        "go to files",
        "open workspace files",
        "source",
        "markdown",
        "edit",
        "goal.md",
        "plan.md",
        "tree",
      ],
      run: () => void files.open(),
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
      run: () => withMockControls((c) => c.playNextEvent()),
    },
  );

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
