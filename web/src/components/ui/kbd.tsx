// Small mono key caps for shortcuts. "mod+k" → ⌘ K; "g w" → G then W.
import type { ComponentProps, ReactNode } from "react";
import { cn } from "@/lib/cn";
import { comboKeys } from "@/lib/hooks";

export interface KbdProps extends Omit<ComponentProps<"kbd">, "children"> {
  /** Hotkey grammar from `useHotkey`: "mod+k", "shift+?", "g w". */
  combo?: string;
  /** Free text instead of a combo, e.g. "Esc". */
  children?: ReactNode;
  /** `inverted` for use inside dark tooltips. */
  tone?: "default" | "inverted";
}

const cap =
  "inline-flex h-[16px] min-w-[16px] items-center justify-center rounded-[3px] px-[3px] font-mono text-[10.5px] leading-none font-medium";

const tones = {
  default: "border border-border bg-subtle text-fg-muted",
  inverted:
    "border border-[color-mix(in_srgb,var(--wf-bg)_22%,transparent)] bg-[color-mix(in_srgb,var(--wf-bg)_12%,transparent)] text-[color-mix(in_srgb,var(--wf-bg)_85%,transparent)]",
};

export function Kbd({ combo, children, tone = "default", className, ...props }: KbdProps) {
  const toneClass = tones[tone];
  if (children !== undefined || !combo) {
    return (
      <kbd data-wf="Kbd" className={cn(cap, toneClass, className)} {...props}>
        {children}
      </kbd>
    );
  }
  // A space separates a key sequence ("g w"); "+" joins a chord ("mod+k").
  const steps = combo.split(" ").filter(Boolean);
  return (
    <kbd
      data-wf="Kbd"
      aria-label={combo}
      className={cn("inline-flex shrink-0 items-center gap-0.5 font-sans", className)}
      {...props}
    >
      {steps.map((step, i) => (
        <span key={`${step}-${i}`} className="inline-flex items-center gap-0.5">
          {i > 0 && (
            <span
              className={cn(
                "px-0.5 text-[10px] font-normal",
                tone === "inverted" ? "opacity-60" : "text-fg-faint",
              )}
            >
              then
            </span>
          )}
          {comboKeys(step).map((k, j) => (
            <span key={`${k}-${j}`} className={cn(cap, toneClass)}>
              {k}
            </span>
          ))}
        </span>
      ))}
    </kbd>
  );
}
