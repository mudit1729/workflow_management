// The last screen of the single-issue path: what will be written. Codex drafts the criterion first
// (adding-work step 3: even one issue gets a measurable EARS sentence, and a real `## Context`),
// the person reads it here and may edit it. (A group is added from the split screen, where Codex's
// proposals are; it has no review.)
import { Pencil } from "lucide-react";
import {
  type KeyboardEvent,
  type ReactNode,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import { Button, Input } from "@/components/ui";
import { ContextIcon } from "@/features/context/ContextIcon";
import { itemKey } from "@/features/context/types";
import { useSplitWork } from "@/lib/api";
import {
  currentIssue,
  draftIssue,
  ISSUE_DRAFT_STEPS,
  issueSignature,
  PRIORITY_LABEL,
  SIZE_LABEL,
  STATUSES,
} from "../flow";
import { KeyHint } from "../parts";
import type { AddWorkFlow } from "../useAddWorkFlow";
import { CodexFailed, SplitProgress } from "./SplitStep";
import { Screen } from "./shared";

export function ReviewStep({ flow }: { flow: AddWorkFlow }) {
  const { draft, patch } = flow;
  const { split, step, pending } = useSplitWork();
  const [failed, setFailed] = useState(false);
  const run = useRef(0);

  const current = currentIssue(draft);
  const title = draft.title.trim();
  const { size } = draft;
  const contextIds = draft.context.map((c) => c.target).join("\n");
  const signature = issueSignature(draft);

  // Codex reads the title the way it reads a group's, and the issue is the slot of that split
  // that does what the title says. The draft is made again when the title or the context change.
  const start = useCallback(async () => {
    run.current += 1;
    const id = run.current;
    setFailed(false);
    const res = await split({
      title,
      outcome: "",
      size,
      context: contextIds ? contextIds.split("\n") : [],
    });
    // A newer run, or the person leaving the screen, makes this answer stale.
    if (run.current !== id) return;
    const drafted = res ? draftIssue(signature, title, res.issues) : undefined;
    if (!drafted) {
      setFailed(true);
      return;
    }
    patch({ issue: drafted });
  }, [split, title, size, contextIds, signature, patch]);

  const hasDraft = !!current;
  useEffect(() => {
    if (!hasDraft) void start();
    return () => {
      run.current += 1;
    };
  }, [hasDraft, start]);

  const place = flow.places.find((p) => p.id === draft.where);
  // "wf / web", or "Top level" when the issue sits at the root.
  const where = place && !place.root ? place.titles.join(" / ") : "Top level";

  let body: ReactNode;
  let hint: ReactNode;
  if (!current && failed) {
    hint = "Nothing was added. Try again, or go back to change the title.";
    body = (
      <CodexFailed
        message="Codex could not draft the criterion."
        onRetry={() => {
          void start();
        }}
      />
    );
  } else if (!current) {
    hint = "Codex writes the criterion that says when it is done. This takes a few seconds.";
    body = <SplitProgress steps={ISSUE_DRAFT_STEPS} step={step} pending={pending} />;
  } else {
    hint = "Check the details, then add it. Change the criterion if it does not say what you mean.";
    body = (
      <>
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
        <Criterion
          value={current.criterion}
          onChange={(criterion) => patch({ issue: { ...current, criterion } })}
        />
        <KeyHint>Press Enter to add it.</KeyHint>
      </>
    );
  }

  return (
    <Screen flow={flow} title="Add this issue?" hint={hint}>
      {body}
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

/**
 * The criterion Codex drafted: one sentence that says when the issue is done. It is read here and
 * changed only on demand (a button opens the field), so the screen stays a quick check.
 */
function Criterion({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(value);
  const field = useRef<HTMLInputElement>(null);
  const edit = useRef<HTMLButtonElement>(null);
  // Enter and Esc end the edit and the field then loses focus: that blur must not end it twice.
  const live = useRef(false);

  useEffect(() => {
    if (editing) {
      live.current = true;
      field.current?.focus();
      field.current?.select();
    }
  }, [editing]);

  // `via` says what ended the edit: Enter saves and hands focus to the button that adds the issue,
  // Esc cancels and puts it back on the pencil, and leaving the field (a click elsewhere) only
  // saves and moves nothing.
  const finish = (save: boolean, via: "enter" | "escape" | "blur") => {
    if (!live.current) return;
    live.current = false;
    const next = text.replace(/\s+/g, " ").trim();
    if (save && next) onChange(next);
    else setText(value);
    const panel = field.current?.closest('[data-wf="AddWorkPanel"]');
    setEditing(false);
    if (via === "blur") return;
    // The keyboard does not fall to the top of the dialog.
    requestAnimationFrame(() => {
      const add = panel?.querySelector<HTMLElement>("[data-autofocus]:not(:disabled)");
      (via === "enter" ? (add ?? edit.current) : edit.current)?.focus();
    });
  };

  const onKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.nativeEvent.isComposing) return;
    if (e.key === "Enter") {
      e.preventDefault();
      finish(true, "enter");
    } else if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      finish(false, "escape");
    }
  };

  return (
    <section
      data-wf="IssueCriterion"
      aria-label="Success criterion"
      className="flex min-w-0 flex-col gap-1.5 rounded-md border border-border bg-bg px-3 py-2.5"
    >
      <div className="flex items-center gap-2">
        <h3 className="font-medium text-fg-faint text-sm">Criterion</h3>
        {!editing && (
          <Button
            ref={edit}
            variant="ghost"
            size="sm"
            className="ml-auto"
            aria-label="Edit the criterion"
            onClick={() => {
              setText(value);
              setEditing(true);
            }}
          >
            <Pencil size={14} strokeWidth={1.75} />
            Edit
          </Button>
        )}
      </div>
      {editing ? (
        <Input
          ref={field}
          data-local-esc=""
          aria-label="Success criterion"
          value={text}
          maxLength={240}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={onKey}
          onBlur={() => finish(true, "blur")}
          className="h-7"
        />
      ) : (
        <p className="text-base text-fg leading-snug">{value}</p>
      )}
    </section>
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
