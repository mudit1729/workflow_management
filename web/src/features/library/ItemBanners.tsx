// A workspace library item's state, said above the page: a draft waits for a reviewer (Approve),
// a retired item is no longer read by agents, an overdue one needs a look. The same banners the
// item pane had before the library became a wiki.
import { Check, FilePen, Hourglass, Info, type LucideIcon } from "lucide-react";
import { type ReactNode, useState } from "react";
import { toast } from "sonner";
import { RefLink } from "@/components/common";
import { Button, Tooltip } from "@/components/ui";
import type { LibraryItemDetail } from "@/gen/types";
import { useApproveLibrary } from "@/lib/api";
import { cn } from "@/lib/cn";
import { formatDate } from "./meta";

/** A stub: the dashboard has no retire action yet. The tooltip says where the status lives. */
function RetireButton() {
  return (
    <Tooltip content="Retiring is not a dashboard action yet. Set status: retired in the item’s file.">
      <span className="inline-flex">
        <Button variant="ghost" size="sm" disabled>
          Retire
        </Button>
      </span>
    </Tooltip>
  );
}

type Tone = "accent" | "neutral" | "stale";

const TONE: Record<Tone, { box: string; icon: string }> = {
  accent: { box: "border-accent/20 bg-accent-subtle", icon: "text-accent" },
  neutral: { box: "border-border bg-subtle", icon: "text-fg-faint" },
  stale: { box: "border-stale/30 bg-stale/10", icon: "text-stale-text" },
};

function Banner({
  tone,
  icon: Icon,
  actions,
  children,
}: {
  tone: Tone;
  icon: LucideIcon;
  actions?: ReactNode;
  children: ReactNode;
}) {
  const t = TONE[tone];
  return (
    <div
      data-wf="LibraryBanner"
      data-tone={tone}
      className={cn("flex flex-col gap-2.5 rounded-md border px-3 py-2.5 text-base", t.box)}
    >
      <p className="m-0 flex items-start gap-2 text-fg leading-5">
        <Icon
          aria-hidden
          size={14}
          strokeWidth={1.75}
          className={cn("mt-[3px] shrink-0", t.icon)}
        />
        <span className="min-w-0">{children}</span>
      </p>
      {actions && <div className="flex flex-wrap items-center gap-1.5 pl-[22px]">{actions}</div>}
    </div>
  );
}

export function ItemBanners({ detail }: { detail: LibraryItemDetail }) {
  const s = detail.summary;
  const approve = useApproveLibrary();
  const [busy, setBusy] = useState(false);
  const overdue = s.review_overdue && s.status !== "retired";

  const onApprove = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const result = await approve({ id: s.id, base_rev: detail.edit.rev });
      if (result) {
        toast.success(`${s.id} approved`, {
          description: "Agents can now read it in their context.",
        });
      }
    } finally {
      setBusy(false);
    }
  };

  if (s.status === "draft") {
    return (
      <Banner
        tone="accent"
        icon={FilePen}
        actions={
          <>
            <Button variant="primary" size="sm" disabled={busy} onClick={onApprove}>
              <Check aria-hidden size={14} strokeWidth={1.75} />
              {busy ? "Approving…" : "Approve"}
            </Button>
            <RetireButton />
          </>
        }
      >
        <strong className="font-medium">Draft</strong> — agents do not see this item until a
        reviewer approves it.
      </Banner>
    );
  }
  if (s.status === "retired") {
    return (
      <Banner tone="neutral" icon={Info}>
        <strong className="font-medium">Retired</strong> — agents no longer read this item.
        {detail.superseded_by && (
          <>
            {" "}
            Replaced by <RefLink target={detail.superseded_by} />.
          </>
        )}
      </Banner>
    );
  }
  if (overdue) {
    return (
      <Banner tone="stale" icon={Hourglass}>
        Past its review date (Q013)
        {s.review_after && <> — it was due on {formatDate(s.review_after)}</>}. Check that it is
        still true.
      </Banner>
    );
  }
  return null;
}
