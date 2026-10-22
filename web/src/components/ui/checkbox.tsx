// Checkbox. `criterion` shows the three criterion states (contract 1.5):
// open = empty, claimed = hatched (ticked, no evidence), verified = solid with a check.
import { Check, Minus } from "lucide-react";
import { Checkbox as CheckboxPrimitive } from "radix-ui";
import type { CSSProperties } from "react";
import type { CriterionState } from "@/gen/types";
import { cn } from "@/lib/cn";

export interface CheckboxProps {
  checked?: boolean | "indeterminate";
  onCheckedChange?: (checked: boolean) => void;
  variant?: "default" | "criterion";
  /** Criterion variant only. Defaults to verified when checked, open when not. */
  state?: CriterionState;
  disabled?: boolean;
  id?: string;
  name?: string;
  className?: string;
  title?: string;
  "aria-label"?: string;
  "aria-labelledby"?: string;
  "aria-describedby"?: string;
}

const HATCH: CSSProperties = {
  backgroundImage:
    "repeating-linear-gradient(45deg, color-mix(in srgb, var(--wf-status-done) 45%, transparent) 0 2px, transparent 2px 4px)",
};

/** Plain-English meaning of each criterion state, for tooltips and labels. */
export const CRITERION_STATE_LABEL: Record<CriterionState, string> = {
  open: "Open",
  claimed: "Claimed: ticked, no evidence yet",
  verified: "Verified: evidence recorded",
};

export function Checkbox({
  checked,
  onCheckedChange,
  variant = "default",
  state,
  disabled,
  className,
  ...props
}: CheckboxProps) {
  const base =
    "peer relative inline-flex size-[14px] shrink-0 cursor-default items-center justify-center rounded-sm outline-offset-2 transition-[background-color,border-color] duration-100 ease-wf disabled:cursor-not-allowed disabled:opacity-50";

  if (variant === "criterion") {
    const s: CriterionState = state ?? (checked ? "verified" : "open");
    return (
      <CheckboxPrimitive.Root
        data-wf="Checkbox"
        data-criterion={s}
        checked={checked ?? s !== "open"}
        onCheckedChange={(c) => onCheckedChange?.(c === true)}
        disabled={disabled}
        style={s === "claimed" ? HATCH : undefined}
        className={cn(
          base,
          s === "open" && "border-[1.5px] border-border-strong bg-bg hover:border-fg-faint",
          s === "claimed" && "border-[1.5px] border-status-done",
          s === "verified" && "border-[1.5px] border-status-done bg-status-done",
          className,
        )}
        {...props}
      >
        {s === "verified" && <Check aria-hidden size={14} strokeWidth={1.75} className="text-bg" />}
      </CheckboxPrimitive.Root>
    );
  }

  return (
    <CheckboxPrimitive.Root
      data-wf="Checkbox"
      checked={checked}
      onCheckedChange={(c) => onCheckedChange?.(c === true)}
      disabled={disabled}
      className={cn(
        base,
        "border-[1.5px] border-border-strong bg-bg hover:border-fg-faint",
        "data-[state=checked]:border-accent data-[state=checked]:bg-accent",
        "data-[state=indeterminate]:border-accent data-[state=indeterminate]:bg-accent",
        className,
      )}
      {...props}
    >
      <CheckboxPrimitive.Indicator className="flex items-center justify-center text-accent-fg">
        {checked === "indeterminate" ? (
          <Minus aria-hidden size={14} strokeWidth={1.75} />
        ) : (
          <Check aria-hidden size={14} strokeWidth={1.75} />
        )}
      </CheckboxPrimitive.Indicator>
    </CheckboxPrimitive.Root>
  );
}
