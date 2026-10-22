// The group tree in the nav: selects a subtree of the board (`?group=`).
// A flat list of treeitems with aria-level/setsize/posinset, so each row gets
// its own focus ring. Roving tabindex; arrows move, Right/Left expand/collapse.
import { ChevronRight, Layers } from "lucide-react";
import { type KeyboardEvent, useEffect, useMemo, useRef, useState } from "react";
import { EmptyState } from "@/components/common";
import { Button, Skeleton, Tooltip } from "@/components/ui";
import type { GroupId, GroupNode, GroupRollup, IssueStatus } from "@/gen/types";
import { useGroupTree, useSnapshot } from "@/lib/api";
import { cn } from "@/lib/cn";
import { useBoardSearch, usePathname } from "@/lib/nav";
import { STATUS_LABEL, STATUS_ORDER, statusColor } from "@/lib/status";
import { useSelectGroup } from "./useSelectGroup";

interface Row {
  node: GroupNode;
  depth: number;
  parent?: GroupId;
  isRoot: boolean;
  posinset: number;
  setsize: number;
}

const byOrder = (a: GroupNode, b: GroupNode) => a.order - b.order || a.title.localeCompare(b.title);

/** Top two levels open: the root's children show their own children. */
function defaultExpanded(root: GroupNode): Set<GroupId> {
  return new Set(root.children.map((c) => c.id));
}

function parentMap(root: GroupNode): Map<GroupId, GroupId> {
  const map = new Map<GroupId, GroupId>();
  const walk = (n: GroupNode) => {
    for (const c of n.children) {
      map.set(c.id, n.id);
      walk(c);
    }
  };
  walk(root);
  return map;
}

function visibleRows(root: GroupNode, expanded: Set<GroupId>): Row[] {
  const rows: Row[] = [];
  const top = [...root.children].sort(byOrder);
  // "All issues" (the root) and the top-level groups are siblings at level 1.
  rows.push({ node: root, depth: 0, isRoot: true, posinset: 1, setsize: top.length + 1 });
  const walk = (nodes: GroupNode[], depth: number, parent: GroupId, offset: number) => {
    nodes.forEach((node, i) => {
      rows.push({
        node,
        depth,
        parent,
        isRoot: false,
        posinset: i + 1 + offset,
        setsize: nodes.length + offset,
      });
      if (node.children.length > 0 && expanded.has(node.id)) {
        walk([...node.children].sort(byOrder), depth + 1, node.id, 0);
      }
    });
  };
  walk(top, 0, root.id, 1);
  return rows;
}

export interface GroupTreeProps {
  /** Rail mode: color dots only, titles in tooltips. */
  collapsed?: boolean;
  /** Called after a group is selected (the mobile sheet closes itself). */
  onSelect?: () => void;
}

export function GroupTree({ collapsed = false, onSelect }: GroupTreeProps) {
  const root = useGroupTree();
  const snapshot = useSnapshot();

  if (!root) {
    if (snapshot.isError) {
      return (
        <div data-wf="GroupTree" className="flex flex-col items-start gap-1 px-3 py-2">
          {!collapsed && <p className="text-fg-faint text-sm">Groups did not load.</p>}
          <Button variant="ghost" size="sm" onClick={() => snapshot.refetch()}>
            Retry
          </Button>
        </div>
      );
    }
    return (
      <div
        data-wf="GroupTree"
        role="status"
        aria-busy="true"
        aria-label="Loading groups"
        className={cn("flex flex-col gap-2 py-1.5", collapsed ? "items-center" : "px-3")}
      >
        {[72, 56, 64, 48].map((w) =>
          collapsed ? (
            <Skeleton key={w} className="size-2 rounded-full" />
          ) : (
            <Skeleton key={w} className="h-3" style={{ width: `${w}%` }} />
          ),
        )}
      </div>
    );
  }

  return <GroupTreeLoaded root={root} collapsed={collapsed} onSelect={onSelect} />;
}

function GroupTreeLoaded({
  root,
  collapsed,
  onSelect,
}: {
  root: GroupNode;
  collapsed: boolean;
  onSelect?: () => void;
}) {
  const path = usePathname();
  const [search] = useBoardSearch();
  const selectGroup = useSelectGroup();
  const parents = useMemo(() => parentMap(root), [root]);

  const onBoard = path.startsWith("/w");
  const selectedId: GroupId | undefined = onBoard
    ? search.group && search.group !== root.id
      ? search.group
      : root.id
    : undefined;

  const [expandedState, setExpanded] = useState<Set<GroupId> | null>(null);
  const expanded = useMemo(() => expandedState ?? defaultExpanded(root), [expandedState, root]);

  // Reveal the selected group when it is nested inside a collapsed parent.
  useEffect(() => {
    if (!selectedId) return;
    const chain: GroupId[] = [];
    for (let p = parents.get(selectedId); p && p !== root.id; p = parents.get(p)) chain.push(p);
    if (chain.length === 0) return;
    setExpanded((prev) => {
      const base = prev ?? defaultExpanded(root);
      if (chain.every((id) => base.has(id))) return prev;
      return new Set([...base, ...chain]);
    });
  }, [selectedId, parents, root]);

  const rows = useMemo(() => visibleRows(root, expanded), [root, expanded]);
  const [focusedId, setFocusedId] = useState<GroupId | null>(null);
  const refs = useRef(new Map<GroupId, HTMLDivElement>());

  const tabStop =
    (focusedId && rows.some((r) => r.node.id === focusedId) && focusedId) ||
    (selectedId && rows.some((r) => r.node.id === selectedId) && selectedId) ||
    root.id;

  function setOpen(id: GroupId, open: boolean) {
    setExpanded((prev) => {
      const next = new Set(prev ?? defaultExpanded(root));
      if (open) next.add(id);
      else next.delete(id);
      return next;
    });
  }

  function focusRow(id: GroupId) {
    setFocusedId(id);
    refs.current.get(id)?.focus();
  }

  function select(row: Row) {
    selectGroup(row.isRoot ? undefined : row.node.id);
    onSelect?.();
  }

  function onKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    const index = rows.findIndex((r) => r.node.id === tabStop);
    const row = rows[index];
    if (!row) return;
    const hasChildren = !row.isRoot && row.node.children.length > 0;
    const isOpen = expanded.has(row.node.id);
    let handled = true;
    switch (e.key) {
      case "ArrowDown":
        if (index < rows.length - 1) focusRow(rows[index + 1].node.id);
        break;
      case "ArrowUp":
        if (index > 0) focusRow(rows[index - 1].node.id);
        break;
      case "Home":
        focusRow(rows[0].node.id);
        break;
      case "End":
        focusRow(rows[rows.length - 1].node.id);
        break;
      case "ArrowRight":
        if (collapsed || !hasChildren) break;
        if (!isOpen) setOpen(row.node.id, true);
        else if (rows[index + 1]) focusRow(rows[index + 1].node.id);
        break;
      case "ArrowLeft":
        if (collapsed) break;
        if (hasChildren && isOpen) setOpen(row.node.id, false);
        else if (row.parent) focusRow(row.parent);
        break;
      case "Enter":
      case " ":
        select(row);
        break;
      default:
        handled = false;
    }
    if (handled) {
      e.preventDefault();
      e.stopPropagation();
    }
  }

  const onlyRoot = root.children.length === 0;

  return (
    <div data-wf="GroupTree" className="flex flex-col px-2">
      <div
        role="tree"
        aria-label="Groups"
        onKeyDown={onKeyDown}
        className={cn("flex flex-col gap-px", collapsed && "items-center")}
      >
        {rows.map((row) => (
          <GroupRow
            key={row.node.id}
            row={row}
            collapsed={collapsed}
            selected={row.node.id === selectedId}
            expanded={expanded.has(row.node.id)}
            tabbable={row.node.id === tabStop}
            rowRef={(el) => {
              if (el) refs.current.set(row.node.id, el);
              else refs.current.delete(row.node.id);
            }}
            onFocus={() => setFocusedId(row.node.id)}
            onSelect={() => select(row)}
            onToggle={() => setOpen(row.node.id, !expanded.has(row.node.id))}
          />
        ))}
      </div>
      {onlyRoot && !collapsed && (
        <div className="px-1 pt-2">
          <EmptyState compact title="No groups yet" command="wf new group <path>" />
        </div>
      )}
    </div>
  );
}

interface GroupRowProps {
  row: Row;
  collapsed: boolean;
  selected: boolean;
  expanded: boolean;
  tabbable: boolean;
  rowRef: (el: HTMLDivElement | null) => void;
  onFocus: () => void;
  onSelect: () => void;
  onToggle: () => void;
}

function GroupRow({
  row,
  collapsed,
  selected,
  expanded,
  tabbable,
  rowRef,
  onFocus,
  onSelect,
  onToggle,
}: GroupRowProps) {
  const { node, depth, isRoot } = row;
  const hasChildren = !isRoot && node.children.length > 0;
  const title = isRoot ? "All issues" : node.title;
  const { issues, needs_you, stale } = node.rollup;
  const signal = needs_you > 0 ? "needs_you" : stale > 0 ? "stale" : null;
  const signalText =
    signal === "needs_you" ? `${needs_you} need you` : signal === "stale" ? `${stale} stale` : "";
  const label = [title, `${issues} ${issues === 1 ? "issue" : "issues"}`, signalText]
    .filter(Boolean)
    .join(", ");

  const marker = isRoot ? (
    <Layers size={12} strokeWidth={1.75} className="text-fg-faint" aria-hidden />
  ) : (
    <span
      aria-hidden
      className="size-2 rounded-full"
      style={{ background: `var(--wf-hue-${node.color})` }}
    />
  );

  const common = {
    ref: rowRef,
    role: "treeitem",
    tabIndex: tabbable ? 0 : -1,
    "aria-level": isRoot ? 1 : depth + 1,
    "aria-posinset": row.posinset,
    "aria-setsize": row.setsize,
    "aria-selected": selected,
    "aria-expanded": hasChildren ? expanded : undefined,
    "aria-label": label,
    "data-group": node.id,
    onFocus,
    onClick: onSelect,
  } as const;

  if (collapsed) {
    return (
      <Tooltip
        side="right"
        content={
          <span className="flex items-center gap-2">
            <span className={cn(node.implicit && "italic")}>{title}</span>
            <span className="tabular opacity-60">{issues}</span>
            {signalText && <span className="opacity-60">· {signalText}</span>}
          </span>
        }
      >
        <div
          {...common}
          className={cn(
            "relative flex size-7 cursor-pointer items-center justify-center rounded-md transition-colors duration-100 ease-wf",
            selected ? "bg-muted" : "hover:bg-muted/70",
          )}
        >
          {marker}
          {signal && <SignalDot signal={signal} className="absolute top-1 right-1" />}
        </div>
      </Tooltip>
    );
  }

  return (
    <div
      {...common}
      className={cn(
        "group/row flex h-7 cursor-pointer select-none items-center gap-1.5 rounded-md pr-1.5 text-base transition-colors duration-100 ease-wf",
        selected ? "bg-muted text-fg" : "text-fg-muted hover:bg-muted/70 hover:text-fg",
      )}
      style={{ paddingLeft: 4 + depth * 12 }}
    >
      <span
        aria-hidden
        className={cn(
          "flex size-4 shrink-0 items-center justify-center rounded-sm text-fg-faint",
          hasChildren && "hover:bg-border/60 hover:text-fg",
        )}
        onClick={
          hasChildren
            ? (e) => {
                e.stopPropagation();
                onToggle();
              }
            : undefined
        }
      >
        {hasChildren && (
          <ChevronRight
            size={12}
            strokeWidth={2}
            className={cn("transition-transform duration-150 ease-wf", expanded && "rotate-90")}
          />
        )}
      </span>
      <span className="flex w-3 shrink-0 items-center justify-center">{marker}</span>
      <span
        className={cn(
          "min-w-0 flex-1 truncate",
          node.implicit && "text-fg-faint italic",
          isRoot && "text-fg",
        )}
      >
        {title}
      </span>
      {signal && <SignalDot signal={signal} />}
      <span className="tabular shrink-0 text-fg-faint text-xs">{issues}</span>
      <MiniBar rollup={node.rollup} />
    </div>
  );
}

function SignalDot({ signal, className }: { signal: "needs_you" | "stale"; className?: string }) {
  return (
    <span
      aria-hidden
      className={cn(
        "size-1.5 shrink-0 rounded-full",
        signal === "needs_you" ? "bg-needs-you" : "bg-stale",
        className,
      )}
    />
  );
}

const BAR_STATUSES: IssueStatus[] = STATUS_ORDER.filter((s) => s !== "cancelled");

/** 28 × 3 px bar: each segment is a status's share of the subtree. */
function MiniBar({ rollup }: { rollup: GroupRollup }) {
  const parts = BAR_STATUSES.map((s) => ({ status: s, n: rollup.by_status[s] ?? 0 })).filter(
    (p) => p.n > 0,
  );
  const total = parts.reduce((sum, p) => sum + p.n, 0);
  const summary =
    total === 0
      ? "No open or finished issues"
      : parts.map((p) => `${p.n} ${STATUS_LABEL[p.status].toLowerCase()}`).join(" · ");

  return (
    <Tooltip content={summary} side="right">
      <span
        aria-hidden
        className={cn(
          "flex h-[3px] w-[28px] shrink-0 gap-px overflow-hidden rounded-full",
          total === 0 && "bg-border",
        )}
      >
        {parts.map((p) => (
          <span
            key={p.status}
            className="h-full first:rounded-l-full last:rounded-r-full"
            style={{ width: `${(p.n / total) * 100}%`, background: statusColor(p.status) }}
          />
        ))}
      </span>
    </Tooltip>
  );
}
