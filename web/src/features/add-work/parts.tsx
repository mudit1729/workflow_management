// + Add work: the pieces every screen shares. A screen is a question and its answers; the
// answers are large numbered buttons first, a toggle chip when several can apply, a field last.
import { Check } from "lucide-react";
import {
  createContext,
  type KeyboardEvent,
  type ReactNode,
  type RefObject,
  useContext,
  useId,
  useLayoutEffect,
  useRef,
} from "react";
import { cn } from "@/lib/cn";
import { STEP_LABEL, type StepId } from "./flow";

// ---------------------------------------------------------------- number keys

/**
 * The screen on show says what the number keys do. The dialog listens for the keys; the screen
 * puts its handler here, so a key works wherever focus is inside the dialog.
 */
export const DigitSlot = createContext<RefObject<((n: number) => void) | undefined> | null>(null);

export function useDigitKeys(handler: ((n: number) => void) | undefined) {
  const slot = useContext(DigitSlot);
  useLayoutEffect(() => {
    if (!slot) return;
    slot.current = handler;
    return () => {
      if (slot.current === handler) slot.current = undefined;
    };
  });
}

/**
 * The 1 to 9 key a person presses for the nth answer. Past the ninth there is no key: the answer
 * keeps its place in the column (an empty cap) and is reached with a click or the arrow keys.
 */
export function KeyCap({
  n,
  selected,
  className,
}: {
  n: number;
  selected?: boolean;
  className?: string;
}) {
  if (n > 9) return <span aria-hidden className={cn("size-5 shrink-0 max-md:hidden", className)} />;
  return (
    <kbd
      aria-hidden
      data-wf="KeyCap"
      className={cn(
        "inline-flex size-5 shrink-0 items-center justify-center rounded-[4px] border font-medium text-xs tabular transition-colors duration-100 ease-wf max-md:hidden",
        selected
          ? "border-accent bg-accent text-accent-fg"
          : "border-border bg-subtle text-fg-muted",
        className,
      )}
    >
      {n}
    </kbd>
  );
}

// ---------------------------------------------------------------- a screen

export function StepFrame({
  step,
  index,
  total,
  title,
  hint,
  children,
}: {
  step: StepId;
  index: number;
  total: number;
  title: ReactNode;
  hint?: ReactNode;
  children: ReactNode;
}) {
  const id = useId();
  return (
    <section
      data-wf="AddWorkStep"
      data-step={step}
      aria-labelledby={id}
      // The frame is keyed by the step, so each screen eases in. No motion for a reduced-motion user.
      className="fade-in-0 slide-in-from-right-2 flex min-w-0 animate-in flex-col duration-150 motion-reduce:animate-none"
    >
      <p className="text-fg-faint text-xs tabular">
        {index + 1} of {total}
        <span className="sr-only"> · {STEP_LABEL[step]}</span>
      </p>
      <h2 id={id} className="mt-1 font-semibold text-fg text-xl leading-snug tracking-tight">
        {title}
      </h2>
      {hint && <p className="mt-1.5 max-w-[56ch] text-fg-muted text-md">{hint}</p>}
      <div className="mt-5 flex min-w-0 flex-col gap-3">{children}</div>
    </section>
  );
}

// ---------------------------------------------------------------- choices

export interface ChoiceOption<T extends string> {
  value: T;
  label: ReactNode;
  /** The line under the label. */
  hint?: ReactNode;
  /** A glyph or a color dot before the label. */
  lead?: ReactNode;
  /** Faint text at the right (a count). */
  trail?: ReactNode;
  /** Accessible name when the label is not plain text. */
  name?: string;
}

/**
 * Large answer buttons for a question with one answer. A click picks and goes on; a number key
 * picks; Enter goes on; the arrows move the pick. A radio group, so a screen reader hears it
 * as one question with its answers.
 */
export function ChoiceList<T extends string>({
  label,
  options,
  value,
  onPick,
  onGo,
  columns = 1,
  autoFocus = true,
  advanceOnClick = true,
  dense = false,
}: {
  label: string;
  options: ChoiceOption<T>[];
  value: T | undefined;
  /** Select an answer without leaving the screen (a number key, an arrow). */
  onPick: (value: T) => void;
  /** Select and go on (a click, Enter). */
  onGo: (value: T) => void;
  columns?: 1 | 2;
  /** The selected answer takes focus when the screen opens. */
  autoFocus?: boolean;
  /** A click only picks (the last screen: a click must not add anything). */
  advanceOnClick?: boolean;
  /** One line per answer, for a long list: the hint follows the label. */
  dense?: boolean;
}) {
  const group = useRef<HTMLDivElement>(null);
  const focusAt = (i: number) =>
    group.current?.querySelectorAll<HTMLElement>('[role="radio"]')[i]?.focus();

  useDigitKeys((n) => {
    const option = options[n - 1];
    if (!option) return;
    onPick(option.value);
    focusAt(n - 1);
  });

  const selectedIndex = options.findIndex((o) => o.value === value);
  const tabbable = Math.max(selectedIndex, 0);

  const onKey = (e: KeyboardEvent<HTMLButtonElement>, i: number) => {
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      const next = (i + (e.key === "ArrowDown" ? 1 : -1) + options.length) % options.length;
      onPick(options[next].value);
      focusAt(next);
    } else if (e.key === "Enter" && !e.nativeEvent.isComposing) {
      e.preventDefault();
      onGo(options[i].value);
    }
  };

  return (
    <div
      ref={group}
      data-wf="ChoiceList"
      role="radiogroup"
      aria-label={label}
      className={cn("grid gap-2", columns === 2 ? "grid-cols-2 max-sm:grid-cols-1" : "grid-cols-1")}
    >
      {options.map((o, i) => (
        <ChoiceButton
          key={o.value}
          option={o}
          n={i + 1}
          selected={o.value === value}
          dense={dense}
          tabIndex={i === tabbable ? 0 : -1}
          autoFocus={autoFocus && i === tabbable}
          onClick={() => (advanceOnClick ? onGo(o.value) : onPick(o.value))}
          onKeyDown={(e) => onKey(e, i)}
        />
      ))}
    </div>
  );
}

function ChoiceButton<T extends string>({
  option,
  n,
  selected,
  dense,
  tabIndex,
  autoFocus,
  onClick,
  onKeyDown,
}: {
  option: ChoiceOption<T>;
  n: number;
  selected: boolean;
  dense: boolean;
  tabIndex: number;
  autoFocus: boolean;
  onClick: () => void;
  onKeyDown: (e: KeyboardEvent<HTMLButtonElement>) => void;
}) {
  return (
    // biome-ignore lint/a11y/useSemanticElements: a large answer button that is also a radio; a native radio input cannot be styled as a button with a hint line.
    <button
      type="button"
      data-wf="ChoiceButton"
      role="radio"
      aria-checked={selected}
      aria-label={option.name}
      tabIndex={tabIndex}
      data-autofocus={autoFocus ? "" : undefined}
      onClick={onClick}
      onKeyDown={onKeyDown}
      className={cn(
        "group/choice flex w-full min-w-0 cursor-default select-none items-center gap-3 rounded-md border px-3 text-left",
        dense ? "min-h-10 py-1.5" : "min-h-12 py-2",
        "transition-[background-color,border-color] duration-100 ease-wf",
        selected
          ? "border-accent bg-accent-subtle"
          : "border-border bg-bg hover:border-border-strong hover:bg-subtle",
      )}
    >
      <KeyCap n={n} selected={selected} />
      {option.lead && (
        <span aria-hidden className="flex shrink-0 items-center text-fg-muted">
          {option.lead}
        </span>
      )}
      <span className={cn("flex min-w-0 flex-1", dense ? "items-baseline gap-2" : "flex-col")}>
        <span className="truncate font-medium text-fg text-md">{option.label}</span>
        {option.hint && (
          <span
            className={cn(
              "truncate text-sm",
              dense ? "min-w-0 shrink-[2] text-fg-faint" : "text-fg-muted",
            )}
          >
            {option.hint}
          </span>
        )}
      </span>
      {option.trail && (
        <span className="shrink-0 text-fg-faint text-xs tabular">{option.trail}</span>
      )}
      <Check
        aria-hidden
        size={14}
        strokeWidth={1.75}
        className={cn("shrink-0 text-accent", selected ? "opacity-100" : "opacity-0")}
      />
    </button>
  );
}

/**
 * A toggle chip for a question with several answers (context). Space or a click toggles; the
 * number key does too. It is a button with a pressed state, not a radio.
 */
export function ToggleChip({
  n,
  pressed,
  onToggle,
  children,
  title,
  className,
}: {
  n?: number;
  pressed: boolean;
  onToggle: () => void;
  children: ReactNode;
  title?: string;
  className?: string;
}) {
  return (
    <button
      type="button"
      data-wf="ToggleChip"
      aria-pressed={pressed}
      title={title}
      onClick={onToggle}
      className={cn(
        "inline-flex h-8 min-w-0 max-w-full cursor-default select-none items-center gap-2 rounded-md border px-2 text-base",
        "transition-[background-color,border-color] duration-100 ease-wf",
        pressed
          ? "border-accent bg-accent-subtle text-fg"
          : "border-border bg-bg text-fg hover:border-border-strong hover:bg-subtle",
        className,
      )}
    >
      {n !== undefined && <KeyCap n={n} selected={pressed} />}
      {children}
      <Check
        aria-hidden
        size={14}
        strokeWidth={1.75}
        className={cn("shrink-0 text-accent", pressed ? "block" : "hidden")}
      />
    </button>
  );
}

// ---------------------------------------------------------------- progress

/**
 * One dot per question. The dot you are on is a longer pill; the ones behind you take you back.
 * The row is a list with the current step marked, so a screen reader hears "step 3 of 9".
 */
export function ProgressDots({
  steps,
  index,
  onGo,
  disabled,
}: {
  steps: readonly StepId[];
  index: number;
  onGo: (i: number) => void;
  disabled?: boolean;
}) {
  return (
    <ol
      data-wf="ProgressDots"
      aria-label={`Question ${index + 1} of ${steps.length}`}
      className="flex items-center"
    >
      {steps.map((s, i) => (
        <li key={s} className="flex">
          {i < index ? (
            <button
              type="button"
              disabled={disabled}
              aria-label={`Back to ${STEP_LABEL[s]}`}
              title={STEP_LABEL[s]}
              onClick={() => onGo(i)}
              className="group/dot grid h-6 w-3.5 cursor-default place-items-center rounded-sm"
            >
              <span className="size-1.5 rounded-full bg-fg-faint transition-colors duration-100 group-hover/dot:bg-fg-muted" />
            </button>
          ) : (
            <span
              aria-current={i === index ? "step" : undefined}
              className="grid h-6 w-3.5 place-items-center"
            >
              <span
                className={cn(
                  "h-1.5 rounded-full transition-[width,background-color] duration-150 ease-wf",
                  i === index ? "w-3.5 bg-accent" : "w-1.5 bg-border",
                )}
              />
            </span>
          )}
        </li>
      ))}
    </ol>
  );
}

/** Quiet line of key hints under a screen's answers, hidden where there is no keyboard. */
export function KeyHint({ children }: { children: ReactNode }) {
  return (
    <p data-wf="KeyHint" className="text-fg-faint text-xs max-md:hidden">
      {children}
    </p>
  );
}

/** True for a field a person types in: the number keys and the arrows are theirs there. */
export function isTypingTarget(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  if (!el) return false;
  return (
    el.isContentEditable ||
    el.tagName === "INPUT" ||
    el.tagName === "TEXTAREA" ||
    el.tagName === "SELECT" ||
    el.closest?.("[cmdk-root]") != null
  );
}
