import { Switch as SwitchPrimitive } from "radix-ui";
import type { ComponentProps } from "react";
import { cn } from "@/lib/cn";

export function Switch({ className, ...props }: ComponentProps<typeof SwitchPrimitive.Root>) {
  return (
    <SwitchPrimitive.Root
      data-wf="Switch"
      className={cn(
        "inline-flex h-[16px] w-[28px] shrink-0 cursor-default items-center rounded-full p-[2px]",
        "bg-border-strong transition-colors duration-150 ease-wf",
        "hover:bg-[color-mix(in_srgb,var(--wf-border-strong)_80%,var(--wf-text))] data-[state=checked]:bg-accent data-[state=checked]:hover:brightness-110",
        "disabled:pointer-events-none disabled:opacity-50",
        className,
      )}
      {...props}
    >
      <SwitchPrimitive.Thumb
        className={cn(
          // The knob is the page color in light and the text color in dark, so it reads on both
          // the gray (off) and the accent (on) track. No shadow: only overlays carry one.
          "pointer-events-none block size-[12px] rounded-full bg-bg dark:bg-fg",
          "transition-transform duration-150 ease-wf data-[state=checked]:translate-x-[12px]",
        )}
      />
    </SwitchPrimitive.Root>
  );
}
