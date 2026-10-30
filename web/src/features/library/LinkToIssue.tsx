// "Link to an issue…": pick an issue, and the page is added to its `## Links` so the page enters
// the issue's context bundle. A command list of the issues (type, ↑↓, ↵), no form.
import { Link2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { StatusIcon } from "@/components/common";
import {
  Button,
  Command,
  CommandEmpty,
  CommandInput,
  CommandItem,
  CommandList,
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui";
import { useSnapshot } from "@/lib/api";
import type { LibraryPage } from "@/lib/api/types";
import { linkPageToIssue } from "./link-to-issue";

/** The address a page is linked by: a workspace item keeps its `lib-` id. */
export const linkTargetOf = (page: Pick<LibraryPage, "address" | "item">) =>
  page.item ?? page.address;

export function LinkToIssue({ page }: { page: LibraryPage }) {
  const [open, setOpen] = useState(false);
  const issues = useSnapshot().data?.issues;

  const pick = async (id: string, title: string, path: string) => {
    setOpen(false);
    const result = await linkPageToIssue({
      issuePath: path,
      address: linkTargetOf(page),
      label: page.title,
    });
    if (result === "added") toast.success(`Linked to ${title}`, { description: page.title });
    else if (result === "present") toast(`${id} already links this page`);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="secondary" size="sm" data-wf="LinkToIssueButton">
          <Link2 aria-hidden size={14} strokeWidth={1.75} />
          Link to an issue…
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-[min(380px,calc(100vw-32px))] p-0">
        <Command
          filter={(value, search) => (value.toLowerCase().includes(search.toLowerCase()) ? 1 : 0)}
        >
          <CommandInput placeholder="Find an issue" />
          <CommandList>
            <CommandEmpty>
              <span className="px-3 text-fg-faint text-sm">
                {issues?.length
                  ? "No issue matches."
                  : "No issues yet. Load the sample data to try this."}
              </span>
            </CommandEmpty>
            {(issues ?? []).map((i) => (
              <CommandItem
                key={i.id}
                value={`${i.id} ${i.title} ${i.group_path.join(" ")}`}
                icon={<StatusIcon status={i.status} size={14} />}
                hint={<span className="font-mono text-xs">{i.id}</span>}
                onSelect={() => void pick(i.id, i.title, i.path)}
              >
                {i.title}
              </CommandItem>
            ))}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
