// "On this page": the headings of the page (levels 2 and 3), the one being read marked. In the
// right rail it is a list; between 1024 and 1279 px it moves into a popover in the page header.
import { List } from "lucide-react";
import { useEffect, useState } from "react";
import { Button, Popover, PopoverContent, PopoverTrigger } from "@/components/ui";
import type { PageHeading } from "@/lib/api/types";
import { cn } from "@/lib/cn";
import { libraryHref, useOpenPage } from "@/lib/nav";
import { outlineOf } from "./page-text";

/**
 * The anchor of the heading being read: the last one whose top has passed the top of the reading
 * area (with a little room). Follows the scroll of `scroller`.
 */
export function useActiveHeading(
  scroller: HTMLElement | null,
  anchors: string[],
  key: string,
): string | undefined {
  const [active, setActive] = useState<string>();
  // biome-ignore lint/correctness/useExhaustiveDependencies: `key` stands for the page.
  useEffect(() => {
    setActive(undefined);
    if (!scroller || anchors.length === 0) return;
    const update = () => {
      const top = scroller.getBoundingClientRect().top + 96;
      let current: string | undefined;
      for (const a of anchors) {
        const el = document.getElementById(a);
        if (el && el.getBoundingClientRect().top <= top) current = a;
      }
      setActive(current);
    };
    update();
    scroller.addEventListener("scroll", update, { passive: true });
    return () => scroller.removeEventListener("scroll", update);
  }, [scroller, key, anchors.join("|")]);
  return active;
}

export interface OutlineProps {
  alias: string;
  path: string;
  headings: PageHeading[];
  /** A glossary: its terms are listed alphabetically. */
  alphabetical?: boolean;
  active?: string;
  onPick?: () => void;
}

export function Outline({ alias, path, headings, alphabetical, active, onPick }: OutlineProps) {
  const open = useOpenPage();
  const items = outlineOf(headings, alphabetical);
  if (items.length === 0) return null;
  return (
    <ul data-wf="OnThisPage" className="m-0 flex list-none flex-col p-0">
      {items.map((h) => (
        <li key={h.anchor}>
          <a
            href={libraryHref(alias, path, h.anchor)}
            aria-current={active === h.anchor ? "location" : undefined}
            onClick={(e) => {
              if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
              e.preventDefault();
              open({ alias, path, anchor: h.anchor });
              onPick?.();
            }}
            className={cn(
              "block truncate border-l py-1 text-base leading-snug transition-colors duration-100 ease-wf",
              h.depth === 3 ? "pl-5" : "pl-3",
              active === h.anchor
                ? "border-fg font-medium text-fg"
                : "border-border text-fg-muted hover:border-border-strong hover:text-fg",
            )}
          >
            {h.text}
          </a>
        </li>
      ))}
    </ul>
  );
}

/** The outline as a button with a popover, for the page header where the rail is not shown. */
export function OutlinePopover(props: OutlineProps) {
  const [open, setOpen] = useState(false);
  if (outlineOf(props.headings).length === 0) return null;
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="secondary" size="sm" data-wf="OutlineButton">
          <List aria-hidden size={14} strokeWidth={1.75} />
          On this page
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-72 max-w-[calc(100vw-32px)] p-2">
        <Outline {...props} onPick={() => setOpen(false)} />
      </PopoverContent>
    </Popover>
  );
}
