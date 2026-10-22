// Small label. Color only when it means something: accent, danger, stale (amber), success.
import { cva } from "class-variance-authority";
import type { ComponentProps, ReactNode } from "react";
import { cn } from "@/lib/cn";

export const chipVariants = cva(
  "inline-flex max-w-full shrink-0 items-center whitespace-nowrap rounded-sm font-medium leading-none [&>svg]:shrink-0",
  {
    variants: {
      tone: {
        neutral: "bg-muted text-fg-muted",
        accent: "bg-accent-subtle text-accent",
        danger: "bg-danger/12 text-danger",
        stale: "bg-stale/12 text-stale-text",
        success: "bg-status-done/12 text-success-text",
        outline: "border border-border text-fg-muted",
      },
      size: {
        xs: "h-4 gap-0.5 px-1 text-xs [&>svg]:size-[10px]",
        sm: "h-5 gap-1 px-1.5 text-xs [&>svg]:size-[12px]",
      },
    },
    defaultVariants: { tone: "neutral", size: "sm" },
  },
);

type Tone = "neutral" | "accent" | "danger" | "stale" | "success" | "outline";

export interface ChipProps extends Omit<ComponentProps<"span">, "children"> {
  tone?: Tone;
  size?: "xs" | "sm";
  icon?: ReactNode;
  children?: ReactNode;
  title?: string;
  /** Makes the chip a button (filters, toggles). */
  onClick?: () => void;
  /** With onClick: shows the chip as pressed. */
  pressed?: boolean;
}

export function Chip({
  tone,
  size,
  icon,
  children,
  className,
  onClick,
  pressed,
  ...props
}: ChipProps) {
  const classes = cn(chipVariants({ tone, size }), className);
  // Radix's Tooltip trigger adds an onClick (close on click) to whatever it wraps. That must not
  // turn a plain chip into a button: a chip is a button when it asks to be, with `pressed` or an
  // onClick of its own. The trigger's own marks are data-state "delayed-open" / "instant-open"
  // (or "closed" without the aria-expanded that popovers and menus add).
  const state = (props as { "data-state"?: string })["data-state"];
  const tooltipTrigger =
    state === "delayed-open" ||
    state === "instant-open" ||
    (state === "closed" && props["aria-expanded"] === undefined);
  const interactive = onClick !== undefined && (pressed !== undefined || !tooltipTrigger);
  const body = (
    <>
      {icon}
      {children !== undefined && <span className="min-w-0 truncate">{children}</span>}
    </>
  );
  if (interactive) {
    // Everything else is forwarded (ref, data-wf, aria-*, the handlers a Tooltip or Popover
    // trigger adds), so a wrapped chip keeps its name and still works as a trigger. The caller's
    // data-wf wins over ours because the spread comes last.
    return (
      <button
        data-wf="Chip"
        type="button"
        aria-pressed={pressed}
        {...(props as unknown as ComponentProps<"button">)}
        onClick={onClick}
        className={cn(
          classes,
          "cursor-default transition-[filter,background-color] duration-100 hover:brightness-95 dark:hover:brightness-125",
          // A filter chip is primary navigation on a phone: give it a 24 px+ hit area.
          size === "xs" ? "max-md:h-6" : "max-md:h-7 max-md:px-2",
          pressed && "ring-1 ring-current/40 ring-inset",
        )}
      >
        {body}
      </button>
    );
  }
  return (
    <span data-wf="Chip" className={classes} {...props} {...(onClick ? { onClick } : null)}>
      {body}
    </span>
  );
}
