// Avatars in a row with a +N overflow. The 14 px (xs) tiles sit side by side with a hairline gap;
// the 16 px tiles overlap by 2 px behind a 1 px page-colored ring. Either way the initial or bot
// glyph of every tile stays readable: a deeper overlap cut them in half.
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
  const apart = size === "xs";

  return (
    <span
      data-wf="AuthorStack"
      role="img"
      aria-label={unique.map((h) => `@${h}`).join(", ")}
      className={cn("inline-flex shrink-0 items-center", apart && "gap-px", className)}
    >
      {shown.map((h, i) => (
        <span
          key={h}
          className={cn("relative inline-flex", !apart && i > 0 && "-ml-0.5")}
          style={{ zIndex: shown.length - i }}
        >
          <AuthorChip
            handle={h}
            size={size}
            variant="avatar"
            className={cn(
              !apart && "[&>[data-wf=AuthorAvatar]]:ring-1 [&>[data-wf=AuthorAvatar]]:ring-bg",
            )}
          />
        </span>
      ))}
      {rest.length > 0 && (
        <Tooltip content={rest.map((h) => `@${h}`).join(", ")}>
          <span
            className={cn(
              "relative inline-flex items-center justify-center rounded-full bg-muted px-[3px] font-medium text-fg-muted text-xs tabular leading-none",
              !apart && "-ml-0.5 ring-1 ring-bg",
            )}
            style={{ height: px, minWidth: px }}
          >
            +{rest.length}
          </span>
        </Tooltip>
      )}
    </span>
  );
}
