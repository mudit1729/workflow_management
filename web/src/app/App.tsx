// App root: providers, router, toasts, and document-level sync (theme, density,
// tab title). Overlays that need the router (palette, dialogs, move gate, prototype
// controls) are mounted by AppShell, inside the router.
import { QueryClientProvider } from "@tanstack/react-query";
import { RouterProvider } from "@tanstack/react-router";
import { useEffect } from "react";
import { Toaster } from "@/components/common";
import { TooltipProvider } from "@/components/ui";
import { queryClient, useInbox, useSnapshot } from "@/lib/api";
import { startLive } from "@/lib/live";
import { resolveTheme, usePrefs } from "@/lib/prefs";
import { router } from "./router";

export function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <DocumentSync />
        <RouterProvider router={router} />
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

function DocumentSync() {
  useLiveConnection();
  useThemeSync();
  useDensitySync();
  useTabTitle();
  return null;
}

// startLive subscribes once for the app's lifetime. The flag keeps StrictMode's
// double effect from opening a second stream.
let liveStarted = false;
function useLiveConnection() {
  useEffect(() => {
    if (liveStarted) return;
    liveStarted = true;
    startLive(queryClient);
  }, []);
}

/** Swap data-theme without animating every color transition on the page. */
function applyTheme(theme: "light" | "dark") {
  const root = document.documentElement;
  if (root.dataset.theme === theme) return;
  const freeze = document.createElement("style");
  freeze.textContent = "*,*::before,*::after{transition:none!important}";
  document.head.appendChild(freeze);
  root.dataset.theme = theme;
  root.getBoundingClientRect(); // flush styles before transitions come back
  requestAnimationFrame(() => freeze.remove());
}

function useThemeSync() {
  const theme = usePrefs((s) => s.theme);
  useEffect(() => {
    const apply = () => applyTheme(resolveTheme(theme));
    apply();
    if (theme !== "system") return;
    // Follow the OS live while the preference is "system".
    const media = matchMedia("(prefers-color-scheme: dark)");
    media.addEventListener("change", apply);
    return () => media.removeEventListener("change", apply);
  }, [theme]);
}

function useDensitySync() {
  const density = usePrefs((s) => s.density);
  useEffect(() => {
    document.documentElement.dataset.density = density;
  }, [density]);
}

/** "(3) wf · <workspace>" where 3 = my open needs-you requests; no count at zero. */
function useTabTitle() {
  const { count } = useInbox();
  const name = useSnapshot().data?.config.name;
  useEffect(() => {
    const base = name ? `wf · ${name}` : "wf";
    document.title = count > 0 ? `(${count}) ${base}` : base;
  }, [count, name]);
}
