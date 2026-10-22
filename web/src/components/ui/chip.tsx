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
        stale:
          "bg-stale/12 text-[color-mix(in_srgb,var(--wf-signal-stale)_78%,var(--wf-text))]",
        success:
          "bg-status-done/12 text-[color-mix(in_srgb,var(--wf-status-done)_85%,var(--wf-text))]",
        outline: "border border-border text-fg-muted",
      },
      size: {
        xs: "h-4 gap-0.5 px-1 text-[10px] [&>svg]:size-[10px]",
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
  const body = (
    <>
      {icon}
      {children !== undefined && <span className="min-w-0 truncate">{children}</span>}
    </>
  );
  if (onClick) {
    return (
      <button
        data-wf="Chip"
        type="button"
        onClick={onClick}
        aria-pressed={pressed}
        title={props.title}
        className={cn(
          classes,
          "cursor-default transition-[filter,background-color] duration-100 hover:brightness-95 dark:hover:brightness-125",
          pressed && "ring-1 ring-current/40 ring-inset",
        )}
      >
        {body}
      </button>
    );
  }
  return (
    <span data-wf="Chip" className={classes} {...props}>
      {body}
    </span>
  );
}
