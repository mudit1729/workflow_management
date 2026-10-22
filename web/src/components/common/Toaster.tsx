// sonner, themed with the wf tokens. Bottom-right, at most three visible.
import { CircleCheck, CircleX, Info, LoaderCircle, TriangleAlert } from "lucide-react";
import { Toaster as Sonner } from "sonner";
import { useMediaQuery } from "@/lib/hooks";
import { usePrefs } from "@/lib/prefs";

export function Toaster() {
  const pref = usePrefs((s) => s.theme);
  const systemDark = useMediaQuery("(prefers-color-scheme: dark)");
  const theme = pref === "system" ? (systemDark ? "dark" : "light") : pref;

  return (
    <div data-wf="Toaster" className="contents">
      <Sonner
        theme={theme}
        position="bottom-right"
        visibleToasts={3}
        gap={8}
        offset={16}
        style={{ fontFamily: "var(--wf-font-sans)" }}
        icons={{
          success: <CircleCheck size={14} strokeWidth={1.75} className="text-status-done" />,
          error: <CircleX size={14} strokeWidth={1.75} className="text-danger" />,
          warning: <TriangleAlert size={14} strokeWidth={1.75} className="text-stale" />,
          info: <Info size={14} strokeWidth={1.75} className="text-fg-muted" />,
          loading: (
            <LoaderCircle size={14} strokeWidth={1.75} className="animate-spin text-fg-muted" />
          ),
        }}
        toastOptions={{
          unstyled: true,
          classNames: {
            toast:
              "flex w-(--width) items-center gap-2.5 rounded-lg bg-bg py-2.5 pr-2.5 pl-3 font-sans text-base text-fg shadow-pop",
            content: "flex min-w-0 flex-1 flex-col gap-0.5",
            title: "font-medium leading-snug",
            description: "text-fg-muted text-sm leading-snug",
            icon: "flex size-4 shrink-0 items-center justify-center self-start mt-px",
            actionButton:
              "h-6 shrink-0 cursor-default rounded-md bg-accent px-2 font-medium text-accent-fg text-sm hover:brightness-110",
            cancelButton:
              "h-6 shrink-0 cursor-default rounded-md px-2 font-medium text-fg-muted text-sm hover:bg-muted hover:text-fg",
            closeButton: "text-fg-faint hover:text-fg",
          },
        }}
      />
    </div>
  );
}
