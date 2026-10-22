// "What the agent gets": the picked items in the order `wf context` hands them over, a token
// estimate for each (about four characters to a token) and the total against the workspace
// budget. Amber when the items do not all fit: the last ones are left out first.
import { useQueries } from "@tanstack/react-query";
import { ChevronRight, TriangleAlert } from "lucide-react";
import { useMemo, useState } from "react";
import { CopyButton } from "@/components/common";
import { Chip, Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui";
import type { LibraryItemDetail } from "@/gen/types";
import { api, qk, useWorkspaceFile } from "@/lib/api";
import { cn } from "@/lib/cn";
import { ContextIcon } from "./ContextIcon";
import { estimateTokens, FILE_EXCERPT_CHARS } from "./links";
import { type ContextItem, isDraft, itemKey } from "./types";

/** `[context] budget_tokens` of workflow.toml when the workspace does not say. */
export const DEFAULT_BUDGET = 6000;

/** The budget the workspace sets: read from `workflow.toml`, the file the setting lives in. */
export function useContextBudget(): number {
  const text = useWorkspaceFile("workflow.toml").data?.text;
  return useMemo(() => {
    const n = /^\s*budget_tokens\s*=\s*(\d+)/m.exec(text ?? "")?.[1];
    return n ? Number(n) : DEFAULT_BUDGET;
  }, [text]);
}

// The reference-data wrapper `wf context` puts around an item, in characters.
const WRAPPER_CHARS = 90;

const libraryChars = (d: LibraryItemDetail) =>
  d.summary.title.length +
  d.summary.description.length +
  d.sections.reduce((n, s) => n + s.heading.length + s.body_md.length + 8, 0);

export interface PreviewRow {
  item: ContextItem;
  /** Estimated tokens the agent reads for this item; 0 when it is not injected. */
  tokens: number;
  injected: boolean;
  /** Past the budget: `wf context` drops it. */
  leftOut: boolean;
}

/** Size every item and mark where the budget runs out. Pure, so the gallery and tests can use it. */
export function previewRows(
  items: ContextItem[],
  budget: number,
  libraryChar: (id: string) => number | undefined = () => undefined,
): { rows: PreviewRow[]; total: number } {
  let running = 0;
  let total = 0;
  let over = false;
  const rows = items.map((item): PreviewRow => {
    if (isDraft(item)) return { item, tokens: 0, injected: false, leftOut: false };
    const chars =
      item.kind === "library"
        ? (libraryChar(item.target) ?? item.chars ?? item.title.length + (item.detail?.length ?? 0))
        : item.kind === "file"
          ? Math.min(item.chars ?? FILE_EXCERPT_CHARS, FILE_EXCERPT_CHARS + 80)
          : (item.chars ?? item.title.length + (item.detail?.length ?? 0));
    const tokens = estimateTokens(chars + WRAPPER_CHARS);
    total += tokens;
    if (!over && running + tokens <= budget) running += tokens;
    else over = true;
    return { item, tokens, injected: true, leftOut: over };
  });
  return { rows, total };
}

export interface ContextPreviewProps {
  items: ContextItem[];
  /** The issue the items go with, when it exists: its id completes the command. */
  issueId?: string;
  issueTitle?: string;
  /** Tokens the workspace allows (`budget_tokens`). Default: read from workflow.toml. */
  budget?: number;
  /** Start collapsed. */
  defaultOpen?: boolean;
  className?: string;
}

export function ContextPreview({
  items,
  issueId,
  issueTitle,
  budget: budgetProp,
  defaultOpen = true,
  className,
}: ContextPreviewProps) {
  const workspaceBudget = useContextBudget();
  const budget = budgetProp ?? workspaceBudget;
  const [open, setOpen] = useState(defaultOpen);

  // Reviewed library items are sized from their text, which only the item itself holds.
  const wanted = items.filter((i) => i.kind === "library" && i.status === "reviewed");
  const chars = useQueries({
    queries: wanted.map((i) => ({
      queryKey: qk.library(i.target),
      queryFn: () => api.libraryItem(i.target),
      staleTime: 30_000,
    })),
    combine: (results) =>
      new Map(
        results.flatMap((r) =>
          r.data ? [[r.data.summary.id, libraryChars(r.data)] as const] : [],
        ),
      ),
  });

  const { rows, total } = useMemo(
    () => previewRows(items, budget, (id) => chars.get(id)),
    [items, budget, chars],
  );
  const over = total > budget;
  const injected = rows.filter((r) => r.injected).length;
  const command = `wf context ${issueId ?? "<id>"}`;
  const pct = Math.min(100, Math.round((total / Math.max(1, budget)) * 100));

  return (
    <Collapsible
      data-wf="ContextPreview"
      open={open}
      onOpenChange={setOpen}
      className={cn("min-w-0 rounded-md border border-border bg-subtle", className)}
    >
      <CollapsibleTrigger
        className="flex h-8 w-full min-w-0 items-center gap-1.5 rounded-md px-2.5 text-left outline-none transition-colors duration-100 hover:bg-muted focus-visible:ring-2 focus-visible:ring-focus"
        aria-label={`What the agent gets${issueTitle ? ` for ${issueTitle}` : ""}`}
      >
        <ChevronRight
          aria-hidden
          size={14}
          strokeWidth={1.75}
          className={cn(
            "shrink-0 text-fg-faint transition-transform duration-100",
            open && "rotate-90",
          )}
        />
        <span className="font-medium text-fg-muted text-sm">What the agent gets</span>
        <span
          className={cn(
            "tabular ml-auto flex shrink-0 items-center gap-1.5 text-xs",
            over ? "text-stale-text" : "text-fg-faint",
          )}
        >
          {over && <TriangleAlert aria-hidden size={14} strokeWidth={1.75} />}
          <span>
            ≈ {total.toLocaleString("en-US")} of {budget.toLocaleString("en-US")} tokens
          </span>
        </span>
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div className="flex flex-col gap-2 px-2.5 pt-0.5 pb-2.5">
          {rows.length === 0 ? (
            <p className="text-fg-faint text-sm">
              Nothing added. The agent still gets the goal, the success criteria and the current
              state.
            </p>
          ) : (
            <>
              <div
                role="img"
                aria-label={`${pct}% of the token budget`}
                className="h-1 overflow-hidden rounded-full bg-muted"
              >
                <div
                  className={cn("h-full rounded-full", over ? "bg-stale" : "bg-accent")}
                  style={{ width: `${pct}%` }}
                />
              </div>
              <ol className="flex flex-col">
                {rows.map((row, i) => (
                  <PreviewLine key={itemKey(row.item)} row={row} index={i + 1} />
                ))}
              </ol>
              {over && (
                <p className="flex items-start gap-1.5 text-sm text-stale-text">
                  <TriangleAlert
                    aria-hidden
                    size={14}
                    strokeWidth={1.75}
                    className="mt-px shrink-0"
                  />
                  <span>
                    Over by{" "}
                    <span className="tabular">{(total - budget).toLocaleString("en-US")}</span>{" "}
                    tokens. The last items are left out.
                  </span>
                </p>
              )}
              {injected < rows.length && (
                <p className="text-fg-faint text-xs">
                  Drafts are listed by name. Their text is not injected until someone reviews them.
                </p>
              )}
            </>
          )}
          <p className="flex min-w-0 flex-wrap items-center gap-x-1 gap-y-0.5 text-fg-faint text-xs">
            <span>The agent gets this with</span>
            <code className="rounded-sm bg-muted px-1 py-px font-mono text-fg-muted">
              {command}
            </code>
            {issueId && <CopyButton text={command} label="Copy command" />}
          </p>
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}

function PreviewLine({ row, index }: { row: PreviewRow; index: number }) {
  const { item } = row;
  return (
    <li
      className={cn("flex h-7 min-w-0 items-center gap-2 text-sm", row.leftOut && "text-fg-faint")}
    >
      <span className="tabular w-3 shrink-0 text-right text-fg-faint text-xs">{index}</span>
      <ContextIcon item={item} className="shrink-0 text-fg-muted" />
      <span
        className={cn(
          "min-w-0 truncate",
          item.kind === "file" && "font-mono text-xs",
          row.leftOut && "line-through decoration-fg-faint/50",
        )}
      >
        {item.title}
      </span>
      <span className="ml-auto flex shrink-0 items-center gap-1.5">
        {!row.injected && (
          <Chip tone="stale" size="xs">
            Not injected
          </Chip>
        )}
        {row.leftOut && (
          <Chip tone="outline" size="xs">
            Left out
          </Chip>
        )}
        <span className="tabular w-16 text-right text-fg-faint text-xs">
          {row.injected ? `≈ ${row.tokens.toLocaleString("en-US")}` : "listed"}
        </span>
      </span>
    </li>
  );
}
