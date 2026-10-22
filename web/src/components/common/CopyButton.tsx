// Copies text and confirms with a check for 1.5 s. The label is the tooltip and aria-label.
import { Check, Copy } from "lucide-react";
import { type MouseEvent, useEffect, useRef, useState } from "react";
import { Button, IconButton } from "@/components/ui";
import { cn } from "@/lib/cn";

export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    // Clipboard API blocked (insecure context, iframe): fall back to a hidden textarea.
    const el = document.createElement("textarea");
    el.value = text;
    el.setAttribute("readonly", "");
    el.style.position = "fixed";
    el.style.opacity = "0";
    document.body.appendChild(el);
    el.select();
    let ok = false;
    try {
      ok = document.execCommand("copy");
    } catch {
      ok = false;
    }
    el.remove();
    return ok;
  }
}

export interface CopyButtonProps {
  text: string;
  label: string;
  size?: "sm" | "md";
  /** `button` shows the label next to the icon. */
  variant?: "icon" | "button";
  className?: string;
}

export function CopyButton({
  text,
  label,
  size = "sm",
  variant = "icon",
  className,
}: CopyButtonProps) {
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);

  const onClick = async (e: MouseEvent) => {
    e.stopPropagation();
    const ok = await copyText(text);
    if (!ok) return;
    setCopied(true);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setCopied(false), 1500);
  };

  const icon = copied ? (
    <Check size={14} strokeWidth={2} className="text-status-done" />
  ) : (
    <Copy size={size === "sm" ? 13 : 14} strokeWidth={1.75} />
  );

  if (variant === "button") {
    return (
      <Button
        data-wf="CopyButton"
        variant="secondary"
        size={size === "sm" ? "sm" : "md"}
        onClick={onClick}
        className={className}
      >
        {icon}
        <span aria-live="polite">{copied ? "Copied" : label}</span>
      </Button>
    );
  }
  return (
    <IconButton
      data-wf="CopyButton"
      size={size}
      label={copied ? "Copied" : label}
      icon={icon}
      onClick={onClick}
      className={cn("text-fg-faint hover:text-fg", className)}
    />
  );
}
