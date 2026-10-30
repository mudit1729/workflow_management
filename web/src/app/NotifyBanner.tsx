// Opt-in for browser notifications when an agent is blocked on you. It lives in the nav now that
// the inbox is gone (plan D5). It shows only while it can help: there is a blocking request for
// you, notifications are off, the browser supports them and has not blocked them, and you have not
// said "Not now". It is a setting, not a request, so it is a quiet box without the accent.
import { BellRing } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui";
import { useInbox } from "@/lib/api";
import { cn } from "@/lib/cn";
import { usePrefs } from "@/lib/prefs";

const DISMISSED_KEY = "wf-notify-dismissed";
/** The key the inbox banner used; a dismissal made there still counts. */
const LEGACY_DISMISSED_KEY = "wf-inbox-notify-dismissed";

function readDismissed(): boolean {
  try {
    return (
      localStorage.getItem(DISMISSED_KEY) === "1" ||
      localStorage.getItem(LEGACY_DISMISSED_KEY) === "1"
    );
  } catch {
    return false;
  }
}

function writeDismissed() {
  try {
    localStorage.setItem(DISMISSED_KEY, "1");
  } catch {
    // Storage can be blocked. The banner then returns on the next visit, which is fine.
  }
}

function supported(): boolean {
  return typeof Notification !== "undefined" && Notification.permission !== "denied";
}

/** Blocking requests for me that nobody has answered yet: what the banner is about. */
export function useBlockingForMe(): number {
  const { mine } = useInbox();
  return mine.filter((i) => i.urgency === "blocking" && !i.answered).length;
}

export function NotifyBanner({ blocking, className }: { blocking: number; className?: string }) {
  const notifications = usePrefs((s) => s.notifications);
  const setNotifications = usePrefs((s) => s.setNotifications);
  const [dismissed, setDismissed] = useState(readDismissed);
  const [busy, setBusy] = useState(false);

  if (blocking === 0 || notifications || dismissed || !supported()) return null;

  const turnOn = async () => {
    setBusy(true);
    try {
      const permission =
        Notification.permission === "default"
          ? await Notification.requestPermission()
          : Notification.permission;
      if (permission === "granted") {
        setNotifications(true);
        toast.success("Notifications are on", {
          description: "You will hear about blocking requests.",
        });
      } else if (permission === "denied") {
        toast("Notifications are blocked", {
          description: "Allow them for this site in your browser settings.",
        });
      }
    } finally {
      setBusy(false);
    }
  };

  const dismiss = () => {
    writeDismissed();
    setDismissed(true);
  };

  return (
    <section
      data-wf="NotifyBanner"
      aria-label="Notifications"
      className={cn(
        "flex flex-col gap-1.5 rounded-md border border-border bg-bg p-2 text-fg-muted text-sm",
        className,
      )}
    >
      <p className="m-0 flex items-start gap-2">
        <BellRing
          aria-hidden
          size={14}
          strokeWidth={1.75}
          className="mt-[3px] shrink-0 text-fg-faint"
        />
        <span className="min-w-0">Get a browser notification when an agent is blocked on you.</span>
      </p>
      <div className="flex justify-end gap-1">
        <Button variant="ghost" size="sm" onClick={dismiss}>
          Not now
        </Button>
        <Button variant="secondary" size="sm" disabled={busy} onClick={turnOn}>
          Turn on
        </Button>
      </div>
    </section>
  );
}
