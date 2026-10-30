// The sub-view tabs of one view, as real links: Workflow (Board) and Workdatabase (Library ·
// Glossary · Files · Skills). Every page puts them at the left of its one 44 px top bar, after
// the view's name. The active tab follows the route, so the board, its drawer and the full issue
// page all count as Board. Underline style, like Tabs, so the page's own filters (pills,
// segmented controls) stay visually secondary.
import { Link } from "@tanstack/react-router";
import { Database, LayoutGrid, type LucideIcon } from "lucide-react";
import { allSkills, useGlossary, useSkills, useSnapshot, useWorkspaceFiles } from "@/lib/api";
import { cn } from "@/lib/cn";
import { usePathname } from "@/lib/nav";
import { LintBadge } from "./LintBadge";

export type WfView = "workflow" | "workdatabase";
export type WfSubView = "board" | "library" | "glossary" | "files" | "skills";

export interface ViewDef {
  label: string;
  icon: LucideIcon;
  /** The sub-view a click on the view itself opens. */
  home: WfSubView;
  subs: WfSubView[];
  /** The shortcut that opens `home`. */
  shortcut: string;
}

export interface SubViewDef {
  view: WfView;
  label: string;
  to: "/w" | "/lib" | "/glossary" | "/files" | "/skills";
  /** Two-key sequence, as `useHotkey` and `Kbd` take it. */
  shortcut: string;
}

/** Workspace > Workflow (work in motion) and Workdatabase (everything stored). */
export const VIEWS: Record<WfView, ViewDef> = {
  workflow: {
    label: "Workflow",
    icon: LayoutGrid,
    home: "board",
    subs: ["board"],
    shortcut: "g w",
  },
  workdatabase: {
    label: "Workdatabase",
    icon: Database,
    home: "library",
    subs: ["library", "glossary", "files", "skills"],
    shortcut: "g d",
  },
};

export const SUBVIEWS: Record<WfSubView, SubViewDef> = {
  board: { view: "workflow", label: "Board", to: "/w", shortcut: "g w" },
  library: { view: "workdatabase", label: "Library", to: "/lib", shortcut: "g l" },
  glossary: { view: "workdatabase", label: "Glossary", to: "/glossary", shortcut: "g g" },
  files: { view: "workdatabase", label: "Files", to: "/files", shortcut: "g f" },
  skills: { view: "workdatabase", label: "Skills", to: "/skills", shortcut: "g s" },
};

/**
 * Which sub-view a pathname belongs to. The board, its drawer and `/i/$id` are all Board. `/inbox`
 * is gone: the router redirects it to the board's Needs you filter before anything renders.
 */
export function subViewForPath(path: string): WfSubView | undefined {
  if (path === "/w" || path.startsWith("/w/") || path.startsWith("/i/")) return "board";
  if (path === "/lib" || path.startsWith("/lib/")) return "library";
  if (path === "/glossary" || path.startsWith("/glossary/")) return "glossary";
  if (path === "/files" || path.startsWith("/files/")) return "files";
  if (path === "/skills" || path.startsWith("/skills/")) return "skills";
  return undefined;
}

/** The sub-view the current route is in, or none (Kit, unknown routes). */
export function useActiveSubView(): WfSubView | undefined {
  return subViewForPath(usePathname());
}

export interface ViewCounts {
  /** Library items (every status). */
  library?: number;
  /** Glossary terms. */
  glossary?: number;
  /** Workdatabase · Files. */
  files?: number;
  /** Skills across the repository's plugins. */
  skills?: number;
  /** Errors across all workspace files (a lint dot shows when above zero). */
  fileErrors: number;
}

/** The counts shown after the tabs and in the nav. Undefined while a list is still loading. */
export function useViewCounts(): ViewCounts {
  const library = useSnapshot().data?.library.length;
  const glossary = useGlossary().data?.length;
  const files = useWorkspaceFiles().data;
  const catalog = useSkills().data;
  return {
    library,
    glossary,
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
const COUNT_NOUN: Record<Exclude<WfSubView, "board">, string> = {
  library: " items",
  glossary: " terms",
  files: " files",
  skills: " skills",
};

function TabCount({ sub, counts }: { sub: WfSubView; counts: ViewCounts }) {
  if (sub === "board") return null;
  const n = counts[sub];
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
