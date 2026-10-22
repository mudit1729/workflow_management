// Default route states: pending, error and not found. Calm, centered, one action.
import type { ErrorComponentProps } from "@tanstack/react-router";
import { Compass, Copy, LoaderCircle, RotateCw, TriangleAlert } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui";
import { useGo, usePathname } from "@/lib/nav";
import { copyText } from "./clipboard";

export function RoutePending() {
  return (
    <div
      data-wf="RoutePending"
      role="status"
      aria-live="polite"
      className="flex h-full min-h-0 w-full items-center justify-center gap-2 text-fg-faint text-sm"
    >
      <LoaderCircle size={14} strokeWidth={1.75} className="animate-spin" aria-hidden />
      Loading…
    </div>
  );
}

function errorText(error: unknown): { message: string; details: string } {
  const err = error instanceof Error ? error : new Error(String(error));
  const message = err.message || "An unknown error occurred.";
  const details = [
    `${err.name}: ${message}`,
    `URL: ${typeof location === "undefined" ? "" : location.href}`,
    `When: ${new Date().toISOString()}`,
    err.stack ? `\n${err.stack}` : "",
  ]
    .filter(Boolean)
    .join("\n");
  return { message, details };
}

export function RouteError({ error, reset }: ErrorComponentProps) {
  const { message, details } = errorText(error);
  const [copied, setCopied] = useState(false);

  async function copy() {
    if (!(await copyText(details, "Error details copied"))) return;
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1500);
  }

  return (
    <div
      data-wf="RouteError"
      role="alert"
      className="flex h-full min-h-0 w-full items-center justify-center overflow-auto p-6"
    >
      <div className="flex w-full max-w-md flex-col gap-3">
        <div className="flex items-center gap-2 text-fg">
          <TriangleAlert size={14} strokeWidth={1.75} className="text-danger" aria-hidden />
          <h1 className="font-medium text-md">This view failed to load</h1>
        </div>
        <p className="text-fg-muted">
          Your files are safe. Reload to try again, or copy the details for a bug report.
        </p>
        <pre className="max-h-40 overflow-auto whitespace-pre-wrap break-words rounded-md border border-border bg-subtle px-3 py-2 font-mono text-fg-muted text-sm">
          {message}
        </pre>
        <div className="flex items-center gap-2">
          <Button variant="primary" onClick={() => window.location.reload()}>
            <RotateCw size={14} strokeWidth={1.75} aria-hidden />
            Reload
          </Button>
          <Button variant="secondary" onClick={copy}>
            <Copy size={14} strokeWidth={1.75} aria-hidden />
            {copied ? "Copied" : "Copy details"}
          </Button>
          <Button variant="ghost" className="ml-auto" onClick={reset}>
            Try again
          </Button>
        </div>
      </div>
    </div>
  );
}

export function RouteNotFound() {
  const go = useGo();
  const path = usePathname();
  return (
    <div
      data-wf="RouteNotFound"
      className="flex h-full min-h-0 w-full items-center justify-center p-6"
    >
      <div className="flex max-w-sm flex-col items-center gap-3 text-center">
        <Compass size={20} strokeWidth={1.5} className="text-fg-faint" aria-hidden />
        <div className="flex flex-col gap-1">
          <h1 className="font-medium text-md">Nothing lives at this address</h1>
          <p className="text-fg-muted">
            <code className="rounded-sm bg-muted px-1 py-0.5 text-sm">{path}</code> is not a page in
            wf. The link may be old or mistyped.
          </p>
        </div>
        <Button variant="secondary" onClick={() => go.board()}>
          Go to Workflow
        </Button>
      </div>
    </div>
  );
}
