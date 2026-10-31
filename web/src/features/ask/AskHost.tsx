// The shell mounts this once. It takes over `openAsk` for the library's "Ask about this page"
// button, and loads the panel (a lazy chunk) the first time someone asks, so the board and the
// issue views do not carry it.
import { lazy, Suspense, useEffect, useState } from "react";
import { setAskHandler } from "@/features/library/ask-hook";
import "./agent";
import { openAskPanel, useAsk } from "./store";

const AskPanel = lazy(() => import("./AskPanel").then((m) => ({ default: m.AskPanel })));

export function AskHost() {
  const open = useAsk((s) => s.open);
  const [wanted, setWanted] = useState(false);
  useEffect(() => {
    if (open) setWanted(true);
  }, [open]);
  useEffect(() => setAskHandler((address) => openAskPanel({ pages: [address] })), []);
  if (!open && !wanted) return null;
  return (
    <Suspense fallback={null}>
      <AskPanel />
    </Suspense>
  );
}
