// Add team library: the frame of a screen and the progress dots. The same markup as Add work's
// `StepFrame` and `ProgressDots` (`features/add-work/parts.tsx`), which are typed to Add work's own
// step names; the answer buttons, key caps and number keys are imported from there as they are.
import { type ReactNode, useId } from "react";
import { cn } from "@/lib/cn";
import { SCREEN_LABEL, type Screen } from "./flow";

export function StepFrame({
  screen,
  index,
  total,
  title,
  hint,
  children,
}: {
  screen: Screen;
  index: number;
  total: number;
  title: ReactNode;
  hint?: ReactNode;
  children: ReactNode;
}) {
  const id = useId();
  return (
    <section
      data-wf="AddLibraryStep"
      data-step={screen}
      aria-labelledby={id}
      // The frame is keyed by the screen, so each one eases in. No motion for a reduced-motion user.
      className="fade-in-0 slide-in-from-right-2 flex min-w-0 animate-in flex-col duration-150 motion-reduce:animate-none"
    >
      <p className="text-fg-faint text-xs tabular">
        {index + 1} of {total}
        <span className="sr-only"> · {SCREEN_LABEL[screen]}</span>
      </p>
      <h2 id={id} className="mt-1 font-semibold text-fg text-xl leading-snug tracking-tight">
        {title}
      </h2>
      {hint && <p className="mt-1.5 max-w-[56ch] text-fg-muted text-md">{hint}</p>}
      <div className="mt-5 flex min-w-0 flex-col gap-3">{children}</div>
    </section>
  );
}

/** One dot per screen. The dot you are on is a longer pill; the ones behind you take you back. */
export function ScreenDots({
  screens,
  index,
  onGo,
  disabled,
}: {
  screens: readonly Screen[];
  index: number;
  onGo: (i: number) => void;
  disabled?: boolean;
}) {
  return (
    <ol
      data-wf="ScreenDots"
      aria-label={`Question ${index + 1} of ${screens.length}`}
      className="flex items-center"
    >
      {screens.map((s, i) => (
        <li key={s} className="flex">
          {i < index ? (
            <button
              type="button"
              disabled={disabled}
              aria-label={`Back to ${SCREEN_LABEL[s]}`}
              title={SCREEN_LABEL[s]}
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
