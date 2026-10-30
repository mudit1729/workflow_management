// The menu of a team library: open its repo, update it, remove it. It sits with the page actions
// and on the overview of a library that has no home page. Removing asks once, in a dialog.
import { useRouter } from "@tanstack/react-router";
import { Ellipsis, ExternalLink, LoaderCircle, RefreshCw, Trash2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import {
  Button,
  Dialog,
  DialogContent,
  DialogFooter,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  IconButton,
} from "@/components/ui";
import { removeLibrary } from "@/lib/api/library";
import type { LibraryInfo } from "@/lib/api/types";
import { useGo } from "@/lib/nav";
import { forgetCommit } from "./commits";
import { repoName } from "./flow";
import { useTeamUpdate } from "./useTeamUpdate";

const ICON = { size: 14, strokeWidth: 1.75 } as const;

/** The repo's page for the folder the library is read from. */
export function repoHref(library: Pick<LibraryInfo, "url" | "ref" | "root">): string | undefined {
  if (!library.url) return undefined;
  return `${library.url.replace(/\/+$/, "")}/tree/${library.ref ?? "HEAD"}${library.root ? `/${library.root}` : ""}`;
}

export function TeamLibraryMenu({ library }: { library: LibraryInfo }) {
  const update = useTeamUpdate(library);
  const [asking, setAsking] = useState(false);
  if (library.kind !== "team") return null;
  const href = repoHref(library);
  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <IconButton
            data-wf="TeamLibraryMenu"
            size="md"
            label="Library menu"
            icon={<Ellipsis {...ICON} />}
          />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          {href && (
            <DropdownMenuItem
              icon={<ExternalLink {...ICON} />}
              hint={library.url ? repoName(library.url) : undefined}
              onSelect={() => window.open(href, "_blank", "noopener,noreferrer")}
            >
              Open repository on GitHub
            </DropdownMenuItem>
          )}
          <DropdownMenuItem
            icon={<RefreshCw {...ICON} />}
            disabled={!update.behind || update.busy}
            hint={update.behind ? "A newer version is on GitHub" : "Up to date"}
            onSelect={() => void update.run()}
          >
            Update
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            tone="danger"
            icon={<Trash2 {...ICON} />}
            onSelect={() => setAsking(true)}
          >
            Remove library…
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <RemoveLibraryDialog library={library} open={asking} onOpenChange={setAsking} />
    </>
  );
}

/** "Remove this library?": it leaves the nav and `libraries.toml`; nothing changes on GitHub. */
export function RemoveLibraryDialog({
  library,
  open,
  onOpenChange,
}: {
  library: Pick<LibraryInfo, "alias" | "name" | "url">;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const go = useGo();
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function remove() {
    setBusy(true);
    try {
      await removeLibrary(library.alias);
      forgetCommit(library.alias);
      onOpenChange(false);
      // The library's pages are gone: leave them for the library home, unless the person already left.
      if (router.state.location.pathname.startsWith(`/lib/t/${library.alias}`)) await go.library();
      toast.success(`Removed ${library.name}`, {
        description: "It is no longer in your libraries.toml. Nothing changed on GitHub.",
      });
    } catch (err) {
      toast.error("Could not remove the library", {
        description: err instanceof Error ? err.message : "Try again in a moment.",
      });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(next) => !busy && onOpenChange(next)}>
      <DialogContent
        size="sm"
        title={`Remove ${library.name}?`}
        description="It leaves your libraries. Links to its pages show as broken. Nothing changes on GitHub."
        hideClose
      >
        <div data-wf="RemoveLibraryDialog" className="flex flex-col gap-3">
          {library.url && (
            <code className="break-all rounded-md border border-border bg-subtle px-2 py-1.5 font-mono text-fg-muted text-sm">
              {repoName(library.url)}
            </code>
          )}
          <DialogFooter className="mt-0">
            <Button variant="secondary" onClick={() => onOpenChange(false)} disabled={busy}>
              Cancel
            </Button>
            <Button variant="danger" onClick={() => void remove()} disabled={busy}>
              {busy && <LoaderCircle {...ICON} className="motion-safe:animate-spin" aria-hidden />}
              Remove library
            </Button>
          </DialogFooter>
        </div>
      </DialogContent>
    </Dialog>
  );
}
