// Notable activity: a toast with an "Open" action, and a browser notification for blocking
// requests when the person opted in. Only needs-you, blocked and expired-lease events qualify.
import { toast } from "sonner";
import type { ActivityEvent, WorkspaceSnapshot } from "@/gen/types";
import { usePrefs } from "@/lib/prefs";

type Navigator = (issueId: string) => void;
let navigateTo: Navigator | undefined;

/**
 * The shell registers how to open an issue (drawer or page). The data layer never touches
 * `window.location`; with no navigator set the toast has no action.
 */
export function setLiveNavigator(fn: Navigator | undefined): void {
  navigateTo = fn;
}

function canNotify(): boolean {
  return (
    typeof Notification !== "undefined" &&
    Notification.permission === "granted" &&
    usePrefs.getState().notifications
  );
}

interface Copy {
  headline: string;
  description: string;
}

function copyFor(a: ActivityEvent, issueTitle: string): Copy {
  switch (a.notable) {
    case "needs_you":
      return { headline: `@${a.author} needs you`, description: `${a.title} · ${issueTitle}` };
    case "blocked":
      return { headline: `${issueTitle} is blocked`, description: `${a.title} · @${a.author}` };
    default:
      return { headline: `A lease expired on ${issueTitle}`, description: a.title };
  }
}

export function announce(a: ActivityEvent, snapshot: WorkspaceSnapshot | undefined): void {
  if (!a.notable) return;
  const issueTitle = snapshot?.issues.find((i) => i.id === a.issue_id)?.title ?? a.issue_id;
  const { headline, description } = copyFor(a, issueTitle);
  const open = navigateTo ? () => navigateTo?.(a.issue_id) : undefined;
  const options = {
    id: `${a.notable}:${a.issue_id}:${a.rev}`,
    description,
    duration: 8000,
    action: open ? { label: "Open", onClick: open } : undefined,
  };
  if (a.notable === "blocked") toast.error(headline, options);
  else if (a.notable === "lease_expired") toast.warning(headline, options);
  else toast.info(headline, options);

  if (a.notable === "needs_you" && canNotify()) {
    try {
      const n = new Notification(headline, { body: description, tag: `wf:${a.issue_id}` });
      n.onclick = () => {
        window.focus();
        open?.();
        n.close();
      };
    } catch {
      // Some browsers only allow notifications from a service worker. The toast already showed.
    }
  }
}
