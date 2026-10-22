// Ghost square button holding one icon. The label is both the tooltip and the aria-label.
import type { ReactNode } from "react";
import { cn } from "@/lib/cn";
import { Button, type ButtonProps } from "./button";
import { Tooltip } from "./tooltip";

export interface IconButtonProps extends Omit<ButtonProps, "size" | "children" | "variant"> {
  label: string;
  icon: ReactNode;
  size?: "sm" | "md";
  /** Shown as key caps in the tooltip. */
  shortcut?: string;
  tooltipSide?: "top" | "right" | "bottom" | "left";
  /** Toggle buttons: renders as pressed. */
  active?: boolean;
  variant?: "ghost" | "subtle";
}

export function IconButton({
  label,
  icon,
  size = "md",
  shortcut,
  tooltipSide,
  active,
  variant = "ghost",
  className,
  ...props
}: IconButtonProps) {
  return (
    <Tooltip content={label} shortcut={shortcut} side={tooltipSide}>
      <Button
        data-wf="IconButton"
        variant={variant}
        size={size === "sm" ? "icon-sm" : "icon"}
        aria-label={label}
        aria-pressed={active}
        className={cn(className)}
        {...props}
      >
        {icon}
      </Button>
    </Tooltip>
  );
}
