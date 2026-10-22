// Segmented control for 2–4 mutually exclusive views. Arrow keys move between options and
// select the one they land on (radio-group behavior), so the view follows the focus.
import { ToggleGroup } from "radix-ui";
import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

export interface SegmentedOption<T extends string> {
  value: T;
  label: ReactNode;
  count?: number;
  icon?: ReactNode;
  disabled?: boolean;
  /** Accessible name when the label is an icon only. */
  title?: string;
}

export interface SegmentedProps<T extends string> {
  value: T;
  onChange: (value: T) => void;
  options: SegmentedOption<T>[];
  size?: "sm" | "md";
  "aria-label": string;
  disabled?: boolean;
  className?: string;
}

export function Segmented<T extends string>({
  value,
  onChange,
  options,
  size = "md",
  disabled,
  className,
  "aria-label": ariaLabel,
}: SegmentedProps<T>) {
  return (
    <ToggleGroup.Root
      data-wf="Segmented"
      type="single"
      value={value}
      // Radix allows deselecting the active item; a segmented control always has one.
      onValueChange={(v) => {
        if (v) onChange(v as T);
      }}
      aria-label={ariaLabel}
      disabled={disabled}
      className={cn(
        "inline-flex shrink-0 items-center gap-0.5 rounded-md bg-muted p-0.5",
        disabled && "opacity-50",
        className,
      )}
    >
      {options.map((o) => (
        <ToggleGroup.Item
          key={o.value}
          value={o.value}
          disabled={o.disabled}
          aria-label={o.title}
          title={o.title}
          onFocus={(e) => {
            // Roving focus by keyboard selects, like a radio group. Pointer focus is left to the
            // click, and focusing the already selected option does nothing.
            if (o.value !== value && e.currentTarget.matches(":focus-visible")) onChange(o.value);
          }}
          className={cn(
            "inline-flex cursor-default select-none items-center justify-center whitespace-nowrap rounded-[5px] font-medium",
            "text-fg-muted transition-colors duration-100 ease-wf hover:text-fg",
            "disabled:pointer-events-none disabled:opacity-50",
            // The selected segment is a hairline-ringed tile: no shadow, only overlays carry one.
            "data-[state=on]:bg-bg data-[state=on]:text-fg data-[state=on]:ring-1 data-[state=on]:ring-border",
            "dark:data-[state=on]:bg-border dark:data-[state=on]:ring-border-strong",
            "[&>svg]:size-[14px] [&>svg]:shrink-0",
            // Phones get 24 px+ tap targets (WCAG 2.5.8): these switch the board's status,
            // the inbox filter and the library kind.
            size === "sm"
              ? "h-5 gap-1 px-1.5 text-xs max-md:h-7 max-md:px-2.5"
              : "h-6 gap-1.5 px-2 text-sm max-md:h-8",
          )}
        >
          {o.icon}
          {o.label}
          {o.count !== undefined && (
            <span className="font-normal text-fg-faint tabular">{o.count}</span>
          )}
        </ToggleGroup.Item>
      ))}
    </ToggleGroup.Root>
  );
}
