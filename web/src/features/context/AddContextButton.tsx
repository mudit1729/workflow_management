// "Add context" in the Links section of the Goal tab: the same search the New file dialog uses.
// A pick is written at once (`add_links`), and the row shows up in Links when the board re-reads
// goal.md. The list stays open so several items can go in one visit.
import { Plus } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Button, Popover, PopoverContent, PopoverTrigger } from "@/components/ui";
import { useAddLinks } from "@/lib/api";
import { POPOVER_CLASS } from "./ContextPicker";
import { ContextSearch } from "./ContextSearch";
import { type ContextItem, DRAFT_NOTE, isDraft, itemKey, toLink } from "./types";

export interface AddContextButtonProps {
  issueId: string;
  /** Keys (`kind:target`) goal.md links already. */
  linked: ReadonlySet<string>;
  defaultOpen?: boolean;
}

export function AddContextButton({ issueId, linked, defaultOpen = false }: AddContextButtonProps) {
  const addLinks = useAddLinks(issueId);
  const [open, setOpen] = useState(defaultOpen);
  // Picked in this visit: held back until goal.md shows them, so a fast second click cannot add twice.
  const [picked, setPicked] = useState<ReadonlySet<string>>(new Set());
  const exclude = useMemo(() => new Set([...linked, ...picked]), [linked, picked]);

  async function pick(item: ContextItem) {
    const key = itemKey(item);
    setPicked((p) => new Set(p).add(key));
    const result = await addLinks({ links: [toLink(item)] });
    if (!result) {
      setPicked((p) => {
        const next = new Set(p);
        next.delete(key);
        return next;
      });
      return;
    }
    toast.success(`Linked ${item.kind === "file" ? item.label : item.title}`, {
      description: isDraft(item) ? DRAFT_NOTE : "Added under Links in goal.md.",
    });
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="sm" data-wf="AddContextButton" aria-haspopup="dialog">
          <Plus aria-hidden size={14} strokeWidth={1.75} />
          Add context
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className={POPOVER_CLASS}>
        <ContextSearch onPick={pick} exclude={exclude} issueId={issueId} active={open} />
      </PopoverContent>
    </Popover>
  );
}
