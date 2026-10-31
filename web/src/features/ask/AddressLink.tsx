// `[[platform:runbooks/rotate-keys.md#rollback]]` in an issue's text: a link to a page of a team,
// personal or workspace library, titled like the page, dashed when the page is gone. `RefLink`
// hands it every `[[alias:path]]`, so a learning that was saved from an answer (its `sources:`),
// and any note that cites a page, opens the page in the wiki.
import { BookOpen } from "lucide-react";
import { Tooltip } from "@/components/ui";
import { parseAddress } from "@/features/library/address";
import { useLibraryPage } from "@/lib/api";
import { cn } from "@/lib/cn";
import { libraryHref, useOpenPage } from "@/lib/nav";

export function AddressLink({ target, className }: { target: string; className?: string }) {
  const at = parseAddress(target);
  const open = useOpenPage();
  const query = useLibraryPage(at?.alias, at?.path);
  const page = query.data;
  if (!at || query.isError)
    return (
      <Tooltip content="Page not found (F009)">
        <span
          data-wf="RefLink"
          data-dangling=""
          className={cn(
            "code-inline text-fg-muted underline decoration-dashed decoration-fg-faint underline-offset-[3px]",
            className,
          )}
        >
          [[{target}]]
        </span>
      </Tooltip>
    );
  const heading = at.anchor ? page?.headings.find((h) => h.anchor === at.anchor)?.text : undefined;
  const name = at.path.slice(at.path.lastIndexOf("/") + 1);
  return (
    <Tooltip content={`${page?.library ?? at.alias} · ${at.alias}:${at.path}`}>
      <a
        data-wf="RefLink"
        href={libraryHref(at.alias, at.path, at.anchor)}
        onClick={(e) => {
          e.stopPropagation();
          if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
          e.preventDefault();
          void open({ alias: at.alias, path: at.path, anchor: at.anchor });
        }}
        className={cn(
          "inline items-baseline rounded-sm font-medium text-fg underline decoration-border-strong decoration-1 underline-offset-[3px] transition-colors duration-100 hover:bg-muted hover:decoration-fg-muted",
          className,
        )}
      >
        <BookOpen
          aria-hidden
          size={12}
          strokeWidth={1.75}
          className="mr-1 inline-block align-[-1px] text-fg-muted"
        />
        {page?.title ?? name}
        {heading && <span className="font-normal text-fg-muted"> › {heading}</span>}
      </a>
    </Tooltip>
  );
}
