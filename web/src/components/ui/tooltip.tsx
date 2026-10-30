// Inverted tooltip: fg-colored surface with bg-colored text, 12 px, 300 ms delay.
import { Tooltip as TooltipPrimitive } from "radix-ui";
import { type ComponentProps, type ReactElement, type ReactNode, useState } from "react";
import { cn } from "@/lib/cn";
import { Kbd } from "./kbd";

export function TooltipProvider({
  delayDuration = 300,
  skipDelayDuration = 200,
  ...props
}: ComponentProps<typeof TooltipPrimitive.Provider>) {
  return (
    <TooltipPrimitive.Provider
      delayDuration={delayDuration}
      skipDelayDuration={skipDelayDuration}
      {...props}
    />
  );
}

export interface TooltipProps {
  content: ReactNode;
  /** A hotkey combo shown as key caps after the text, e.g. "o" or "mod+k". */
  shortcut?: string;
  side?: "top" | "right" | "bottom" | "left";
  align?: "start" | "center" | "end";
  sideOffset?: number;
  delayDuration?: number;
  /** Controlled open state (rarely needed). */
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  /** Keep the tooltip closed. The trigger stays mounted, so focus and refs survive. */
  disabled?: boolean;
  className?: string;
  /** A single element that accepts a ref (buttons, spans, our primitives). */
  children: ReactElement;
}

export function Tooltip({
  content,
  shortcut,
  side = "top",
  align = "center",
  sideOffset = 6,
  delayDuration,
  open,
  onOpenChange,
  disabled,
  className,
  children,
}: TooltipProps) {
  // Controlled for its whole life: Radix warns when `open` flips between undefined and a value,
  // and `disabled` or `open` can change while the tooltip is mounted.
  const [inner, setInner] = useState(false);
  const empty = content == null || content === "" || content === false;
  if (empty && !shortcut) return children;
  return (
    <TooltipPrimitive.Root
      delayDuration={delayDuration}
      open={disabled ? false : (open ?? inner)}
      onOpenChange={(next) => {
        if (!disabled) setInner(next);
        onOpenChange?.(next);
      }}
    >
      {/* Hover opens the tooltip; keyboard focus does not. Radix's tooltip would also take the
          first Esc (hiding itself), so a focused icon button inside a dialog or drawer needed
          Esc twice. Every icon button has an aria-label and the shortcuts live under ?. */}
      <TooltipPrimitive.Trigger asChild onFocus={(e) => e.preventDefault()}>
        {children}
      </TooltipPrimitive.Trigger>
      <TooltipPrimitive.Portal>
        <TooltipPrimitive.Content
          data-wf="Tooltip"
          side={side}
          align={align}
          sideOffset={sideOffset}
          collisionPadding={8}
          className={cn(
            "z-tooltip max-w-[280px] select-none rounded-sm bg-fg px-2 py-1 text-sm text-bg leading-snug",
            "origin-(--radix-tooltip-content-transform-origin)",
            "data-[state=delayed-open]:fade-in-0 data-[state=delayed-open]:zoom-in-98 data-[state=delayed-open]:animate-in data-[state=delayed-open]:duration-100",
            "data-[state=closed]:fade-out-0 data-[state=closed]:animate-out data-[state=closed]:duration-75",
            className,
          )}
        >
          {shortcut ? (
            <span className="flex items-center gap-2">
              {!empty && <span className="min-w-0">{content}</span>}
              <Kbd combo={shortcut} tone="inverted" />
            </span>
          ) : (
            content
          )}
        </TooltipPrimitive.Content>
      </TooltipPrimitive.Portal>
    </TooltipPrimitive.Root>
  );
}
