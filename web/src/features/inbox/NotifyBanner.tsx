// Opt-in for browser notifications when an agent is blocked on you. It shows only while it can help:
// there is a blocking request for you, notifications are off, the browser supports them and has not
// blocked them, and you have not dismissed the banner. It is a setting, not a request, so it is a
// quiet line (no accent) that the inbox puts below the requests.
import { BellRing, X } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Button, IconButton } from "@/components/ui";
import { usePrefs } from "@/lib/prefs";

const DISMISSED_KEY = "wf-inbox-notify-dismissed";

function readDismissed(): boolean {
  try {
    return localStorage.getItem(DISMISSED_KEY) === "1";
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

export function NotifyBanner({ blocking }: { blocking: number }) {
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
      className="flex items-center gap-2 rounded-md bg-subtle py-1 pr-1 pl-3 text-fg-muted text-sm"
    >
      <BellRing aria-hidden size={14} strokeWidth={1.75} className="shrink-0 text-fg-faint" />
      <p className="min-w-0 flex-1">Get a browser notification when an agent is blocked on you.</p>
      <Button variant="ghost" size="sm" disabled={busy} onClick={turnOn}>
        Turn on
      </Button>
      <IconButton
        size="sm"
        label="Dismiss"
        icon={<X size={14} strokeWidth={1.75} />}
        onClick={dismiss}
      />
    </section>
  );
}
