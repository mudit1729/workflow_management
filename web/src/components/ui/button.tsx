import { cva, type VariantProps } from "class-variance-authority";
import { Slot } from "radix-ui";
import type { ComponentProps } from "react";
import { cn } from "@/lib/cn";

export const buttonVariants = cva(
  [
    "inline-flex shrink-0 cursor-default select-none items-center justify-center gap-1.5 whitespace-nowrap rounded-md font-medium",
    "transition-[background-color,color,border-color,filter] duration-100 ease-wf",
    "disabled:pointer-events-none disabled:opacity-50 aria-disabled:pointer-events-none aria-disabled:opacity-50",
    "[&>svg]:shrink-0 [&>svg:not([class*='size-'])]:size-[14px]",
  ],
  {
    variants: {
      variant: {
        primary: "bg-accent text-accent-fg hover:brightness-110 active:brightness-95",
        secondary:
          "border border-border bg-bg text-fg hover:bg-subtle active:bg-muted data-[state=open]:bg-muted aria-expanded:bg-muted",
        ghost:
          "text-fg-muted hover:bg-muted hover:text-fg active:bg-border data-[state=open]:bg-muted data-[state=open]:text-fg aria-expanded:bg-muted aria-expanded:text-fg aria-pressed:bg-muted aria-pressed:text-fg",
        subtle:
          "bg-muted text-fg hover:bg-border data-[state=open]:bg-border aria-expanded:bg-border",
        danger:
          "border border-border bg-bg text-danger hover:border-danger/30 hover:bg-danger/8 active:bg-danger/12",
      },
      size: {
        md: "h-7 px-2.5 text-base",
        sm: "h-6 gap-1 px-2 text-sm",
        icon: "size-7 p-0",
        "icon-sm": "size-6 p-0",
      },
    },
    defaultVariants: { variant: "secondary", size: "md" },
  },
);

export interface ButtonProps extends ComponentProps<"button">, VariantProps<typeof buttonVariants> {
  /** Render the child element (e.g. an `<a>`) with button styles. */
  asChild?: boolean;
}

export function Button({
  className,
  variant,
  size,
  asChild = false,
  type = "button",
  ...props
}: ButtonProps) {
  const Comp = asChild ? Slot.Root : "button";
  return (
    <Comp
      data-wf="Button"
      type={asChild ? undefined : type}
      className={cn(buttonVariants({ variant, size }), className)}
      {...props}
    />
  );
}
