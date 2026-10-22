// Markdown fragments (`*_md`) rendered with calm typography. Raw HTML is off and the output
// is sanitized. [[refs]] become RefLinks, @handles become author mentions, and
// ```wf-diagram fences become ArchifyCards.
import { Check } from "lucide-react";
import {
  type ComponentProps,
  createContext,
  lazy,
  type ReactNode,
  Suspense,
  useContext,
  useMemo,
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
        Diagram <code className="font-mono text-[11.5px]">{id || "(no id)"}</code> not found.
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
        "mr-1.5 inline-flex size-[12px] shrink-0 items-center justify-center rounded-[3px] border align-[-1px]",
        checked ? "border-accent bg-accent text-accent-fg" : "border-border-strong bg-bg",
      )}
    >
      {checked && <Check aria-hidden size={9} strokeWidth={3.25} />}
    </span>
  );
}

function hasClass(cls: unknown, name: string): boolean {
  return typeof cls === "string" && cls.split(" ").includes(name);
}

type P<K extends keyof React.JSX.IntrinsicElements> = ComponentProps<K> & ExtraProps;

function buildComponents(opts: { issueId?: string; compact: boolean }): Components {
  const { issueId, compact } = opts;
  const heading = "mt-2 first:mt-0 font-semibold text-fg leading-snug";
  return {
    p: ({ node: _n, className, ...p }: P<"p">) => <p className={cn("min-w-0", className)} {...p} />,
    h1: ({ node: _n, className, ...p }: P<"h1">) => (
      <h1 className={cn(heading, compact ? "text-base" : "text-md", className)} {...p} />
    ),
    h2: ({ node: _n, className, ...p }: P<"h2">) => (
      <h2 className={cn(heading, compact ? "text-sm" : "text-base", className)} {...p} />
    ),
    h3: ({ node: _n, className, ...p }: P<"h3">) => (
      <h3 className={cn(heading, compact ? "text-sm" : "text-base", className)} {...p} />
    ),
    h4: ({ node: _n, className, ...p }: P<"h4">) => (
      <h4 className={cn(heading, "font-medium text-fg-muted", className)} {...p} />
    ),
    h5: ({ node: _n, className, ...p }: P<"h5">) => (
      <h5 className={cn(heading, "font-medium text-fg-muted", className)} {...p} />
    ),
    h6: ({ node: _n, className, ...p }: P<"h6">) => (
      <h6 className={cn(heading, "font-medium text-fg-muted", className)} {...p} />
    ),
    ul: ({ node: _n, className, ...p }: P<"ul">) => (
      <ul
        className={cn(
          "list-disc pl-4 marker:text-fg-faint [&>li+li]:mt-0.5 [li>&]:mt-0.5",
          className,
        )}
        {...p}
      />
    ),
    ol: ({ node: _n, className, ...p }: P<"ol">) => (
      <ol
        className={cn(
          "list-decimal pl-4 marker:text-fg-faint marker:tabular-nums [&>li+li]:mt-0.5 [li>&]:mt-0.5",
          className,
        )}
        {...p}
      />
    ),
    li: ({ node: _n, className, ...p }: P<"li">) => (
      <li
        className={cn(
          "pl-0.5 [&>p+*]:mt-1",
          // A task item swaps its bullet for the checkbox, hung where the bullet would sit.
          hasClass(className, "task-list-item") && "-ml-4 list-none pl-0",
          className,
        )}
        {...p}
      />
    ),
    blockquote: ({ node: _n, className, ...p }: P<"blockquote">) => (
      <blockquote
        className={cn("border-border-strong border-l pl-3 text-fg-muted [&>*+*]:mt-2", className)}
        {...p}
      />
    ),
    hr: ({ node: _n, className, ...p }: P<"hr">) => (
      <hr className={cn("my-1 h-px border-0 bg-border", className)} {...p} />
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
        className={cn(
          "rounded-sm bg-muted px-1 py-px font-mono text-fg",
          compact ? "text-[11px]" : "text-[12px]",
          className,
        )}
        {...p}
      />
    ),
    pre: ({ node }: P<"pre">) => {
      const { lang, code } = fence(node);
      if (lang === "wf-diagram") return <DiagramFence id={code.trim()} compact={compact} />;
      return <CodeBlock code={code} lang={lang} compact={compact} />;
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
    table: ({ node: _n, className, ...p }: P<"table">) => (
      <div className="min-w-0 overflow-x-auto rounded-md border border-border">
        <table
          className={cn(
            "w-full border-collapse text-left [&_tbody_tr:last-child_td]:border-b-0",
            compact ? "text-xs" : "text-sm",
            className,
          )}
          {...p}
        />
      </div>
    ),
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

export interface MarkdownProseProps {
  md: string;
  /** Diagrams of the issue, for ```wf-diagram fences. */
  diagrams?: Diagram[];
  /** The issue holding the text; resolves [[#T-4]]. */
  issueId?: string;
  /** Tighter spacing, 12 px text (timeline bodies, cards). */
  compact?: boolean;
  className?: string;
  /** Rendered when `md` is empty. */
  empty?: ReactNode;
}

export function MarkdownProse({
  md,
  diagrams,
  issueId,
  compact = false,
  className,
  empty = null,
}: MarkdownProseProps) {
  // Stable across refetches: only `issueId` and `compact` shape the component types.
  const components = useMemo(() => buildComponents({ issueId, compact }), [issueId, compact]);
  if (!md.trim()) return <>{empty}</>;
  return (
    <div
      data-wf="MarkdownProse"
      className={cn(
        "flex min-w-0 flex-col break-words text-fg",
        compact ? "gap-1.5 text-sm leading-normal" : "gap-2 text-base leading-[1.55]",
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
    </div>
  );
}
