// The best passages for a question, with the matching words marked. This is the whole answer when
// no agent is connected (spec L3): the passages, and a button to connect an agent for a real one.
// Each passage opens its section in the panel.
import { Plug } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui";
import { Highlighted } from "@/features/library/Highlighted";
import type { LibraryPassage } from "@/lib/api/types";
import { cn } from "@/lib/cn";
import { SourcePreview } from "./SourcePreview";

export interface PassageListProps {
  passages: LibraryPassage[];
  /** What the prototype can do about an agent: connect one, or say there is none to connect. */
  onConnect: () => void;
}

export function PassageList({ passages, onConnect }: PassageListProps) {
  const [open, setOpen] = useState<string | undefined>();
  return (
    <section data-wf="AskPassages" aria-label="Best passages" className="flex flex-col gap-2">
      <h3 className="m-0 font-medium text-fg-muted text-sm">
        {passages.length === 0
          ? "No passage matches"
          : `The ${passages.length === 1 ? "best passage" : `${passages.length} best passages`}`}
      </h3>
      {passages.length === 0 ? (
        <p className="m-0 text-fg-muted text-sm">
          None of the chosen pages mentions these words. Try other words, or more pages.
        </p>
      ) : (
        <ol className="m-0 flex list-none flex-col gap-1.5 p-0">
          {passages.map((p) => {
            const here = open === p.address;
            return (
              <li key={p.address} className="flex min-w-0 flex-col gap-1.5">
                <button
                  type="button"
                  data-wf="AskPassage"
                  aria-expanded={here}
                  onClick={() => setOpen(here ? undefined : p.address)}
                  className={cn(
                    "flex min-w-0 cursor-default flex-col gap-1 rounded-md border border-border px-3 py-2 text-left",
                    "transition-colors duration-100 ease-wf hover:bg-subtle",
                    here && "bg-subtle",
                  )}
                >
                  <span className="flex min-w-0 items-baseline gap-1.5 text-base">
                    <span className="min-w-0 truncate font-medium text-fg">{p.pageTitle}</span>
                    {p.heading && (
                      <>
                        <span aria-hidden className="text-fg-faint">
                          ›
                        </span>
                        <span className="min-w-0 truncate text-fg-muted">{p.heading}</span>
                      </>
                    )}
                  </span>
                  <span className="line-clamp-3 text-fg-muted text-sm leading-snug">
                    <Highlighted text={p.snippet} marks={p.marks} />
                  </span>
                  <span className="truncate text-fg-faint text-xs">{p.library}</span>
                </button>
                {here && (
                  <SourcePreview
                    address={`${p.alias}:${p.path}`}
                    heading={p.heading ? p.heading.split(" › ").at(-1) : undefined}
                    onClose={() => setOpen(undefined)}
                  />
                )}
              </li>
            );
          })}
        </ol>
      )}
      <div className="flex flex-col items-start gap-1.5 pt-1">
        <Button variant="secondary" onClick={onConnect}>
          <Plug aria-hidden size={14} strokeWidth={1.75} />
          Connect an agent for an answer
        </Button>
        <p className="m-0 text-fg-faint text-sm">
          An agent reads these pages and answers with numbered sources.
        </p>
      </div>
    </section>
  );
}
