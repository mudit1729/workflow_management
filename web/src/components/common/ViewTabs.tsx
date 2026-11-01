// The sub-view tabs of one view, as real links: Workflow (Board), Library (Personal · Team
// libraries · Files · Skills; the view's id is still `workdatabase`) and Settings (Skills flow ·
// Agent · Workspace; opened by the gear in the nav footer, so it has no row in the nav). Every page
// puts them at the left of its one 44 px top bar, after the view's name. The active tab follows
// the route, so the board, its drawer and the full issue page all count as Board. Underline
// style, like Tabs, so the page's own filters (pills, segmented controls) stay visually secondary.
import { Link } from "@tanstack/react-router";
import { BookOpen, LayoutGrid, type LucideIcon, Settings } from "lucide-react";
import { allSkills, useLibraries, useSkills, useWorkspaceFiles } from "@/lib/api";
import { cn } from "@/lib/cn";
import { usePathname } from "@/lib/nav";
import { LintBadge } from "./LintBadge";

export type WfView = "workflow" | "workdatabase" | "settings";
export type WfSubView =
  | "board"
  | "library"
  | "personal"
  | "team"
  | "files"
  | "skills"
  | "flow"
  | "agent"
  | "workspace";

export interface ViewDef {
  label: string;
  icon: LucideIcon;
  /** The sub-view a click on the view itself opens. */
  home: WfSubView;
  /** The tabs, in order. The home is one of them unless it is a page of its own (the Library home). */
  subs: WfSubView[];
  /** The shortcut that opens `home`. */
  shortcut: string;
}

export interface SubViewDef {
  view: WfView;
  label: string;
  to:
    | "/w"
    | "/lib"
    | "/lib/me"
    | "/lib/t"
    | "/files"
    | "/skills"
    | "/settings/flow"
    | "/settings/agent"
    | "/settings/workspace";
  /** Two-key sequence or chord, as `useHotkey` and `Kbd` take it. Not every tab has one. */
  shortcut?: string;
}

/** Workspace > Workflow (work in motion), Library (everything stored) and Settings (how the work runs). */
export const VIEWS: Record<WfView, ViewDef> = {
  workflow: {
    label: "Workflow",
    icon: LayoutGrid,
    home: "board",
    subs: ["board"],
    shortcut: "g w",
  },
  workdatabase: {
    label: "Library",
    icon: BookOpen,
    home: "library",
    subs: ["personal", "team", "files", "skills"],
    shortcut: "g l",
  },
  settings: {
    label: "Settings",
    icon: Settings,
    home: "flow",
    subs: ["flow", "agent", "workspace"],
    shortcut: "mod+,",
  },
};

export const SUBVIEWS: Record<WfSubView, SubViewDef> = {
  board: { view: "workflow", label: "Board", to: "/w", shortcut: "g w" },
  library: { view: "workdatabase", label: "Library", to: "/lib", shortcut: "g l" },
  personal: { view: "workdatabase", label: "Personal", to: "/lib/me", shortcut: "g p" },
  team: { view: "workdatabase", label: "Team libraries", to: "/lib/t", shortcut: "g t" },
  files: { view: "workdatabase", label: "Files", to: "/files", shortcut: "g f" },
  skills: { view: "workdatabase", label: "Skills", to: "/skills", shortcut: "g s" },
  flow: { view: "settings", label: "Skills flow", to: "/settings/flow", shortcut: "mod+," },
  agent: { view: "settings", label: "Agent", to: "/settings/agent" },
  workspace: { view: "settings", label: "Workspace", to: "/settings/workspace" },
};

/**
 * Which sub-view a pathname belongs to. The board, its drawer and `/i/$id` are all Board. `/inbox`
 * is gone: the router redirects it to the board's Needs you filter before anything renders.
 */
export function subViewForPath(path: string): WfSubView | undefined {
  if (path === "/w" || path.startsWith("/w/") || path.startsWith("/i/")) return "board";
  if (path === "/lib/me" || path.startsWith("/lib/me/")) return "personal";
  // The old /glossary lands on a page of the workspace library, which is a team library.
  if (path === "/lib/t" || path.startsWith("/lib/t/")) return "team";
  if (path === "/glossary" || path.startsWith("/glossary/")) return "team";
  if (path === "/lib" || path.startsWith("/lib/")) return "library";
  if (path === "/files" || path.startsWith("/files/")) return "files";
  if (path === "/skills" || path.startsWith("/skills/")) return "skills";
  // /settings itself redirects to /settings/flow; the editor of a skill copy is part of the flow.
  if (path === "/settings/flow" || path.startsWith("/settings/flow/")) return "flow";
  if (path === "/settings/agent" || path.startsWith("/settings/agent/")) return "agent";
  if (path === "/settings/workspace" || path.startsWith("/settings/workspace/")) return "workspace";
  return undefined;
}

/** The sub-view the current route is in, or none (Kit, unknown routes). */
export function useActiveSubView(): WfSubView | undefined {
  return subViewForPath(usePathname());
}

export interface ViewCounts {
  /** Pages of the personal library. */
  personal?: number;
  /** Team libraries, the workspace's included. */
  team?: number;
  /** Workdatabase · Files. */
  files?: number;
  /** Skills across the repository's plugins. */
  skills?: number;
  /** Errors across all workspace files (a lint dot shows when above zero). */
  fileErrors: number;
}

/** The counts shown after the tabs and in the nav. Undefined while a list is still loading. */
export function useViewCounts(): ViewCounts {
  const libraries = useLibraries().data;
  const files = useWorkspaceFiles().data;
  const catalog = useSkills().data;
  return {
    personal: libraries?.find((l) => l.kind === "personal")?.pages,
    team: libraries?.filter((l) => l.kind !== "personal").length,
    files: files?.length,
    skills: catalog ? allSkills(catalog).length : undefined,
    fileErrors: files?.reduce((n, f) => n + f.errors, 0) ?? 0,
  };
}

export interface ViewTabsProps {
  view: WfView;
  className?: string;
}

export function ViewTabs({ view, className }: ViewTabsProps) {
  const active = useActiveSubView();
  const counts = useViewCounts();
  const def = VIEWS[view];
  const Icon = def.icon;

  return (
    <nav
      data-wf="ViewTabs"
      aria-label={`${def.label} views`}
      className={cn("flex min-w-0 shrink-0 items-stretch self-stretch", className)}
    >
      {/* Room is tight beside a page's own controls: under 900 px the name gives way to the icon,
          under 420 px the icon goes too, and the tabs keep their room. */}
      <span className="flex items-center gap-1.5 pr-1 font-semibold text-base text-fg max-[420px]:hidden">
        <Icon size={14} strokeWidth={1.75} aria-hidden className="shrink-0 text-fg-muted" />
        <span className="max-[900px]:sr-only">{def.label}</span>
      </span>
      <span aria-hidden className="mx-2 my-auto h-4 w-px shrink-0 bg-border max-[420px]:hidden" />
      <ul className="m-0 flex list-none items-stretch gap-3.5 p-0">
        {def.subs.map((sub) => (
          <li key={sub} className="flex">
            <ViewTab sub={sub} current={active === sub} counts={counts} />
          </li>
        ))}
      </ul>
    </nav>
  );
}

function ViewTab({
  sub,
  current,
  counts,
}: {
  sub: WfSubView;
  current: boolean;
  counts: ViewCounts;
}) {
  const def = SUBVIEWS[sub];
  return (
    <Link
      to={def.to}
      aria-current={current ? "page" : undefined}
      className={cn(
        "relative -mb-px inline-flex cursor-default select-none items-center gap-1.5 whitespace-nowrap rounded-t-sm border-transparent border-b-2 px-0.5",
        "font-medium text-base text-fg-muted transition-colors duration-100 ease-wf",
        "hover:text-fg aria-[current=page]:border-fg aria-[current=page]:text-fg",
      )}
    >
      {def.label}
      <TabCount sub={sub} counts={counts} />
    </Link>
  );
}

/** What a sub-view's count counts, for a screen reader. */
const COUNT_NOUN: Partial<Record<WfSubView, string>> = {
  personal: " pages",
  team: " libraries",
  files: " files",
  skills: " skills",
};

function TabCount({ sub, counts }: { sub: WfSubView; counts: ViewCounts }) {
  if (!(sub in COUNT_NOUN)) return null;
  const n = counts[sub as "personal" | "team" | "files" | "skills"];
  if (n === undefined) return null;
  return (
    <>
      <span className="tabular font-normal text-fg-faint text-sm">
        {n}
        <span className="sr-only">{COUNT_NOUN[sub]}</span>
      </span>
      {sub === "files" && counts.fileErrors > 0 && (
        <LintBadge counts={{ error: counts.fileErrors, warn: 0, info: 0 }} variant="dot" />
      )}
    </>
  );
}
