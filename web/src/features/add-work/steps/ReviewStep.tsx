// The last screen of the single-issue path: what will be written. (A group is added from the
// split screen, where Codex's proposals are; it has no review.)
import type { ReactNode } from "react";
import { ContextIcon } from "@/features/context/ContextIcon";
import { itemKey } from "@/features/context/types";
import { PRIORITY_LABEL, SIZE_LABEL, STATUSES } from "../flow";
import { KeyHint } from "../parts";
import type { AddWorkFlow } from "../useAddWorkFlow";
import { Screen } from "./shared";

export function ReviewStep({ flow }: { flow: AddWorkFlow }) {
  const { draft } = flow;
  const place = flow.places.find((p) => p.id === draft.where);
  // "wf / web", or "Top level" when the issue sits at the root.
  const where = place && !place.root ? place.titles.join(" / ") : "Top level";

  return (
    <Screen flow={flow} title="Add this issue?" hint="Check the details, then add it.">
      <Summary
        rows={[
          ["Title", draft.title.trim()],
          ["Group", where],
          ["Priority", PRIORITY_LABEL[draft.priority]],
          ["Size", SIZE_LABEL[draft.size]],
          ["Status", STATUSES.find((s) => s.value === draft.status)?.label],
          ["Context", contextLine(draft.context.length)],
        ]}
      />
      <ContextList flow={flow} />
      <KeyHint>Press Enter to add it.</KeyHint>
    </Screen>
  );
}

function contextLine(n: number): string {
  return n === 0 ? "None" : `${n} ${n === 1 ? "item" : "items"}`;
}

function ContextList({ flow }: { flow: AddWorkFlow }) {
  const items = flow.draft.context;
  if (items.length === 0) return null;
  return (
    <ul aria-label="Context to link" className="flex min-w-0 flex-wrap gap-1.5">
      {items.map((item) => (
        <li
          key={itemKey(item)}
          className="inline-flex h-6 min-w-0 max-w-full items-center gap-1.5 rounded-sm bg-muted px-1.5 text-fg-muted text-sm"
        >
          <ContextIcon item={item} />
          <span className="truncate">{item.title}</span>
        </li>
      ))}
    </ul>
  );
}

/** A quiet two-column list of what was answered. */
export function Summary({ rows }: { rows: [string, ReactNode][] }) {
  return (
    <dl
      data-wf="AddWorkSummary"
      className="grid grid-cols-[72px_minmax(0,1fr)] gap-x-3 gap-y-1.5 rounded-md border border-border bg-subtle px-3 py-2.5 text-base"
    >
      {rows
        .filter(([, v]) => v !== undefined && v !== "")
        .map(([k, v]) => (
          <div key={k} className="contents">
            <dt className="text-fg-faint text-sm">{k}</dt>
            <dd className="min-w-0 break-words text-fg">{v}</dd>
          </div>
        ))}
    </dl>
  );
}
