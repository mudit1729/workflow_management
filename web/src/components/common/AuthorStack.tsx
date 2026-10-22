// Overlapping avatars with a +N overflow.
import { Tooltip } from "@/components/ui";
import { cn } from "@/lib/cn";
import { AuthorChip } from "./AuthorChip";

export interface AuthorStackProps {
  handles: string[];
  max?: number;
  size?: "xs" | "sm";
  className?: string;
}

export function AuthorStack({ handles, max = 3, size = "sm", className }: AuthorStackProps) {
  const unique = [...new Set(handles.map((h) => h.replace(/^@/, "")))];
  if (unique.length === 0) return null;
  const overflow = unique.length > max;
  const shown = overflow ? unique.slice(0, max - 1) : unique;
  const rest = overflow ? unique.slice(max - 1) : [];
  const px = size === "xs" ? 14 : 16;

  return (
    <span
      data-wf="AuthorStack"
      aria-label={unique.map((h) => `@${h}`).join(", ")}
      className={cn("inline-flex shrink-0 items-center", className)}
    >
      {shown.map((h, i) => (
        <span
          key={h}
          className={cn("relative inline-flex", i > 0 && "-ml-1")}
          style={{ zIndex: shown.length - i }}
        >
          <AuthorChip
            handle={h}
            size={size}
            variant="avatar"
            className="[&>[data-wf=AuthorAvatar]]:ring-[1.5px] [&>[data-wf=AuthorAvatar]]:ring-bg"
          />
        </span>
      ))}
      {rest.length > 0 && (
        <Tooltip content={rest.map((h) => `@${h}`).join(", ")}>
          <span
            className="relative -ml-1 inline-flex items-center justify-center rounded-full bg-muted px-[3px] font-medium text-[9px] text-fg-muted tabular leading-none ring-[1.5px] ring-bg"
            style={{ height: px, minWidth: px }}
          >
            +{rest.length}
          </span>
        </Tooltip>
      )}
    </span>
  );
}
