// Markdown fragments (`*_md`) rendered with calm typography. Raw HTML is off and the output
// is sanitized. [[refs]] become RefLinks, @handles become author mentions, and
// ```wf-diagram fences become ArchifyCards.
//
// With `source` set, the page is grounded in the file it came from: every block (heading,
// paragraph, list item, code block, table, quote, diagram) carries `data-src-line`, the 1-based
// line in the real file, and hovering a block shows a gutter tag with `path:line` that opens
// that line. Without `source` nothing changes.
import { Check } from "lucide-react";
import {
  type ComponentProps,
  createContext,
  lazy,
  type ReactNode,
  type PointerEvent as ReactPointerEvent,
  Suspense,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import Markdown, { type Components, defaultUrlTransform, type ExtraProps } from "react-markdown";
import rehypeSanitize, { defaultSchema, type Options as SanitizeSchema } from "rehype-sanitize";
import remarkGfm from "remark-gfm";
import { Skeleton } from "@/components/ui";
import type { Diagram } from "@/gen/types";
import { cn } from "@/lib/cn";
import { AuthorChip } from "./AuthorChip";
import { CodeBlock } from "./CodeBlock";
import { RefLink } from "./RefLink";
import { AUTHOR_PROTOCOL, REF_PROTOCOL, remarkWfRefs } from "./remark-wf";
import { SourceLineMarker, useOpenInFiles } from "./SourceLineMarker";

// Loaded lazily: keeps the diagram feature out of the common bundle and avoids an import cycle.
const ArchifyCard = lazy(() =>
  import("@/features/diagram").then((m) => ({ default: m.ArchifyCard })),
);

const schema: SanitizeSchema = {
  ...defaultSchema,
  protocols: {
    ...defaultSchema.protocols,
    href: [...(defaultSchema.protocols?.href ?? []), "wf-ref", "wf-author"],
  },
};

function urlTransform(url: string): string {
  if (url.startsWith(REF_PROTOCOL) || url.startsWith(AUTHOR_PROTOCOL)) return url;
  return defaultUrlTransform(url);
}

function decode(s: string): string {
  try {
    return decodeURIComponent(s);
  } catch {
    return s;
  }
}

type HastLike = {
  type: string;
  value?: unknown;
  tagName?: string;
  properties?: Record<string, unknown>;
  children?: HastLike[];
};

function textOf(n: HastLike): string {
  if (n.type === "text") return String(n.value ?? "");
  return (n.children ?? []).map(textOf).join("");
}

/** Language and text of a fenced block from the `pre > code` hast node. */
function fence(node: ExtraProps["node"]): { lang?: string; code: string } {
  const code = (node as unknown as HastLike | undefined)?.children?.find(
    (c) => c.type === "element" && c.tagName === "code",
  );
  if (!code) return { code: "" };
  const cls = code.properties?.className;
  const list = Array.isArray(cls) ? cls.map(String) : typeof cls === "string" ? cls.split(" ") : [];
  const lang = list.find((c) => c.startsWith("language-"))?.slice("language-".length);
  return { lang, code: textOf(code).replace(/\n$/, "") };
}

/**
 * The diagrams of the issue, read by `DiagramFence` through context instead of through the
 * memoized `components` map. A refetch that changes any diagram (archify turning available,
 * a re-render) then re-renders the fences in place; keying `components` on the array would
 * hand react-markdown new component types and remount every ArchifyCard (iframes reload,
 * an open dialog is lost).
 */
const DiagramsContext = createContext<Diagram[] | undefined>(undefined);

function DiagramFence({ id, compact }: { id: string; compact: boolean }) {
  const diagrams = useContext(DiagramsContext);
  const diagram = diagrams?.find((d) => d.id === id || d.hash === id);
  if (!diagram) {
    return (
      <div className="rounded-md border border-border border-dashed px-3 py-2.5 text-fg-faint text-sm">
        Diagram <code className="code-inline">{id || "(no id)"}</code> not found.
      </div>
    );
  }
  return (
    <Suspense fallback={<Skeleton className="h-[clamp(220px,32vh,420px)] w-full rounded-lg" />}>
      <ArchifyCard diagram={diagram} compact={compact} />
    </Suspense>
  );
}

function TaskBox({ checked }: { checked: boolean }) {
  return (
    <span
      role="img"
      aria-label={checked ? "Done" : "Not done"}
      className={cn(
        "mr-1.5 inline-flex size-[14px] shrink-0 items-center justify-center rounded-sm border-[1.5px] align-[-2px]",
        checked ? "border-accent bg-accent text-accent-fg" : "border-border-strong bg-bg",
      )}
    >
      {checked && <Check aria-hidden size={14} strokeWidth={1.75} />}
    </span>
  );
}

function hasClass(cls: unknown, name: string): boolean {
  return typeof cls === "string" && cls.split(" ").includes(name);
}

type P<K extends keyof React.JSX.IntrinsicElements> = ComponentProps<K> & ExtraProps;

/** Document typography: a docs page (14 px body) or a pane (13 px body); headings 16 / 14 / 13. */
export type ProseDocument = "page" | "pane";

/** Where the markdown came from, so every block can name its line. */
export interface MarkdownSource {
  /** Workspace-relative path of the file. */
  path: string;
  /** Lines of the file before `md` starts (a frontmatter block that was cut off). Default 0. */
  lineOffset?: number;
  /** Called with the file line of the block whose tag was clicked. Default: open the file at that
   *  line in the Workspace files view. */
  onJump?: (line: number) => void;
  /** Width in px of the left gutter that holds the tag (default 40). 0 turns the tag off. */
  gutter?: number;
}

/** The source line of a block, from its position in the markdown, as props for the element. */
function lineProps(node: ExtraProps["node"], offset: number | undefined) {
  const pos = node?.position;
  if (offset === undefined || !pos) return undefined;
  return { "data-src-line": pos.start.line + offset, "data-src-end": pos.end.line + offset };
}

interface BuildOptions {
  issueId?: string;
  compact: boolean;
  doc?: ProseDocument;
  /** Set when the blocks carry their source line. */
  offset?: number;
}

function buildComponents(opts: BuildOptions): Components {
  const { issueId, compact, doc, offset } = opts;
  const traced = offset !== undefined;
  const heading = doc
    ? "mt-3 first:mt-0 font-semibold text-fg leading-snug"
    : "mt-2 first:mt-0 font-semibold text-fg leading-snug";
  const sizes = doc
    ? { h1: "text-lg", h2: "text-md", h3: "text-base" }
    : compact
      ? { h1: "text-base", h2: "text-sm", h3: "text-sm" }
      : { h1: "text-md", h2: "text-base", h3: "text-base" };
  return {
    p: ({ node, className, ...p }: P<"p">) => (
      <p className={cn("min-w-0", className)} {...lineProps(node, offset)} {...p} />
    ),
    h1: ({ node, className, ...p }: P<"h1">) => (
      <h1 className={cn(heading, sizes.h1, className)} {...lineProps(node, offset)} {...p} />
    ),
    h2: ({ node, className, ...p }: P<"h2">) => (
      <h2 className={cn(heading, sizes.h2, className)} {...lineProps(node, offset)} {...p} />
    ),
    h3: ({ node, className, ...p }: P<"h3">) => (
      <h3 className={cn(heading, sizes.h3, className)} {...lineProps(node, offset)} {...p} />
    ),
    h4: ({ node, className, ...p }: P<"h4">) => (
      <h4
        className={cn(heading, "font-medium text-fg-muted", className)}
        {...lineProps(node, offset)}
        {...p}
      />
    ),
    h5: ({ node, className, ...p }: P<"h5">) => (
      <h5
        className={cn(heading, "font-medium text-fg-muted", className)}
        {...lineProps(node, offset)}
        {...p}
      />
    ),
    h6: ({ node, className, ...p }: P<"h6">) => (
      <h6
        className={cn(heading, "font-medium text-fg-muted", className)}
        {...lineProps(node, offset)}
        {...p}
      />
    ),
    ul: ({ node: _n, className, ...p }: P<"ul">) => (
      <ul
        className={cn(
          "list-disc pl-4 marker:text-fg-faint [&>li+li]:mt-0.5 [li>&]:mt-0.5",
          doc && "[&>li+li]:mt-1",
          className,
        )}
        {...p}
      />
    ),
    ol: ({ node: _n, className, ...p }: P<"ol">) => (
      <ol
        className={cn(
          "list-decimal pl-4 marker:text-fg-faint marker:tabular-nums [&>li+li]:mt-0.5 [li>&]:mt-0.5",
          doc && "[&>li+li]:mt-1",
          className,
        )}
        {...p}
      />
    ),
    li: ({ node, className, ...p }: P<"li">) => (
      <li
        className={cn(
          "pl-0.5 [&>p+*]:mt-1",
          // A task item swaps its bullet for the checkbox, hung where the bullet would sit.
          hasClass(className, "task-list-item") && "-ml-4 list-none pl-0",
          className,
        )}
        {...lineProps(node, offset)}
        {...p}
      />
    ),
    blockquote: ({ node, className, ...p }: P<"blockquote">) => (
      <blockquote
        className={cn("border-border-strong border-l pl-3 text-fg-muted [&>*+*]:mt-2", className)}
        {...lineProps(node, offset)}
        {...p}
      />
    ),
    hr: ({ node, className, ...p }: P<"hr">) => (
      <hr
        className={cn("my-1 h-px border-0 bg-border", className)}
        {...lineProps(node, offset)}
        {...p}
      />
    ),
    a: ({ node: _n, href, children, className, ...p }: P<"a">) => {
      if (href?.startsWith(REF_PROTOCOL))
        return <RefLink target={decode(href.slice(REF_PROTOCOL.length))} issueId={issueId} />;
      if (href?.startsWith(AUTHOR_PROTOCOL))
        return <AuthorChip handle={decode(href.slice(AUTHOR_PROTOCOL.length))} variant="text" />;
      const external = /^https?:\/\//i.test(href ?? "");
      return (
        <a
          href={href}
          target={external ? "_blank" : undefined}
          rel={external ? "noopener noreferrer" : undefined}
          className={cn(
            "text-accent underline decoration-accent/30 underline-offset-[3px] hover:decoration-accent",
            className,
          )}
          {...p}
        >
          {children}
        </a>
      );
    },
    strong: ({ node: _n, className, ...p }: P<"strong">) => (
      <strong className={cn("font-semibold text-fg", className)} {...p} />
    ),
    del: ({ node: _n, className, ...p }: P<"del">) => (
      <del className={cn("text-fg-faint", className)} {...p} />
    ),
    code: ({ node: _n, className, ...p }: P<"code">) => (
      <code
        className={cn("code-inline rounded-sm bg-muted px-1 py-px text-fg", className)}
        {...p}
      />
    ),
    pre: ({ node }: P<"pre">) => {
      const { lang, code } = fence(node);
      const block =
        lang === "wf-diagram" ? (
          <DiagramFence id={code.trim()} compact={compact} />
        ) : (
          <CodeBlock code={code} lang={lang} compact={compact} />
        );
      // The wrapper only exists on a traced page; an untraced one renders the block itself.
      return traced ? (
        <div className="min-w-0" {...lineProps(node, offset)}>
          {block}
        </div>
      ) : (
        block
      );
    },
    input: ({ node: _n, type, checked, ...p }: P<"input">) =>
      type === "checkbox" ? <TaskBox checked={Boolean(checked)} /> : <input type={type} {...p} />,
    img: ({ node: _n, className, alt, ...p }: P<"img">) => (
      <img
        alt={alt ?? ""}
        loading="lazy"
        className={cn("max-w-full rounded-md border border-border", className)}
        {...p}
      />
    ),
    table: ({ node, className, ...p }: P<"table">) => (
      <div
        className="min-w-0 overflow-x-auto rounded-md border border-border"
        {...lineProps(node, offset)}
      >
        <table
          className={cn(
            "w-full border-collapse text-left [&_tbody_tr:last-child_td]:border-b-0",
            compact ? "text-xs" : doc === "page" ? "text-base" : "text-sm",
            className,
          )}
          {...p}
        />
      </div>
    ),
    tr: ({ node, ...p }: P<"tr">) => <tr {...lineProps(node, offset)} {...p} />,
    th: ({ node: _n, className, ...p }: P<"th">) => (
      <th
        className={cn(
          "border-border border-b bg-subtle px-2.5 py-1.5 font-medium text-fg-muted",
          className,
        )}
        {...p}
      />
    ),
    td: ({ node: _n, className, ...p }: P<"td">) => (
      <td className={cn("border-border border-b px-2.5 py-1.5 align-top", className)} {...p} />
    ),
  };
}

// ---------------------------------------------------------------- source tags

interface Traced {
  line: number;
  top: number;
  height: number;
}

/**
 * Follows the pointer (and the keyboard focus) over the blocks of a traced page and tells which
 * block is under it: its source line and where it sits inside the page. The gutter is part of
 * the page's box, so a pointer on the way to the tag keeps the block it left.
 */
function useTrace(enabled: boolean, gutter: number, resetKey: string) {
  const root = useRef<HTMLDivElement>(null);
  const [traced, setTraced] = useState<Traced | null>(null);

  // Another text means other blocks: forget the old one.
  // biome-ignore lint/correctness/useExhaustiveDependencies: resetKey is the trigger.
  useEffect(() => setTraced(null), [resetKey]);

  const read = (block: Element | null) => {
    const el = root.current;
    if (!el || !block || !el.contains(block)) return;
    const line = Number((block as HTMLElement).dataset.srcLine);
    if (!Number.isFinite(line)) return;
    const box = el.getBoundingClientRect();
    const r = block.getBoundingClientRect();
    const next = { line, top: Math.round(r.top - box.top), height: Math.round(r.height) };
    setTraced((prev) =>
      prev && prev.line === next.line && prev.top === next.top && prev.height === next.height
        ? prev
        : next,
    );
  };

  const onPointerMove = (e: ReactPointerEvent) => {
    if (!enabled || e.pointerType === "touch") return;
    const target = e.target as Element;
    if (target.closest("[data-src-marker]")) return;
    let block = target.closest("[data-src-line]");
    if (!block || !root.current?.contains(block)) {
      // The pointer is in the gutter or a gap: take the block at the same height in the text.
      const box = root.current?.getBoundingClientRect();
      if (!box) return;
      block =
        document.elementFromPoint(box.left + gutter + 8, e.clientY)?.closest("[data-src-line]") ??
        null;
    }
    read(block);
  };

  return {
    root,
    traced: enabled ? traced : null,
    props: {
      onPointerMove,
      onPointerLeave: () => setTraced(null),
      onFocusCapture: (e: { target: EventTarget }) =>
        enabled ? read((e.target as Element).closest("[data-src-line]")) : undefined,
      onBlurCapture: (e: { relatedTarget: EventTarget | null }) => {
        if (!root.current?.contains(e.relatedTarget as Node | null)) setTraced(null);
      },
    },
  };
}

function SourceGutter({
  source,
  gutter,
  traced,
}: {
  source: MarkdownSource;
  gutter: number;
  traced: Traced | null;
}) {
  const openInFiles = useOpenInFiles();
  if (!traced) return null;
  const jump = source.onJump ?? ((line: number) => openInFiles(source.path, line));
  return (
    <div
      data-wf="SourceGutter"
      className="pointer-events-none absolute inset-y-0 left-0 z-raised"
      style={{ width: gutter }}
    >
      {gutter >= 40 && (
        <span
          aria-hidden
          className="absolute w-0.5 rounded-full bg-border-strong transition-[top,height] duration-100 ease-wf motion-reduce:transition-none"
          style={{ left: gutter - 8, top: traced.top, height: traced.height }}
        />
      )}
      <div
        className="pointer-events-auto absolute left-0 flex justify-end transition-[top] duration-100 ease-wf motion-reduce:transition-none"
        style={{ width: gutter, paddingRight: gutter >= 40 ? 14 : 3, top: traced.top + 1 }}
      >
        <SourceLineMarker
          path={source.path}
          line={traced.line}
          room={gutter - (gutter >= 40 ? 14 : 3)}
          onJump={jump}
        />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- component

export interface MarkdownProseProps {
  md: string;
  /** Diagrams of the issue, for ```wf-diagram fences. */
  diagrams?: Diagram[];
  /** The issue holding the text; resolves [[#T-4]]. */
  issueId?: string;
  /** Tighter spacing, 12 px text (timeline bodies, cards). */
  compact?: boolean;
  /** Document typography for a whole page of markdown. Sets the body size; see `ProseDocument`. */
  document?: ProseDocument;
  /** The file the text came from. Turns on the line tags (see the top of this file). */
  source?: MarkdownSource;
  className?: string;
  /** Rendered when `md` is empty. */
  empty?: ReactNode;
}

export function MarkdownProse({
  md,
  diagrams,
  issueId,
  compact = false,
  document: doc,
  source,
  className,
  empty = null,
}: MarkdownProseProps) {
  const offset = source ? (source.lineOffset ?? 0) : undefined;
  // Stable across refetches: only the options shape the component types.
  const components = useMemo(
    () => buildComponents({ issueId, compact, doc, offset }),
    [issueId, compact, doc, offset],
  );
  const gutter = source ? (source.gutter ?? 40) : 0;
  const trace = useTrace(Boolean(source) && gutter > 0, gutter, md);
  if (!md.trim()) {
    // Nothing to name when there is nothing to show; a placeholder gets the name, without a box.
    return empty == null ? null : (
      <div data-wf="MarkdownProse" data-empty="" className="contents">
        {empty}
      </div>
    );
  }
  return (
    <div
      ref={trace.root}
      data-wf="MarkdownProse"
      data-source={source?.path}
      {...(source ? trace.props : undefined)}
      style={gutter > 0 ? { paddingLeft: gutter } : undefined}
      className={cn(
        "flex min-w-0 flex-col break-words text-fg",
        source && "relative",
        compact && "[--wf-code-size:var(--wf-text-xs)]",
        doc === "page"
          ? "gap-3 text-md leading-[1.65]"
          : doc === "pane"
            ? "gap-2.5 text-base leading-[1.6]"
            : compact
              ? "gap-1.5 text-sm leading-normal"
              : "gap-2 text-base leading-[1.55]",
        className,
      )}
    >
      <DiagramsContext.Provider value={diagrams}>
        <Markdown
          remarkPlugins={[remarkGfm, remarkWfRefs]}
          rehypePlugins={[[rehypeSanitize, schema]]}
          components={components}
          urlTransform={urlTransform}
          skipHtml
        >
          {md}
        </Markdown>
      </DiagramsContext.Provider>
      {/* Last, so a heading that opens the page keeps its `first:` margin while the tag shows. */}
      {source && gutter > 0 && (
        <SourceGutter source={source} gutter={gutter} traced={trace.traced} />
      )}
    </div>
  );
}
