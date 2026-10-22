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
          "pointer-events-none block size-[12px] rounded-full bg-white shadow-[0_1px_2px_rgb(0_0_0/0.2)]",
          "transition-transform duration-150 ease-wf data-[state=checked]:translate-x-[12px]",
        )}
      />
    </SwitchPrimitive.Root>
  );
}
