// The left pane of /files: every file in the workspace as a tree. Issue folders show the
// issue's status and title, group folders their color, and any file with findings a dot. The
// keyboard model is GroupTree's: one tab stop, arrows walk the rows, Right and Left open and
// close folders.
import { FilePlus } from "lucide-react";
import { type KeyboardEvent, useEffect, useMemo, useRef, useState } from "react";
import { EmptyState } from "@/components/common";
import { Button, SearchInput, Skeleton } from "@/components/ui";
import { useWorkspaceFiles } from "@/lib/api";
import { cn } from "@/lib/cn";
import { useTreeContext } from "./context";
import { FileRow, FolderRow } from "./FileRow";
import { buildTree, defaultOpen, filterTree, flattenTree, revealPaths, type TreeRow } from "./tree";

export interface WorkspaceTreeProps {
  selectedPath?: string;
  onSelect: (path: string) => void;
  onNewFile?: () => void;
  className?: string;
}

export function WorkspaceTree({
  selectedPath,
  onSelect,
  onNewFile,
  className,
}: WorkspaceTreeProps) {
  const files = useWorkspaceFiles();
  const ctx = useTreeContext();
  const [filter, setFilter] = useState("");
  const [toggles, setToggles] = useState<ReadonlyMap<string, boolean>>(new Map());
  const [focused, setFocused] = useState<string | null>(null);
  const refs = useRef(new Map<string, HTMLDivElement>());
  const scrolledTo = useRef<string | undefined>(undefined);
  const filtering = filter.trim() !== "";

  const tree = useMemo(
    () => (files.data && ctx ? buildTree(files.data, ctx) : undefined),
    [files.data, ctx],
  );
  const visible = useMemo(() => (tree ? filterTree(tree, filter) : []), [tree, filter]);
  const rows = useMemo<TreeRow[]>(
    () =>
      flattenTree(visible, (folder, inside) =>
        filtering ? true : (toggles.get(folder.path) ?? defaultOpen(folder, inside)),
      ),
    [visible, toggles, filtering],
  );

  // Open the folders above the selected file, once, when the selection changes.
  useEffect(() => {
    if (!selectedPath) return;
    setToggles((prev) => {
      const missing = revealPaths(selectedPath).filter((p) => prev.get(p) !== true);
      // Only open what is closed by default or was closed by the user; skip when all are open.
      if (missing.length === 0) return prev;
      const next = new Map(prev);
      for (const p of missing) next.set(p, true);
      return next;
    });
    scrolledTo.current = undefined;
  }, [selectedPath]);

  // Bring the selected row into view once it exists. `rows` is a dependency on purpose: the row
  // only mounts after the folders above it open.
  // biome-ignore lint/correctness/useExhaustiveDependencies: see above
  useEffect(() => {
    if (!selectedPath || scrolledTo.current === selectedPath) return;
    const el = refs.current.get(selectedPath);
    if (!el) return;
    scrolledTo.current = selectedPath;
    el.scrollIntoView({ block: "nearest" });
  }, [selectedPath, rows]);

  const tabStop =
    (focused && rows.some((r) => r.node.path === focused) && focused) ||
    (selectedPath && rows.some((r) => r.node.path === selectedPath) && selectedPath) ||
    rows[0]?.node.path;

  const setOpen = (path: string, open: boolean) =>
    setToggles((prev) => new Map(prev).set(path, open));

  const focusRow = (path: string) => {
    setFocused(path);
    refs.current.get(path)?.focus();
  };

  function onKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    const index = rows.findIndex((r) => r.node.path === tabStop);
    const row = rows[index];
    if (!row) return;
    const folder = row.node.type === "folder" ? row.node : undefined;
    let handled = true;
    switch (e.key) {
      case "ArrowDown":
        if (index < rows.length - 1) focusRow(rows[index + 1].node.path);
        break;
      case "ArrowUp":
        if (index > 0) focusRow(rows[index - 1].node.path);
        break;
      case "Home":
        focusRow(rows[0].node.path);
        break;
      case "End":
        focusRow(rows[rows.length - 1].node.path);
        break;
      case "ArrowRight":
        if (!folder) break;
        if (!row.open) setOpen(folder.path, true);
        else if (rows[index + 1]) focusRow(rows[index + 1].node.path);
        break;
      case "ArrowLeft":
        if (folder && row.open && !filtering) setOpen(folder.path, false);
        else if (row.parent) focusRow(row.parent);
        break;
      case "Enter":
      case " ":
        if (folder) {
          if (!filtering) setOpen(folder.path, !row.open);
        } else onSelect(row.node.path);
        break;
      default:
        handled = false;
    }
    if (handled) {
      e.preventDefault();
      e.stopPropagation();
    }
  }

  const total = files.data?.length ?? 0;
  const withFindings = files.data?.filter((f) => f.errors + f.warnings + f.infos > 0).length ?? 0;

  return (
    <div data-wf="WorkspaceTree" className={cn("flex h-full min-h-0 flex-col", className)}>
      <div className="shrink-0 p-2">
        <SearchInput
          value={filter}
          onChange={setFilter}
          placeholder="Filter files"
          shortcut="/"
          onKeyDown={(e) => {
            if (e.key === "ArrowDown" && tabStop) {
              e.preventDefault();
              focusRow(tabStop);
            }
          }}
        />
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden px-2 pb-2">
        {files.isPending || (files.data && !ctx) ? (
          <TreeSkeleton />
        ) : files.isError && !files.data ? (
          <EmptyState
            compact
            title="Could not load the files"
            hint="The server did not answer. Your files are safe."
            action={
              <Button variant="secondary" size="sm" onClick={() => void files.refetch()}>
                Try again
              </Button>
            }
          />
        ) : total === 0 ? (
          <EmptyState
            compact
            icon={<FilePlus strokeWidth={1.75} />}
            title="No files yet"
            hint="A folder with a goal.md becomes an issue on the board."
            action={
              onNewFile && (
                <Button variant="secondary" size="sm" onClick={onNewFile}>
                  New file
                </Button>
              )
            }
          />
        ) : rows.length === 0 ? (
          <EmptyState
            compact
            title={`No files match “${filter.trim()}”`}
            hint="Try a file name, an issue title or an issue id."
            action={
              <Button variant="ghost" size="sm" onClick={() => setFilter("")}>
                Clear filter
              </Button>
            }
          />
        ) : (
          <div
            role="tree"
            aria-label="Workdatabase files"
            onKeyDown={onKeyDown}
            className="flex flex-col gap-px"
          >
            {rows.map((row) => {
              const common = {
                depth: row.depth,
                posinset: row.posinset,
                setsize: row.setsize,
                tabbable: row.node.path === tabStop,
                rowRef: (el: HTMLDivElement | null) => {
                  if (el) refs.current.set(row.node.path, el);
                  else refs.current.delete(row.node.path);
                },
                onFocus: () => setFocused(row.node.path),
              };
              return row.node.type === "file" ? (
                <FileRow
                  key={row.node.path}
                  node={row.node}
                  selected={row.node.path === selectedPath}
                  onSelect={() => onSelect(row.node.path)}
                  {...common}
                />
              ) : (
                <FolderRow
                  key={row.node.path}
                  node={row.node}
                  selected={false}
                  open={row.open}
                  onToggle={() => !filtering && setOpen(row.node.path, !row.open)}
                  {...common}
                />
              );
            })}
          </div>
        )}
      </div>

      {total > 0 && (
        <p className="tabular flex h-7 shrink-0 items-center border-border border-t px-3 text-fg-faint text-xs">
          {total} {total === 1 ? "file" : "files"}
          {withFindings > 0 && ` · ${withFindings} with findings`}
        </p>
      )}
    </div>
  );
}

function TreeSkeleton() {
  const rows = [
    [0, 44],
    [1, 56],
    [2, 62],
    [2, 48],
    [3, 70],
    [3, 52],
    [1, 40],
    [2, 58],
    [0, 36],
    [1, 50],
  ];
  return (
    <div
      role="status"
      aria-busy="true"
      aria-label="Loading files"
      className="flex flex-col gap-2.5 px-2 py-2"
    >
      {rows.map(([depth, w], i) => (
        <Skeleton key={i} className="h-3" style={{ width: `${w}%`, marginLeft: depth * 12 }} />
      ))}
    </div>
  );
}
