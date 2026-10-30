// "Pick pages…": a tree of every library with a checkbox on each page and on each folder, for a
// group of documents. A folder's box is on when all its pages are, and half on when some are.
// Pages a library chip already covers show as on and cannot be unpicked here: turn the chip off.
import { ChevronRight } from "lucide-react";
import { useState } from "react";
import { Checkbox } from "@/components/ui";
import { estimateTokens } from "@/features/context/links";
import { tokenCount } from "@/features/issue/handoff";
import { useLibraryTree } from "@/lib/api";
import type { LibraryInfo, LibraryTreeNode } from "@/lib/api/types";
import { cn } from "@/lib/cn";
import { libraryLabel } from "./ScopeChips";
import { pageOf, type ScopeFacts, type Selection } from "./scope";

/** Every page address under a node, a section's own page first. */
export function pagesUnder(alias: string, node: LibraryTreeNode): string[] {
  const out: string[] = [];
  const walk = (n: LibraryTreeNode) => {
    if (n.type === "page") out.push(`${alias}:${n.path}`);
    else if (n.page) out.push(`${alias}:${n.page}`);
    for (const c of n.children ?? []) walk(c);
  };
  walk(node);
  return out;
}

type Check = boolean | "indeterminate";

function stateOf(pages: string[], on: Set<string>): Check {
  const n = pages.filter((p) => on.has(p)).length;
  return n === 0 ? false : n === pages.length ? true : "indeterminate";
}

interface PickerProps {
  libraries: LibraryInfo[];
  facts: ScopeFacts;
  selection: Selection;
  onChange: (next: Selection) => void;
}

export function PagePicker({ libraries, facts, selection, onChange }: PickerProps) {
  const picked = new Set(selection.pages.map(pageOf));
  const covered = new Set(selection.libraries.flatMap((a) => facts.byLibrary.get(a) ?? []));
  const on = new Set([...picked, ...covered]);

  const set = (pages: string[], value: boolean) => {
    const rest = selection.pages.filter((p) => !pages.includes(pageOf(p)));
    onChange({
      ...selection,
      pages: value ? [...rest, ...pages.filter((p) => !covered.has(p))] : rest,
    });
  };

  return (
    <fieldset
      data-wf="PagePicker"
      aria-label="Pick pages"
      className="m-0 flex max-h-64 min-w-0 flex-col overflow-y-auto rounded-md border border-border bg-subtle p-1"
    >
      {libraries.map((l) => (
        <LibraryNode key={l.alias} library={l} facts={facts} on={on} covered={covered} set={set} />
      ))}
    </fieldset>
  );
}

interface NodeProps {
  facts: ScopeFacts;
  on: Set<string>;
  covered: Set<string>;
  set: (pages: string[], value: boolean) => void;
}

function Row({
  level,
  open,
  onToggleOpen,
  state,
  disabled,
  onCheck,
  label,
  hint,
  title,
  strong,
}: {
  level: number;
  /** Set for a folder: its disclosure. */
  open?: boolean;
  onToggleOpen?: () => void;
  state: Check;
  disabled?: boolean;
  onCheck: (value: boolean) => void;
  label: string;
  hint?: string;
  title?: string;
  strong?: boolean;
}) {
  return (
    <div
      title={title}
      style={{ paddingLeft: 4 + level * 14 }}
      className="flex h-7 min-w-0 items-center gap-1.5 rounded-sm pr-2 hover:bg-muted"
    >
      {onToggleOpen ? (
        <button
          type="button"
          aria-label={`${open ? "Close" : "Open"} ${label}`}
          aria-expanded={open}
          onClick={onToggleOpen}
          className="flex size-5 shrink-0 cursor-default items-center justify-center rounded-sm text-fg-faint hover:bg-border hover:text-fg"
        >
          <ChevronRight
            aria-hidden
            size={12}
            strokeWidth={1.75}
            className={cn("transition-transform duration-150 ease-wf", open && "rotate-90")}
          />
        </button>
      ) : (
        <span aria-hidden className="size-5 shrink-0" />
      )}
      <Checkbox
        checked={state}
        disabled={disabled}
        aria-label={label}
        onCheckedChange={() => onCheck(state !== true)}
      />
      <span
        className={cn(
          "min-w-0 flex-1 truncate text-base",
          strong ? "font-medium text-fg" : "text-fg",
        )}
      >
        {label}
      </span>
      {hint && <span className="tabular shrink-0 text-fg-faint text-xs">{hint}</span>}
    </div>
  );
}

const hintOf = (chars: number | undefined) =>
  chars ? `${tokenCount(estimateTokens(chars))}` : undefined;

function LibraryNode({ library, facts, on, covered, set }: NodeProps & { library: LibraryInfo }) {
  const [open, setOpen] = useState(false);
  const tree = useLibraryTree(open ? library.alias : undefined).data;
  const all = facts.byLibrary.get(library.alias) ?? [];
  const whole = covered.size > 0 && all.length > 0 && all.every((p) => covered.has(p));
  return (
    <>
      <Row
        level={0}
        open={open}
        onToggleOpen={() => setOpen((o) => !o)}
        state={stateOf(all, on)}
        disabled={whole}
        title={whole ? "The library chip is on" : undefined}
        onCheck={(v) => set(all, v)}
        label={libraryLabel(library)}
        hint={`${library.pages} pages`}
        strong
      />
      {open &&
        (tree ? (
          <Children
            alias={library.alias}
            nodes={tree.root.children ?? []}
            level={1}
            facts={facts}
            on={on}
            covered={covered}
            set={set}
            home={tree.home}
          />
        ) : (
          <p className="m-0 h-7 pl-9 text-fg-faint text-sm leading-7">Reading…</p>
        ))}
    </>
  );
}

function Children({
  alias,
  nodes,
  level,
  home,
  ...rest
}: NodeProps & { alias: string; nodes: LibraryTreeNode[]; level: number; home?: string | null }) {
  return (
    <>
      {home && (
        <PageRow
          alias={alias}
          path={home}
          title="Home"
          chars={rest.facts.pages.get(`${alias}:${home}`)?.chars}
          level={level}
          {...rest}
        />
      )}
      {nodes.map((n) =>
        n.type === "page" ? (
          <PageRow
            key={n.path}
            alias={alias}
            path={n.path}
            title={n.title}
            chars={n.chars}
            level={level}
            {...rest}
          />
        ) : (
          <SectionNode key={n.path} alias={alias} node={n} level={level} {...rest} />
        ),
      )}
    </>
  );
}

function PageRow({
  alias,
  path,
  title,
  chars,
  level,
  on,
  covered,
  set,
}: NodeProps & { alias: string; path: string; title: string; chars?: number; level: number }) {
  const address = `${alias}:${path}`;
  return (
    <Row
      level={level}
      state={on.has(address)}
      disabled={covered.has(address)}
      title={covered.has(address) ? "The library chip is on" : undefined}
      onCheck={(v) => set([address], v)}
      label={title}
      hint={hintOf(chars)}
    />
  );
}

function SectionNode({
  alias,
  node,
  level,
  ...rest
}: NodeProps & { alias: string; node: LibraryTreeNode; level: number }) {
  const [open, setOpen] = useState(false);
  const pages = pagesUnder(alias, node);
  const whole = pages.length > 0 && pages.every((p) => rest.covered.has(p));
  return (
    <>
      <Row
        level={level}
        open={open}
        onToggleOpen={() => setOpen((o) => !o)}
        state={stateOf(pages, rest.on)}
        disabled={whole}
        title={whole ? "The library chip is on" : undefined}
        onCheck={(v) => rest.set(pages, v)}
        label={node.title}
        hint={hintOf(node.chars)}
      />
      {open && (
        <>
          {node.page && (
            <PageRow
              alias={alias}
              path={node.page}
              title={`${node.title} overview`}
              level={level + 1}
              {...rest}
            />
          )}
          <Children alias={alias} nodes={node.children ?? []} level={level + 1} {...rest} />
        </>
      )}
    </>
  );
}
