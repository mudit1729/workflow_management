// Gallery chrome: the section frame, the variant stage (with its side-by-side theme
// wrappers), the sandboxed router and small loaders that hand real mock data to a variant.
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  RouterProvider,
} from "@tanstack/react-router";
import { Check, Copy } from "lucide-react";
import {
  type ComponentType,
  type CSSProperties,
  createContext,
  type ReactNode,
  type RefObject,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import { toast } from "sonner";
import { CopyButton, copyText } from "@/components/common";
import { Skeleton } from "@/components/ui";
import type {
  IssueDetail,
  IssueSummary,
  LibraryItemDetail,
  LibrarySummary,
  WorkspaceSnapshot,
} from "@/gen/types";
import { useIssue, useIssueSummary, useLibraryItem, useSnapshot } from "@/lib/api";
import { cn } from "@/lib/cn";

// ---------------------------------------------------------------- entries

export interface KitEntry {
  /** The data-wf name the user quotes in feedback. */
  name: string;
  group: string;
  /** Source file, relative to web/. */
  source: string;
  /** One sentence: why the element exists (contract Part 3 §6). */
  why: string;
  Body: ComponentType;
}

export const GROUPS = [
  "Foundations",
  "Shell",
  "Workflow · Board",
  "Workflow · Inbox",
  "Issue · Header",
  "Issue · Now",
  "Issue · Goal",
  "Issue · Plan",
  "Issue · Log",
  "Issue · Files",
  "Diagrams",
  "Workdatabase",
  "Shared",
  "Primitives",
] as const;

export type KitGroup = (typeof GROUPS)[number];

export function entry(
  group: KitGroup,
  name: string,
  source: string,
  why: string,
  Body: ComponentType,
): KitEntry {
  return { name, group, source, why, Body };
}

// ---------------------------------------------------------------- contexts

const SideContext = createContext(false);
const ElementContext = createContext("");
/** The content pane that scrolls; sections mount their bodies when they come near it. */
export const ScrollerContext = createContext<HTMLElement | null>(null);

/** True once `ref` has come within `margin` px of the scroller's viewport. Stays true. */
function useNearViewport(
  ref: RefObject<HTMLElement | null>,
  root: HTMLElement | null,
  margin: number,
): boolean {
  const [near, setNear] = useState(false);
  useEffect(() => {
    if (near) return;
    const el = ref.current;
    if (!el || !root) return;
    if (typeof IntersectionObserver === "undefined") {
      setNear(true);
      return;
    }
    const io = new IntersectionObserver(
      (records) => {
        if (records.some((r) => r.isIntersecting)) {
          setNear(true);
          io.disconnect();
        }
      },
      { root, rootMargin: `${margin}px 0px` },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [near, ref, root, margin]);
  return near;
}

/**
 * Mounts its children when they are at least partly on screen. For components that scroll
 * themselves into view on mount (they would drag the whole pane with them from far away).
 */
export function WhenVisible({
  children,
  minHeight = 160,
}: {
  children: ReactNode;
  minHeight?: number;
}) {
  const root = useContext(ScrollerContext);
  const ref = useRef<HTMLDivElement>(null);
  const near = useNearViewport(ref, root, 0);
  return (
    <div
      ref={ref}
      data-wf="WhenVisible"
      className="flex min-h-0 min-w-0 flex-1 flex-col"
      style={near ? undefined : { minHeight }}
    >
      {near ? children : null}
    </div>
  );
}

export function KitModeProvider({ side, children }: { side: boolean; children: ReactNode }) {
  return <SideContext value={side}>{children}</SideContext>;
}

export function useSideBySide(): boolean {
  return useContext(SideContext);
}

// ---------------------------------------------------------------- section

export function Section({ entry: e }: { entry: KitEntry }) {
  const Body = e.Body;
  const root = useContext(ScrollerContext);
  const bodyRef = useRef<HTMLDivElement>(null);
  // 103 sections with live data would be 30,000 nodes. Bodies mount a screen before they are seen.
  const near = useNearViewport(bodyRef, root, 900);
  return (
    <section
      id={`kit-${e.name}`}
      data-kit-section={e.name}
      data-wf="KitSection"
      aria-labelledby={`kit-h-${e.name}`}
      className="scroll-mt-4 border-border border-b py-8 first:pt-2"
    >
      <header className="flex min-w-0 flex-col gap-1.5">
        <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1">
          <h2 id={`kit-h-${e.name}`} className="font-mono font-semibold text-lg text-fg">
            {e.name}
          </h2>
          <CopyButton
            variant="button"
            size="sm"
            text={`${e.name}: `}
            label="Copy feedback ref"
            className="border-transparent text-fg-muted"
          />
          <span className="min-w-0 truncate font-mono text-fg-faint text-xs">{e.source}</span>
        </div>
        <p className="max-w-[72ch] text-fg-muted">
          <span className="text-fg-faint">Why it earns its place. </span>
          {e.why}
        </p>
      </header>
      <ElementContext value={e.name}>
        <div
          ref={bodyRef}
          className="mt-5 flex min-w-0 flex-wrap items-start gap-x-6 gap-y-6"
          style={near ? undefined : { minHeight: 240 }}
        >
          {near && <Body />}
        </div>
      </ElementContext>
    </section>
  );
}

// ---------------------------------------------------------------- variant

export interface VariantProps {
  /** The faint 11 px label above the variant; clicking it copies "Element › label: ". */
  label?: string;
  /** Content width in px (capped at the available width). */
  width?: number;
  /** Fixed height in px: renders the variant inside a bordered frame (for h-full components). */
  height?: number;
  /** Take a whole row. */
  fill?: boolean;
  /** An extra faint line under the label. */
  note?: ReactNode;
  /** The content already shows both themes itself: never double it in side-by-side mode. */
  both?: boolean;
  className?: string;
  children: ReactNode;
}

export function V({ label, width, height, fill, note, both, className, children }: VariantProps) {
  const side = useContext(SideContext) && !both;
  const element = useContext(ElementContext);
  const framed = height != null;

  const stage = (
    <div
      className={cn(
        "min-w-0 max-w-full",
        framed &&
          "relative flex min-h-0 flex-col overflow-hidden rounded-md border border-border bg-bg",
        className,
      )}
      style={{ width, height } as CSSProperties}
    >
      {children}
    </div>
  );

  return (
    <div
      data-wf="KitVariant"
      className={cn("flex min-w-0 max-w-full flex-col gap-1.5", fill && "w-full")}
    >
      {(label || note) && (
        <div className="flex min-w-0 flex-col gap-0.5">
          {label && <VariantLabel element={element} label={label} />}
          {note && <p className="max-w-[60ch] text-fg-faint text-xs">{note}</p>}
        </div>
      )}
      {side ? (
        <div className="flex min-w-0 max-w-full flex-wrap items-start gap-2">
          <ThemeBox theme="light" framed={framed}>
            {stage}
          </ThemeBox>
          <ThemeBox theme="dark" framed={framed}>
            {stage}
          </ThemeBox>
        </div>
      ) : (
        stage
      )}
    </div>
  );
}

function ThemeBox({
  theme,
  framed,
  children,
}: {
  theme: "light" | "dark";
  framed: boolean;
  children: ReactNode;
}) {
  return (
    <div
      data-theme={theme}
      data-wf="KitThemeBox"
      className={cn(
        "relative min-w-0 max-w-full bg-bg text-fg",
        !framed && "rounded-md border border-border p-2 pt-5",
        framed && "pt-4",
      )}
    >
      <span className="pointer-events-none absolute top-1 left-2 select-none text-[10px] text-fg-faint leading-none">
        {theme}
      </span>
      {children}
    </div>
  );
}

function VariantLabel({ element, label }: { element: string; label: string }) {
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);
  const text = element ? `${element} › ${label}: ` : `${label}: `;
  return (
    <button
      type="button"
      title={`Copy “${text}”`}
      onClick={async () => {
        if (!(await copyText(text))) return;
        setCopied(true);
        clearTimeout(timer.current);
        timer.current = setTimeout(() => setCopied(false), 1500);
      }}
      className="group/label inline-flex min-w-0 max-w-full cursor-default items-center gap-1 self-start rounded-sm text-fg-faint text-xs leading-4 transition-colors duration-100 hover:text-fg-muted"
    >
      <span className="min-w-0 truncate">{label}</span>
      {copied ? (
        <Check aria-hidden size={14} strokeWidth={1.75} className="shrink-0 text-status-done" />
      ) : (
        <Copy
          aria-hidden
          size={14}
          strokeWidth={1.75}
          className="shrink-0 opacity-0 transition-opacity duration-100 group-hover/label:opacity-100"
        />
      )}
      <span className="sr-only">{copied ? "Copied" : "Copy feedback ref"}</span>
    </button>
  );
}

// ---------------------------------------------------------------- sandbox router
//
// Components navigate through useOpenIssue, useBoardSearch, useIssueTab and friends. In the
// gallery those calls land in a private in-memory router, so clicking a card or a link never
// leaves /kit and one variant's tab or filter never leaks into another.

const SandboxChildren = createContext<ReactNode>(null);

function SandboxHost() {
  return (
    <div data-wf="Sandbox" className="contents">
      {useContext(SandboxChildren)}
    </div>
  );
}

function makeSandboxRouter(path: string) {
  const root = createRootRoute({ component: SandboxHost });
  const index = createRoute({ getParentRoute: () => root, path: "/" });
  const rest = createRoute({ getParentRoute: () => root, path: "$" });
  const router = createRouter({
    routeTree: root.addChildren([index, rest]),
    history: createMemoryHistory({ initialEntries: [path] }),
    scrollRestoration: false,
  });
  return router;
}

export function Sandbox({
  children,
  path = "/w",
  quiet = false,
}: {
  children: ReactNode;
  /** Where the private router starts. */
  path?: string;
  /** Do not toast when the element navigates (nested sandboxes). */
  quiet?: boolean;
}) {
  const [router] = useState(() => makeSandboxRouter(path));

  useEffect(() => {
    if (quiet) return;
    let last = router.state.location.href;
    return router.subscribe("onResolved", () => {
      const href = router.state.location.href;
      if (href === last) return;
      last = href;
      toast("Navigation stays in the kit", {
        id: "kit-sandbox-nav",
        description: `The element asked to go to ${href}`,
      });
    });
  }, [router, quiet]);

  return (
    <SandboxChildren value={children}>
      <RouterProvider router={router} />
    </SandboxChildren>
  );
}

// ---------------------------------------------------------------- data loaders

export function Loading({ height = 56 }: { height?: number }) {
  return <Skeleton className="w-full rounded-md" style={{ height, minWidth: 200 }} />;
}

/** The mock world has no such item (it was reset, or the id changed): say so, once loading is over. */
export function Missing({ what }: { what: string }) {
  return (
    <p
      data-wf="KitMissing"
      className="rounded-md border border-border border-dashed px-3 py-2 text-fg-faint text-sm"
    >
      {what} is not in the mock data.
    </p>
  );
}

export function WithSnapshot({
  children,
}: {
  children: (snapshot: WorkspaceSnapshot) => ReactNode;
}) {
  const { data } = useSnapshot();
  if (!data) return <Loading />;
  return <>{children(data)}</>;
}

export function WithSummary({
  id,
  children,
}: {
  id: string;
  children: (issue: IssueSummary) => ReactNode;
}) {
  const { data: snapshot } = useSnapshot();
  const issue = useIssueSummary(id);
  if (!issue) return snapshot ? <Missing what={id} /> : <Loading />;
  return <>{children(issue)}</>;
}

export function WithDetail({
  id,
  children,
}: {
  id: string;
  children: (detail: IssueDetail) => ReactNode;
}) {
  const { data, isError } = useIssue(id);
  if (!data) return isError ? <Missing what={id} /> : <Loading height={160} />;
  return <>{children(data)}</>;
}

export function WithLibrarySummary({
  id,
  children,
}: {
  id: string;
  children: (item: LibrarySummary) => ReactNode;
}) {
  const { data } = useSnapshot();
  const item = data?.library.find((l) => l.id === id);
  if (!item) return data ? <Missing what={id} /> : <Loading />;
  return <>{children(item)}</>;
}

export function WithLibraryItem({
  id,
  children,
}: {
  id: string;
  children: (item: LibraryItemDetail) => ReactNode;
}) {
  const { data, isError } = useLibraryItem(id);
  if (!data) return isError ? <Missing what={id} /> : <Loading height={160} />;
  return <>{children(data)}</>;
}

// ---------------------------------------------------------------- small parts

/** A row of inline items with a gap. */
export function Row({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div data-wf="Row" className={cn("flex flex-wrap items-center gap-3", className)}>
      {children}
    </div>
  );
}

/** A faint caption used inside variants (axis labels in tables). */
export function Caption({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <span data-wf="Caption" className={cn("text-fg-faint text-xs", className)}>
      {children}
    </span>
  );
}
