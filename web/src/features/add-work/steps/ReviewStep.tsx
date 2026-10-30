// The last screen: what will be written. A group asks where its issues start (Backlog or
// Planned); a single issue already answered that and only shows what it is about to add.
import type { ReactNode } from "react";
import { StatusIcon } from "@/components/common";
import { ContextIcon } from "@/features/context/ContextIcon";
import { itemKey } from "@/features/context/types";
import {
  countIssues,
  keptRows,
  PRIORITY_LABEL,
  SIZE_LABEL,
  STATUSES,
  type WorkStatus,
} from "../flow";
import { ChoiceList, KeyHint } from "../parts";
import type { AddWorkFlow } from "../useAddWorkFlow";
import { Screen } from "./shared";

export function ReviewStep({ flow }: { flow: AddWorkFlow }) {
  const { draft } = flow;
  const issue = draft.kind === "issue";
  const place = flow.places.find((p) => p.id === draft.where);
  // "wf / web", or "Top level" when the issue or the group sits at the root.
  const where = place && !place.root ? place.titles.join(" / ") : "Top level";
  const kept = keptRows(draft);

  if (issue) {
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

  const title = "Where do the issues start?";
  return (
    <Screen
      flow={flow}
      title={title}
      hint={`${countIssues(kept.length)} will be added to ${draft.name.trim()}.`}
    >
      <ChoiceList<WorkStatus>
        label={title}
        value={draft.status}
        columns={2}
        advanceOnClick={false}
        onPick={(status) => flow.patch({ status })}
        onGo={(status) => flow.advance({ status })}
        options={STATUSES.map((s) => ({
          value: s.value,
          label: s.label,
          hint: s.hint,
          lead: <StatusIcon status={s.value} size={16} />,
        }))}
      />
      <Summary
        rows={[
          ["Group", draft.name.trim()],
          ["Inside", where],
          ["Outcome", draft.outcome.trim()],
          ["Size", SIZE_LABEL[draft.size]],
          ["Context", contextLine(draft.context.length)],
        ]}
      />
      <ContextList flow={flow} />
      <ul data-wf="ReviewIssues" aria-label="Issues to add" className="flex min-w-0 flex-col">
        {kept.map((r) => (
          <li
            key={r.key}
            className="flex min-h-8 min-w-0 items-center gap-2 border-border border-t py-1 text-base first:border-t-0"
          >
            <StatusIcon status={draft.status} size={14} />
            <span className="min-w-0 flex-1 truncate">{r.title}</span>
            <span className="shrink-0 text-fg-faint text-xs tabular">
              {SIZE_LABEL[r.size]} · {PRIORITY_LABEL[r.priority]}
            </span>
          </li>
        ))}
      </ul>
      <KeyHint>Press 1 or 2 to pick, Enter to add.</KeyHint>
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
