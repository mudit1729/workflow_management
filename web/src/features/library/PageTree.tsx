// The page tree of a library: folders are sections, files are pages. A navigation list with
// disclosure buttons on the sections; every row is a link. Keyboard: Tab as usual, and also Up
// and Down between rows, Right opens a section, Left closes it (or goes to its parent).
import { ChevronRight } from "lucide-react";
import { type KeyboardEvent, useEffect, useRef, useState } from "react";
import type { LibraryInfo, LibraryTree, LibraryTreeNode } from "@/lib/api/types";
import { cn } from "@/lib/cn";
import { libraryHref, useOpenPage } from "@/lib/nav";
import { githubFile } from "./address";
import { foldersOf } from "./tree-paths";

export interface PageTreeProps {
  library: LibraryInfo;
  tree: LibraryTree;
  /** Root-relative path of the open page; "" when the library's home is open. */
  current: string;
  /** After a page was chosen (the sheet closes). */
  onOpen?: () => void;
  className?: string;
}

/** The row that stands for the open page: a section's own page is its section. */
function ownerRow(tree: LibraryTree, path: string): string {
  if (path === "" || path === tree.home) return "";
  const walk = (nodes: LibraryTreeNode[]): string | undefined => {
    for (const n of nodes) {
      if (n.type === "page" && n.path === path) return n.path;
      if (n.type === "section") {
        if (n.page === path) return n.path;
        const hit = walk(n.children ?? []);
        if (hit) return hit;
      }
    }
    return undefined;
  };
  return walk(tree.root.children ?? []) ?? path;
}

export function PageTree({ library, tree, current, onOpen, className }: PageTreeProps) {
  const open = useOpenPage();
  const root = useRef<HTMLElement>(null);
  const active = ownerRow(tree, current);
  // What the person opened or closed by hand. A section on the way to the open page is open
  // unless it was closed by hand; choosing a page clears that for the sections around it.
  const [toggled, setToggled] = useState<Record<string, boolean>>({});
  useEffect(() => {
    const around = new Set([...foldersOf(current), current]);
    setToggled((t) => {
      const keep = Object.entries(t).filter(([p]) => !around.has(p));
      return keep.length === Object.keys(t).length ? t : Object.fromEntries(keep);
    });
  }, [current]);
  // A folder opened as a page of its own (an overview) is open too.
  const onPath = new Set([...foldersOf(current), current]);
  const isOpen = (path: string) => toggled[path] ?? onPath.has(path);
  const toggle = (path: string) => setToggled((t) => ({ ...t, [path]: !isOpen(path) }));

  const go = (path: string) => {
    open({ alias: library.alias, path });
    onOpen?.();
  };

  const rows = () => [...(root.current?.querySelectorAll<HTMLElement>("[data-tree-row]") ?? [])];

  function onKeyDown(e: KeyboardEvent<HTMLElement>) {
    const row = (e.target as HTMLElement).closest<HTMLElement>("[data-tree-row]");
    if (!row) return;
    const all = rows();
    const at = all.indexOf(row);
    const focus = (el?: HTMLElement) => {
      if (!el) return;
      e.preventDefault();
      el.focus();
    };
    const section = row.dataset.section;
    const level = Number(row.dataset.level);
    switch (e.key) {
      case "ArrowDown":
        return focus(all[at + 1]);
      case "ArrowUp":
        return focus(all[at - 1]);
      case "Home":
        return focus(all[0]);
      case "End":
        return focus(all.at(-1));
      case "ArrowRight":
        if (section && !isOpen(section)) {
          e.preventDefault();
          toggle(section);
        } else if (section) focus(all[at + 1]);
        return;
      case "ArrowLeft":
        if (section && isOpen(section)) {
          e.preventDefault();
          toggle(section);
        } else {
          // The nearest row above with a lower level is the parent.
          const parent = all
            .slice(0, at)
            .reverse()
            .find((r) => Number(r.dataset.level) < level);
          focus(parent);
        }
        return;
    }
  }

  const renderNode = (n: LibraryTreeNode, level: number): React.ReactNode => {
    if (n.type === "page") {
      const here = active === n.path;
      return (
        <li key={`p:${n.path}`}>
          <Row
            href={libraryHref(library.alias, n.path)}
            level={level}
            here={here}
            onClick={() => go(n.path)}
          >
            {n.title}
          </Row>
        </li>
      );
    }
    const expanded = isOpen(n.path);
    const here = active === n.path;
    return (
      <li key={`s:${n.path}`}>
        <Row
          href={libraryHref(library.alias, n.page ?? n.path)}
          level={level}
          here={here}
          section={n.path}
          expanded={expanded}
          count={n.count}
          onToggle={() => toggle(n.path)}
          onClick={() => {
            if (!expanded) setToggled((t) => ({ ...t, [n.path]: true }));
            go(n.page ?? n.path);
          }}
        >
          {n.title}
        </Row>
        {expanded && (
          <ul className="m-0 list-none p-0">
            {(n.children ?? []).map((c) => renderNode(c, level + 1))}
          </ul>
        )}
      </li>
    );
  };

  const home = active === "";
  return (
    <nav
      ref={root}
      data-wf="PageTree"
      aria-label={`Pages of ${library.name}`}
      onKeyDown={onKeyDown}
      className={cn("flex min-h-0 flex-col", className)}
    >
      <ul className="m-0 flex list-none flex-col gap-px p-0">
        <li>
          <Row
            href={libraryHref(library.alias)}
            level={0}
            here={home}
            onClick={() => go("")}
            strong
          >
            {library.kind === "personal" ? "Home" : "Overview"}
          </Row>
        </li>
        {(tree.root.children ?? []).map((n) => renderNode(n, 0))}
      </ul>
      {tree.others.length > 0 && (
        <details className="mt-3 border-border border-t px-2 pt-2 text-fg-faint text-xs">
          <summary className="cursor-default select-none py-1">
            Other files · {tree.others.length}
          </summary>
          <ul className="m-0 mt-1 list-none p-0 font-mono">
            {tree.others.map((f) => {
              const href = githubFile(library, f);
              return (
                <li key={f} className="truncate py-0.5" title={href ? `Open ${f} on GitHub` : f}>
                  {href ? (
                    <a
                      href={href}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="hover:text-fg-muted"
                    >
                      {f}
                    </a>
                  ) : (
                    f
                  )}
                </li>
              );
            })}
          </ul>
        </details>
      )}
    </nav>
  );
}

interface RowProps {
  href: string;
  level: number;
  here: boolean;
  children: React.ReactNode;
  onClick: () => void;
  /** A section's folder path; the row has a chevron. */
  section?: string;
  expanded?: boolean;
  count?: number;
  onToggle?: () => void;
  strong?: boolean;
}

function Row({
  href,
  level,
  here,
  children,
  onClick,
  section,
  expanded,
  count,
  onToggle,
  strong,
}: RowProps) {
  return (
    <div
      className={cn(
        "group/row flex h-7 items-center rounded-md pr-1.5 transition-colors duration-100 ease-wf",
        here ? "bg-muted text-fg" : "text-fg-muted hover:bg-muted/70 hover:text-fg",
      )}
      style={{ paddingLeft: 4 + level * 12 }}
    >
      {section !== undefined ? (
        <button
          type="button"
          aria-label={expanded ? "Close the section" : "Open the section"}
          aria-expanded={expanded}
          onClick={onToggle}
          className="flex size-5 shrink-0 items-center justify-center rounded-sm text-fg-faint hover:text-fg"
        >
          <ChevronRight
            aria-hidden
            size={12}
            strokeWidth={2}
            className={cn(
              "transition-transform duration-100 motion-reduce:transition-none",
              expanded && "rotate-90",
            )}
          />
        </button>
      ) : (
        <span aria-hidden className="size-5 shrink-0" />
      )}
      <a
        href={href}
        data-tree-row=""
        data-section={section}
        data-level={level}
        aria-current={here ? "page" : undefined}
        onClick={(e) => {
          if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
          e.preventDefault();
          onClick();
        }}
        className={cn(
          "min-w-0 flex-1 truncate rounded-sm py-1 pl-1 text-base outline-none focus-visible:ring-2 focus-visible:ring-focus",
          (here || strong) && "font-medium",
        )}
      >
        {children}
      </a>
      {count !== undefined && (
        <span className="tabular ml-1 shrink-0 text-fg-faint text-xs">{count}</span>
      )}
    </div>
  );
}
