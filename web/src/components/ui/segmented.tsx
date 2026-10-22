// Segmented control for 2–4 mutually exclusive views. Arrow keys move between options.
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
          className={cn(
            "inline-flex cursor-default select-none items-center justify-center whitespace-nowrap rounded-[5px] font-medium",
            "text-fg-muted transition-colors duration-100 ease-wf hover:text-fg",
            "disabled:pointer-events-none disabled:opacity-50",
            "data-[state=on]:bg-bg data-[state=on]:text-fg data-[state=on]:shadow-[0_1px_2px_rgb(0_0_0/0.06),0_0_0_1px_var(--wf-border)]",
            "dark:data-[state=on]:bg-border dark:data-[state=on]:shadow-[0_0_0_1px_var(--wf-border-strong)]",
            "[&>svg]:size-[14px] [&>svg]:shrink-0",
            size === "sm" ? "h-5 gap-1 px-1.5 text-xs" : "h-6 gap-1.5 px-2 text-sm",
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
