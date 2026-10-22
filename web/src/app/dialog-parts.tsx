// Pieces shared by the New issue and New group dialogs: the group picker, a labelled
// field row, and slug rules (the folder name that becomes part of a path in the workspace).
import { ChevronDown, Layers } from "lucide-react";
import type { ReactNode } from "react";
import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui";
import type { GroupId, GroupNode } from "@/gen/types";
import { cn } from "@/lib/cn";

export const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
export const SLUG_MAX = 48;

/** "Show lease expiry on cards!" → "show-lease-expiry-on-cards", cut at a word boundary. */
export function slugify(title: string): string {
  const slug = title
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  if (slug.length <= SLUG_MAX) return slug;
  const cut = slug.slice(0, SLUG_MAX);
  const lastDash = cut.lastIndexOf("-");
  return lastDash > 16 ? cut.slice(0, lastDash) : cut;
}

export interface GroupOption {
  node: GroupNode;
  depth: number;
  /** Titles from the top-level group down; empty for the root. */
  titles: string[];
}

/** The root first, then every group in tree order with its depth. */
export function flattenGroupOptions(root: GroupNode): GroupOption[] {
  const out: GroupOption[] = [{ node: root, depth: 0, titles: [] }];
  const walk = (nodes: GroupNode[], depth: number, titles: string[]) => {
    for (const node of [...nodes].sort((a, b) => a.order - b.order)) {
      const path = [...titles, node.title];
      out.push({ node, depth, titles: path });
      walk(node.children, depth + 1, path);
    }
  };
  walk(root.children, 1, []);
  return out;
}

/** The first candidate that is a real group in `options`. */
export function pickGroup(
  options: GroupOption[],
  candidates: (GroupId | undefined)[],
): GroupId | undefined {
  const ids = new Set(options.map((o) => o.node.id));
  return candidates.find((id): id is GroupId => !!id && ids.has(id));
}

/** "wf / web", or "Issues (top level)" for the root. */
export function optionLabel(o: GroupOption): string {
  return o.depth === 0 ? `${o.node.title} (top level)` : o.titles.join(" / ");
}

export function GroupDot({ node, root = false }: { node: GroupNode; root?: boolean }) {
  // The root has no identity color: it is the top of the tree, not a group.
  if (root)
    return (
      <Layers
        data-wf="GroupDot"
        aria-hidden
        size={12}
        strokeWidth={1.75}
        className="shrink-0 text-fg-faint"
      />
    );
  return (
    <span
      data-wf="GroupDot"
      aria-hidden
      className="size-2 shrink-0 rounded-full"
      style={{ background: `var(--wf-hue-${node.color})` }}
    />
  );
}

export function Field({
  label,
  htmlFor,
  hint,
  error,
  children,
}: {
  label: string;
  htmlFor?: string;
  hint?: string;
  error?: string;
  children: ReactNode;
}) {
  return (
    <div data-wf="Field" className="flex min-w-0 flex-col gap-1.5">
      {htmlFor ? (
        <label htmlFor={htmlFor} className="font-medium text-fg-muted text-sm">
          {label}
        </label>
      ) : (
        <span className="font-medium text-fg-muted text-sm">{label}</span>
      )}
      {children}
      {error ? (
        <p role="alert" className="text-danger text-xs">
          {error}
        </p>
      ) : hint ? (
        <p className="min-h-[1lh] text-fg-faint text-xs">{hint}</p>
      ) : null}
    </div>
  );
}

/** A full-width menu button listing every group, indented by depth. */
export function GroupPicker({
  id,
  options,
  value,
  onChange,
  loading,
}: {
  id?: string;
  options: GroupOption[];
  value?: GroupOption;
  onChange: (id: GroupId) => void;
  loading: boolean;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          id={id}
          type="button"
          variant="secondary"
          className="w-full justify-start gap-2 font-normal"
          disabled={loading}
        >
          {value ? (
            <>
              <GroupDot node={value.node} root={value.depth === 0} />
              <span className="min-w-0 flex-1 truncate text-left">{optionLabel(value)}</span>
            </>
          ) : (
            <span className="flex-1 text-left text-fg-faint">
              {loading ? "Loading groups…" : "Pick a group"}
            </span>
          )}
          <ChevronDown size={14} strokeWidth={1.75} className="text-fg-faint" aria-hidden />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="start"
        className="max-h-72 w-[var(--radix-dropdown-menu-trigger-width)] overflow-y-auto"
      >
        {options.map((o) => (
          <DropdownMenuItem
            key={o.node.id}
            selected={o.node.id === value?.node.id}
            onSelect={() => onChange(o.node.id)}
          >
            <span
              className="flex min-w-0 items-center gap-2"
              style={{ paddingLeft: Math.max(0, o.depth - 1) * 12 }}
            >
              <GroupDot node={o.node} root={o.depth === 0} />
              <span className={cn("truncate", o.node.implicit && "text-fg-faint italic")}>
                {o.depth === 0 ? optionLabel(o) : o.node.title}
              </span>
            </span>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
