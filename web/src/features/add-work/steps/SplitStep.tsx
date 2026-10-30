// "Codex splits it": the three steps Codex goes through, then its proposals as cards. Each card
// keeps or drops an issue and changes its size and priority; the title is edited only on demand.
// This is the last screen of the group path: it also asks where the issues start (Backlog or
// Planned, keys 1 and 2) and its primary button adds them, so there is no separate review.
import { Check, CircleAlert, LoaderCircle, Pencil, RotateCw } from "lucide-react";
import {
  type KeyboardEvent,
  type ReactNode,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import { StatusIcon } from "@/components/common";
import { Button, Input, Segmented } from "@/components/ui";
import type { Priority, Size } from "@/gen/types";
import { useSplitWork } from "@/lib/api";
import { cn } from "@/lib/cn";
import {
  PRIORITIES,
  PRIORITY_LABEL,
  rowsFrom,
  SIZE_LABEL,
  type SplitRow,
  STATUSES,
  splitSignature,
  type WorkStatus,
} from "../flow";
import { KeyHint, useDigitKeys } from "../parts";
import type { AddWorkFlow } from "../useAddWorkFlow";
import { Screen } from "./shared";

const SIZES: Size[] = ["xs", "s", "m", "l"];

export function SplitStep({ flow }: { flow: AddWorkFlow }) {
  const { draft, patch } = flow;
  const { split, steps, step, pending } = useSplitWork();
  const [failed, setFailed] = useState(false);
  const run = useRef(0);

  const signature = splitSignature(draft);
  const current = draft.split?.signature === signature ? draft.split : undefined;

  const name = draft.name.trim();
  const outcome = draft.outcome.trim();
  const { size, priority } = draft;
  const contextIds = draft.context.map((c) => c.target).join("\n");

  const start = useCallback(async () => {
    run.current += 1;
    const id = run.current;
    setFailed(false);
    const res = await split({
      title: name,
      outcome,
      size,
      context: contextIds ? contextIds.split("\n") : [],
    });
    // A newer run, or the person leaving the screen, makes this answer stale.
    if (run.current !== id) return;
    if (!res) {
      setFailed(true);
      return;
    }
    patch({ split: { signature, rows: rowsFrom(res.issues, priority) } });
  }, [split, name, outcome, size, contextIds, priority, signature, patch]);

  const hasRows = !!current;
  useEffect(() => {
    if (!hasRows) void start();
    return () => {
      run.current += 1;
    };
  }, [hasRows, start]);

  const setRow = (key: string, change: Partial<SplitRow>) => {
    if (!draft.split) return;
    patch({
      split: {
        ...draft.split,
        rows: draft.split.rows.map((r) => (r.key === key ? { ...r, ...change } : r)),
      },
    });
  };

  const again = () => {
    patch({ split: undefined });
  };

  const rows = current?.rows ?? [];
  const kept = rows.filter((r) => r.keep).length;

  // 1 and 2 pick where the issues start once there is something to add.
  useDigitKeys(
    current
      ? (n) => {
          const status = STATUSES[n - 1];
          if (status) patch({ status: status.value });
        }
      : undefined,
  );

  let body: ReactNode;
  let hint: ReactNode;
  if (failed && !current) {
    hint = "Nothing was added. Go back to change the outcome, or try again.";
    body = (
      <div className="flex items-start gap-3 rounded-md border border-border bg-subtle px-3 py-3">
        <CircleAlert
          aria-hidden
          size={14}
          strokeWidth={1.75}
          className="mt-0.5 shrink-0 text-danger"
        />
        <div className="flex min-w-0 flex-col items-start gap-2">
          <p className="text-base text-fg">Codex could not split this group.</p>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => {
              void start();
            }}
          >
            <RotateCw size={14} strokeWidth={1.75} />
            Try again
          </Button>
        </div>
      </div>
    );
  } else if (!current) {
    hint = "This takes a few seconds.";
    body = <SplitProgress steps={steps} step={step} pending={pending} />;
  } else {
    hint = `Codex proposed ${rows.length} issues for “${name}”. Drop what you do not need, adjust the rest and add them.`;
    body = (
      <>
        <StartIn value={draft.status} onChange={(status) => patch({ status })} />
        <ul data-wf="SplitCards" className="flex min-w-0 flex-col gap-2">
          {rows.map((row) => (
            <li key={row.key}>
              <SplitCard row={row} onChange={(change) => setRow(row.key, change)} />
            </li>
          ))}
        </ul>
        <div className="flex items-center justify-between gap-3">
          <p aria-live="polite" className="text-fg-muted text-sm tabular">
            {kept} of {rows.length} kept
          </p>
          <Button variant="ghost" size="sm" onClick={again}>
            <RotateCw size={14} strokeWidth={1.75} />
            Split again
          </Button>
        </div>
        <KeyHint>Press 1 for Backlog or 2 for Planned. Enter adds the issues.</KeyHint>
      </>
    );
  }

  return (
    <Screen flow={flow} title="Codex splits it into issues" hint={hint}>
      {body}
    </Screen>
  );
}

// ---------------------------------------------------------------- where the issues start

/** Two buttons: the issues start in Backlog or in Planned. Backlog is the answer until changed. */
export function StartIn({
  value,
  onChange,
}: {
  value: WorkStatus;
  onChange: (value: WorkStatus) => void;
}) {
  const hint = STATUSES.find((s) => s.value === value)?.hint;
  return (
    <div data-wf="SplitStart" className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1.5">
      <span className="text-fg-muted text-sm">Start in</span>
      <Segmented<WorkStatus>
        aria-label="Where the issues start"
        value={value}
        onChange={onChange}
        options={STATUSES.map((s) => ({
          value: s.value,
          label: s.label,
          icon: <StatusIcon status={s.value} size={14} />,
        }))}
      />
      <span className="min-w-0 truncate text-fg-faint text-sm">{hint}</span>
    </div>
  );
}

// ---------------------------------------------------------------- progress

/** The three things Codex does, the one in progress marked, the ones behind it checked. */
export function SplitProgress({
  steps,
  step,
  pending,
}: {
  steps: readonly string[];
  step: number;
  pending: boolean;
}) {
  // Between the first render and the first step there is no step yet: show the first as active.
  const active = pending ? step : 0;
  return (
    <ol
      data-wf="SplitProgress"
      aria-live="polite"
      aria-label="What Codex is doing"
      className="flex flex-col gap-1 rounded-md border border-border bg-subtle p-2"
    >
      {steps.map((label, i) => {
        const state = i < active ? "done" : i === active ? "active" : "waiting";
        return (
          <li
            key={label}
            aria-current={state === "active" ? "step" : undefined}
            className={cn(
              "flex h-8 items-center gap-2.5 rounded-sm px-2 text-base",
              state === "active" ? "bg-bg font-medium text-fg" : "text-fg-muted",
              state === "waiting" && "text-fg-faint",
            )}
          >
            <span aria-hidden className="grid size-4 shrink-0 place-items-center">
              {state === "done" ? (
                <Check size={14} strokeWidth={1.75} className="text-success-text" />
              ) : state === "active" ? (
                <LoaderCircle
                  size={14}
                  strokeWidth={1.75}
                  className="text-accent motion-safe:animate-spin"
                />
              ) : (
                <span className="size-1.5 rounded-full bg-border-strong" />
              )}
            </span>
            <span className="truncate">{label}</span>
            <span className="sr-only">
              {state === "done" ? ", done" : state === "active" ? ", in progress" : ", waiting"}
            </span>
          </li>
        );
      })}
    </ol>
  );
}

// ---------------------------------------------------------------- one proposal

/** One proposed issue: keep or drop, the size and the priority, and the title on demand. */
export function SplitCard({
  row,
  onChange,
}: {
  row: SplitRow;
  onChange: (change: Partial<SplitRow>) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(row.title);
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

  const finish = (save: boolean) => {
    if (!live.current) return;
    live.current = false;
    const next = draft.trim();
    if (save && next) onChange({ title: next });
    else setDraft(row.title);
    setEditing(false);
    // The pencil takes focus back, so the keyboard does not fall to the top of the dialog.
    requestAnimationFrame(() => edit.current?.focus());
  };

  const onKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.nativeEvent.isComposing) return;
    if (e.key === "Enter") {
      e.preventDefault();
      finish(true);
    } else if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      finish(false);
    }
  };

  return (
    <article
      data-wf="SplitCard"
      data-kept={row.keep}
      aria-label={row.title}
      className={cn(
        "flex min-w-0 flex-col gap-2 rounded-md border px-3 py-2.5 transition-colors duration-100 ease-wf",
        row.keep ? "border-border bg-bg" : "border-border border-dashed bg-subtle",
      )}
    >
      <div className="flex min-w-0 items-start gap-2">
        <div className="min-w-0 flex-1">
          {editing ? (
            <Input
              ref={field}
              data-local-esc=""
              aria-label={`Title of ${row.title}`}
              value={draft}
              maxLength={120}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={onKey}
              onBlur={() => finish(true)}
              className="h-7"
            />
          ) : (
            <p
              className={cn(
                "text-base leading-snug",
                row.keep ? "font-medium text-fg" : "text-fg-muted line-through",
              )}
            >
              {row.title}
            </p>
          )}
        </div>
        <Segmented<"keep" | "drop">
          size="sm"
          aria-label={`Keep or drop ${row.title}`}
          value={row.keep ? "keep" : "drop"}
          onChange={(v) => onChange({ keep: v === "keep" })}
          options={[
            { value: "keep", label: "Keep" },
            { value: "drop", label: "Drop" },
          ]}
        />
      </div>
      <p className={cn("text-sm", row.keep ? "text-fg-muted" : "text-fg-faint")}>{row.why}</p>
      <div className="flex min-w-0 flex-wrap items-center gap-x-4 gap-y-2">
        <div className="flex items-center gap-2">
          <span className="text-fg-faint text-xs">Size</span>
          <Segmented<Size>
            size="sm"
            aria-label={`Size of ${row.title}`}
            disabled={!row.keep}
            value={row.size}
            onChange={(size) => onChange({ size })}
            options={SIZES.map((s) => ({ value: s, label: SIZE_LABEL[s] }))}
          />
        </div>
        <div className="flex items-center gap-2">
          <span className="text-fg-faint text-xs">Priority</span>
          <Segmented<Priority>
            size="sm"
            aria-label={`Priority of ${row.title}`}
            disabled={!row.keep}
            value={row.priority}
            onChange={(priority) => onChange({ priority })}
            options={PRIORITIES.map((p) => ({ value: p.value, label: PRIORITY_LABEL[p.value] }))}
          />
        </div>
        {!editing && row.keep && (
          <Button
            ref={edit}
            variant="ghost"
            size="sm"
            className="ml-auto"
            aria-label={`Edit title of ${row.title}`}
            onClick={() => {
              setDraft(row.title);
              setEditing(true);
            }}
          >
            <Pencil size={14} strokeWidth={1.75} />
            Edit title
          </Button>
        )}
      </div>
    </article>
  );
}
