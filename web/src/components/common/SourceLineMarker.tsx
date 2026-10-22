// The quiet tag that names the file line a block of a rendered page came from
// ("library/gotchas/rescan-subtrees.md:14"). It sits in the page's left gutter while the pointer
// is over a block. Clicking it opens that line: in the Workdatabase · Files view by default, or
// wherever the page's owner sends it (`onJump`).

import { useRouter } from "@tanstack/react-router";
import { ArrowUpRight } from "lucide-react";
import { useCallback } from "react";
import { cn } from "@/lib/cn";

/** Width of one 11 px mono character, with a little air. */
const CHAR = 6.6;

function base(path: string): string {
  return path.slice(path.lastIndexOf("/") + 1);
}

/**
 * The longest honest label for `room` px: the whole path, then the file name, then the end of
 * the path behind an ellipsis, then just the line. `full` is always the whole path and line.
 */
export function markerText(
  path: string,
  line: number,
  room: number,
): { short: string; full: string } {
  const full = `${path}:${line}`;
  const chars = Math.floor((room - 10) / CHAR);
  if (chars >= full.length) return { short: full, full };
  const name = `${base(path)}:${line}`;
  if (chars >= name.length) return { short: name, full };
  if (chars >= 7) return { short: `…${full.slice(-(chars - 1))}`, full };
  return { short: `:${line}`, full };
}

/** Open `path` at `line` in the Workdatabase · Files view. Does nothing outside a router. */
export function useOpenInFiles(): (path: string, line: number) => void {
  const router = useRouter({ warn: false }) as
    | { navigate: (o: { to: string; search: unknown }) => Promise<void> }
    | undefined;
  return useCallback(
    (path, line) => {
      void router?.navigate({ to: "/files", search: { path, line } });
    },
    [router],
  );
}

export interface SourceLineMarkerProps {
  path: string;
  line: number;
  /** Room in px for the text, right-aligned in the gutter. Below the full path, the tag shortens
   *  and shows the whole path on hover. */
  room?: number;
  onJump: (line: number) => void;
  className?: string;
}

export function SourceLineMarker({
  path,
  line,
  room = 360,
  onJump,
  className,
}: SourceLineMarkerProps) {
  const { short, full } = markerText(path, line, room);
  const shortened = short !== full;
  return (
    <button
      type="button"
      data-wf="SourceLineMarker"
      data-src-marker=""
      aria-label={`Open ${full}`}
      title={shortened ? undefined : `Open ${full}`}
      onClick={() => onJump(line)}
      className={cn(
        "group/marker relative inline-flex h-5 max-w-full cursor-default items-center justify-end rounded-sm",
        "font-mono text-xs text-fg-faint leading-none outline-none transition-colors duration-100 ease-wf",
        "hover:text-fg-muted focus-visible:ring-2 focus-visible:ring-focus",
        className,
      )}
    >
      <span
        className={cn(
          "whitespace-nowrap",
          shortened && "group-hover/marker:invisible group-focus-visible/marker:invisible",
        )}
      >
        {short}
      </span>
      {shortened && (
        <span
          aria-hidden
          className="absolute left-0 z-raised hidden h-5 items-center gap-1 whitespace-nowrap rounded-sm border border-border bg-bg px-1.5 text-fg-muted group-hover/marker:flex group-focus-visible/marker:flex"
        >
          {full}
          <ArrowUpRight
            aria-hidden
            size={12}
            strokeWidth={1.75}
            className="shrink-0 text-fg-faint"
          />
        </span>
      )}
    </button>
  );
}
