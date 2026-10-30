// Markdown fragments (`*_md`) rendered with calm typography. Raw HTML is off and the output
// is sanitized. [[refs]] become RefLinks, @handles become author mentions, and
// ```wf-diagram fences become ArchifyCards.
//
// With `wiki` set, the text is a page of a library (docs/plan/proposals/libraries-spec.md): headings
// get anchors, `[[path]]`, `[[alias:path]]` and relative links go to pages (dashed when broken),
// `> [!NOTE]` quotes are callouts, and a paragraph that is only an image, a video file or a
// YouTube, Vimeo or Loom link becomes a figure, a player or a click-to-load card (MarkdownMedia).
//
// With `source` set, the page is grounded in the file it came from: every block (heading,
// paragraph, list item, code block, table, quote, diagram) carries `data-src-line`, the 1-based
// line in the real file, and hovering a block shows a gutter tag with `path:line` that opens
// that line. Without `source` nothing changes.
import {
  Check,
  CircleAlert,
  Info,
  Lightbulb,
  type LucideIcon,
  MessageSquareWarning,
  OctagonAlert,
} from "lucide-react";
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
import { Skeleton, Tooltip } from "@/components/ui";
import { linkForm } from "@/features/library/address";
import { headingsOf } from "@/features/library/anchors";
import type { Diagram } from "@/gen/types";
import type { LinkForm, PageLink as PageLinkData, PageMedia } from "@/lib/api/types";
import { cn } from "@/lib/cn";
import { libraryHref, useOpenPage } from "@/lib/nav";
import { AuthorChip } from "./AuthorChip";
import { CodeBlock } from "./CodeBlock";
import { EmbedCard, MediaFigure, parseEmbed } from "./MarkdownMedia";
import { RefLink } from "./RefLink";
import {
  AUTHOR_PROTOCOL,
  type CalloutKind,
  REF_PROTOCOL,
  remarkCallouts,
  remarkWfRefs,
} from "./remark-wf";
import { SourceLineMarker, useOpenInFiles } from "./SourceLineMarker";

// Loaded lazily: keeps the diagram feature out of the common bundle and avoids an import cycle.
const ArchifyCard = lazy(() =>
  import("@/features/diagram").then((m) => ({ default: m.ArchifyCard })),
);

const schema: SanitizeSchema = {
  ...defaultSchema,
  attributes: {
    ...defaultSchema.attributes,
    // `> [!NOTE]` quotes carry their kind for the blockquote component.
    blockquote: [...(defaultSchema.attributes?.blockquote ?? []), "dataCallout"],
  },
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

// ---------------------------------------------------------------- a page of a library

/** The page the text belongs to: how its links resolve and where its media is. */
export interface ProseWiki {
  alias: string;
  /** Root-relative path of the page. */
  path: string;
  /** Its links, resolved (`LibraryPage.links`). */
  links: PageLinkData[];
  /** Its media by `src` (`LibraryPage.media`). */
  media: Record<string, PageMedia>;
}

interface WikiValue {
  alias: string;
  path: string;
  link: (form: LinkForm, raw: string) => PageLinkData | undefined;
  media: (src: string) => PageMedia | undefined;
  /** The anchor of each heading by its line in the text. */
  anchors: Map<number, string>;
}

/** Read through context for the same reason as the diagrams: a new page must not remount blocks. */
const WikiContext = createContext<WikiValue | undefined>(undefined);

/** Why a link goes nowhere, in words. */
function brokenReason(link: PageLinkData | undefined, fallback: string): string {
  switch (link?.missing) {
    case "heading":
      return `No heading #${link.anchor ?? fallback} on that page`;
    case "library":
      return `No library named ${link.alias ?? fallback}`;
    case "item":
      return `No library item ${link.item ?? fallback}`;
    case "issue":
      return `No issue ${link.issue ?? fallback}`;
    default:
      return `No page ${link?.path || fallback} in the library`;
  }
}

const pageLinkClass =
  "text-accent underline decoration-accent/30 underline-offset-[3px] hover:decoration-accent";
const brokenClass =
  "text-fg-muted underline decoration-dashed decoration-fg-faint underline-offset-[3px]";

/** A link to a page of a library. Dashed when the page or the heading is not there. */
function PageLink({
  link,
  raw,
  children,
  className,
}: {
  link: PageLinkData | undefined;
  raw: string;
  children: ReactNode;
  className?: string;
}) {
  const open = useOpenPage();
  if (!link?.alias || link.path === undefined || (!link.ok && link.missing !== "heading")) {
    return (
      <Tooltip content={brokenReason(link, raw)}>
        <span data-wf="PageLink" data-broken="" className={cn(brokenClass, className)}>
          {children}
        </span>
      </Tooltip>
    );
  }
  const { alias, path, anchor } = link;
  const a = (
    <a
      data-wf="PageLink"
      data-broken={link.ok ? undefined : ""}
      href={libraryHref(alias, path, anchor)}
      onClick={(e) => {
        if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
        e.preventDefault();
        e.stopPropagation();
        open({ alias, path, anchor });
      }}
      className={cn(link.ok ? pageLinkClass : brokenClass, className)}
    >
      {children}
    </a>
  );
  return link.ok ? a : <Tooltip content={brokenReason(link, raw)}>{a}</Tooltip>;
}

/** `[[target]]` in a page of a library: a page link, or an issue or library item as anywhere else. */
function WikiRef({
  target,
  issueId,
  label,
}: {
  target: string;
  issueId?: string;
  label: ReactNode;
}) {
  const wiki = useContext(WikiContext);
  const form = linkForm(target, "wiki");
  const link = wiki?.link(form, target);
  // Issues and library items keep their own links (status, kind); a name that only looks like an
  // issue id but is a page goes to the page, and so does a library item, straight to its page.
  const pageForm = form === "wiki" || form === "alias" || form === "anchor";
  if (!wiki || !(pageForm || (link?.ok && link.path !== undefined && !link.issue)))
    return <RefLink target={target} issueId={issueId} />;
  const explicit = typeof label === "string" && label !== target;
  return (
    <PageLink link={link} raw={target}>
      {explicit ? label : (link?.title ?? target)}
    </PageLink>
  );
}

const CALLOUT: Record<CalloutKind, { icon: LucideIcon; label: string; tone: string; box: string }> =
  {
    note: { icon: Info, label: "Note", tone: "text-fg-muted", box: "border-border" },
    tip: { icon: Lightbulb, label: "Tip", tone: "text-success-text", box: "border-border" },
    important: {
      icon: CircleAlert,
      label: "Important",
      tone: "text-accent",
      box: "border-accent/30",
    },
    warning: {
      icon: MessageSquareWarning,
      label: "Warning",
      tone: "text-stale-text",
      box: "border-stale/40",
    },
    caution: { icon: OctagonAlert, label: "Caution", tone: "text-danger", box: "border-danger/40" },
  };

/** A GitHub callout: a titled box, quiet, with the kind in the icon and the label (never color alone). */
function Callout({
  kind,
  children,
  line,
}: {
  kind: CalloutKind;
  children: ReactNode;
  line?: Record<string, number>;
}) {
  const c = CALLOUT[kind];
  const Icon = c.icon;
  return (
    <aside
      data-wf="Callout"
      data-callout={kind}
      className={cn("rounded-md border bg-subtle px-3.5 py-3", c.box)}
      {...line}
    >
      <p className={cn("m-0 mb-1.5 flex items-center gap-1.5 font-medium text-sm", c.tone)}>
        <Icon size={14} strokeWidth={1.75} aria-hidden />
        {c.label}
      </p>
      <div className="flex min-w-0 flex-col gap-2 text-fg">{children}</div>
    </aside>
  );
}

/** A heading with its anchor: the `#` shows when the pointer or the keyboard is on the heading. */
function Heading({
  tag: Tag,
  className,
  line,
  children,
  node,
}: {
  tag: "h1" | "h2" | "h3" | "h4" | "h5" | "h6";
  className: string;
  line?: Record<string, number>;
  children?: ReactNode;
  node: ExtraProps["node"];
}) {
  const wiki = useContext(WikiContext);
  const open = useOpenPage();
  const anchor = wiki?.anchors.get(node?.position?.start.line ?? -1);
  return (
    <Tag id={anchor} className={cn(anchor && "group/h scroll-mt-6", className)} {...line}>
      {children}
      {anchor && wiki && (
        <a
          href={libraryHref(wiki.alias, wiki.path, anchor)}
          aria-label="Link to this section"
          onClick={(e) => {
            if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
            e.preventDefault();
            open({ alias: wiki.alias, path: wiki.path, anchor });
          }}
          className="ml-2 font-normal text-fg-faint no-underline opacity-0 transition-opacity duration-100 hover:text-fg focus-visible:opacity-100 group-hover/h:opacity-100"
        >
          #
        </a>
      )}
    </Tag>
  );
}

/** The one child of a paragraph, ignoring blank text: an image or a link alone on its line. */
function soloChild(node: ExtraProps["node"]): HastLike | undefined {
  const kids = ((node as unknown as HastLike | undefined)?.children ?? []).filter(
    (c) => !(c.type === "text" && String(c.value ?? "").trim() === ""),
  );
  return kids.length === 1 ? kids[0] : undefined;
}

const prop = (n: HastLike, key: string): string | undefined => {
  const v = n.properties?.[key];
  return typeof v === "string" ? v : undefined;
};

const VIDEO_EXT = ["mp4", "webm", "mov", "ogv", "m4v"];

/**
 * A paragraph that holds only an image, or only a link to a video, is a block of its own: a
 * figure, a player, a card; anything else keeps `fallback`. Without a `wiki`, only absolute
 * addresses are media (a relative path means nothing outside a library).
 */
function MediaBlock({ solo, fallback }: { solo: HastLike; fallback: ReactNode }) {
  const wiki = useContext(WikiContext);
  const mediaOf = (src: string): PageMedia | undefined => {
    const known = wiki?.media(src);
    if (known) return known;
    if (!/^https?:\/\//i.test(src)) return undefined;
    const ext = /\.([a-z0-9]+)(?:[?#].*)?$/i.exec(src)?.[1]?.toLowerCase() ?? "";
    const kind = ext === "gif" ? "gif" : VIDEO_EXT.includes(ext) ? "video" : "image";
    return { src, kind, url: src, external: true };
  };
  if (solo.tagName === "img") {
    const src = prop(solo, "src");
    const media = src ? mediaOf(src) : undefined;
    return media ? <MediaFigure media={media} alt={prop(solo, "alt") ?? ""} /> : fallback;
  }
  if (solo.tagName === "a") {
    const href = prop(solo, "href");
    const embed = href ? parseEmbed(href) : undefined;
    if (!embed) return fallback;
    // `[![Title](poster.png)](https://youtu.be/…)`: the picture stands in for the player.
    const image = solo.children?.find((c) => c.tagName === "img");
    const src = image ? prop(image, "src") : undefined;
    const poster = src ? mediaOf(src)?.url : undefined;
    const words = image ? prop(image, "alt") : textOf(solo);
    return <EmbedCard embed={embed} title={words || undefined} poster={poster} />;
  }
  return fallback;
}

/** Does a paragraph's only child make a media block? Decided from the tree, before rendering. */
function isMediaChild(solo: HastLike | undefined): solo is HastLike {
  if (!solo) return false;
  if (solo.tagName === "img") return true;
  if (solo.tagName !== "a") return false;
  const href = prop(solo, "href");
  return Boolean(href && parseEmbed(href));
}

function hasClass(cls: unknown, name: string): boolean {
  return typeof cls === "string" && cls.split(" ").includes(name);
}

/** A link written as markdown: in a library page a relative one goes to a page, dashed when broken. */
function ProseAnchor({ href, className, children, ...p }: ComponentProps<"a"> & ExtraProps) {
  const wiki = useContext(WikiContext);
  const external = /^https?:\/\//i.test(href ?? "");
  const scheme = /^[a-z][a-z0-9+.-]*:/i.test(href ?? "");
  const form: LinkForm | undefined = href?.startsWith("#") ? "anchor" : "relative";
  const link = wiki && href && !scheme ? wiki.link(form, href) : undefined;
  // A page, or a page that is not there; a media or other file of the library is a plain address.
  if (link && (link.address || !link.ok)) {
    return (
      <PageLink link={link} raw={href ?? ""}>
        {children}
      </PageLink>
    );
  }
  const target = external ? href : (link?.href ?? href);
  return (
    <a
      href={target}
      target={external ? "_blank" : undefined}
      rel={external ? "noopener noreferrer" : undefined}
      className={cn(pageLinkClass, className)}
      {...p}
    >
      {children}
    </a>
  );
}

/** An image in the middle of a sentence. In a library page its address is the library's file. */
function ProseImage({
  src,
  alt,
  className,
  ...p
}: { src?: string; alt?: string; className?: string } & Omit<ComponentProps<"img">, "src">) {
  const wiki = useContext(WikiContext);
  const media = src ? wiki?.media(src) : undefined;
  if (media?.missing)
    return <span className="text-fg-faint underline decoration-dashed">{alt || src}</span>;
  return (
    <img
      alt={alt ?? ""}
      src={media?.url ?? src}
      loading="lazy"
      className={cn("max-w-full rounded-md border border-border", className)}
      {...p}
    />
  );
}

type P<K extends keyof React.JSX.IntrinsicElements> = ComponentProps<K> & ExtraProps;

/**
 * Document typography: a docs page (14 px body), a pane (13 px body; headings 16 / 14 / 13), or a
 * wiki page (15 to 16 px body at about 1.65; headings 28 / 22 / 18 / 16).
 */
export type ProseDocument = "page" | "pane" | "wiki";

/** Where the markdown came from, so every block can name its line. */
export interface MarkdownSource {
  /** Workspace-relative path of the file. */
  path: string;
  /** Lines of the file before `md` starts (a frontmatter block that was cut off). Default 0. */
  lineOffset?: number;
  /** Called with the file line of the block whose tag was clicked. Default: open the file at that
   *  line in the Workdatabase · Files view. */
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
  const wiki = doc === "wiki";
  const heading = wiki
    ? "mt-6 first:mt-0 font-semibold text-fg leading-snug"
    : doc
      ? "mt-3 first:mt-0 font-semibold text-fg leading-snug"
      : "mt-2 first:mt-0 font-semibold text-fg leading-snug";
  const sizes = wiki
    ? {
        h1: "text-[26px] tracking-[-0.02em] min-[1280px]:text-[28px]",
        h2: "text-xl tracking-[-0.01em] min-[1280px]:text-[22px]",
        h3: "text-[17px] min-[1280px]:text-lg",
        h4: "text-[15px] min-[1280px]:text-[16px]",
      }
    : doc
      ? { h1: "text-lg", h2: "text-md", h3: "text-base", h4: "" }
      : compact
        ? { h1: "text-base", h2: "text-sm", h3: "text-sm", h4: "" }
        : { h1: "text-md", h2: "text-base", h3: "text-base", h4: "" };
  const small = wiki
    ? "mt-6 text-sm font-medium uppercase tracking-wide text-fg-muted"
    : "font-medium text-fg-muted";
  return {
    p: ({ node, className, children, ...p }: P<"p">) => {
      const para = (
        <p className={cn("min-w-0", className)} {...lineProps(node, offset)} {...p}>
          {children}
        </p>
      );
      const solo = compact ? undefined : soloChild(node);
      if (!isMediaChild(solo)) return para;
      const block = <MediaBlock solo={solo} fallback={para} />;
      // The wrapper only exists on a traced page; an untraced one renders the block itself.
      return traced ? (
        <div className="min-w-0" {...lineProps(node, offset)}>
          {block}
        </div>
      ) : (
        block
      );
    },
    h1: ({ node, className, children }: P<"h1">) => (
      <Heading
        tag="h1"
        node={node}
        className={cn(heading, sizes.h1, className)}
        line={lineProps(node, offset)}
      >
        {children}
      </Heading>
    ),
    h2: ({ node, className, children }: P<"h2">) => (
      <Heading
        tag="h2"
        node={node}
        className={cn(heading, sizes.h2, className)}
        line={lineProps(node, offset)}
      >
        {children}
      </Heading>
    ),
    h3: ({ node, className, children }: P<"h3">) => (
      <Heading
        tag="h3"
        node={node}
        className={cn(heading, sizes.h3, className)}
        line={lineProps(node, offset)}
      >
        {children}
      </Heading>
    ),
    h4: ({ node, className, children }: P<"h4">) => (
      <Heading
        tag="h4"
        node={node}
        className={cn(heading, wiki ? sizes.h4 : small, className)}
        line={lineProps(node, offset)}
      >
        {children}
      </Heading>
    ),
    h5: ({ node, className, children }: P<"h5">) => (
      <Heading
        tag="h5"
        node={node}
        className={cn(heading, small, className)}
        line={lineProps(node, offset)}
      >
        {children}
      </Heading>
    ),
    h6: ({ node, className, children }: P<"h6">) => (
      <Heading
        tag="h6"
        node={node}
        className={cn(heading, small, className)}
        line={lineProps(node, offset)}
      >
        {children}
      </Heading>
    ),
    ul: ({ node: _n, className, ...p }: P<"ul">) => (
      <ul
        className={cn(
          "list-disc pl-4 marker:text-fg-faint [&>li+li]:mt-0.5 [li>&]:mt-0.5",
          doc && "[&>li+li]:mt-1",
          wiki && "pl-5 [&>li+li]:mt-1.5",
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
          wiki && "pl-5 [&>li+li]:mt-1.5",
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
    blockquote: ({ node, className, children, ...p }: P<"blockquote">) => {
      const kind = (p as Record<string, unknown>)["data-callout"];
      if (typeof kind === "string" && kind in CALLOUT)
        return (
          <Callout kind={kind as CalloutKind} line={lineProps(node, offset)}>
            {children}
          </Callout>
        );
      return (
        <blockquote
          className={cn("border-border-strong border-l pl-3 text-fg-muted [&>*+*]:mt-2", className)}
          {...lineProps(node, offset)}
          {...p}
        >
          {children}
        </blockquote>
      );
    },
    hr: ({ node, className, ...p }: P<"hr">) => (
      <hr
        className={cn("my-1 h-px border-0 bg-border", className)}
        {...lineProps(node, offset)}
        {...p}
      />
    ),
    a: ({ node: _n, href, children, className, ...p }: P<"a">) => {
      if (href?.startsWith(REF_PROTOCOL))
        return (
          <WikiRef
            target={decode(href.slice(REF_PROTOCOL.length))}
            issueId={issueId}
            label={children}
          />
        );
      if (href?.startsWith(AUTHOR_PROTOCOL))
        return <AuthorChip handle={decode(href.slice(AUTHOR_PROTOCOL.length))} variant="text" />;
      return (
        <ProseAnchor href={href} className={className} {...p}>
          {children}
        </ProseAnchor>
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
    img: ({ node: _n, className, alt, src, ...p }: P<"img">) => (
      <ProseImage
        src={typeof src === "string" ? src : undefined}
        alt={alt}
        className={className}
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
            // A wiki table sits in 15 to 16 px text: 14 px keeps its code (0.875em) at 12 px.
            compact
              ? "text-xs"
              : doc === "wiki"
                ? "text-md"
                : doc === "page"
                  ? "text-base"
                  : "text-sm",
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
  /** The library page the text belongs to: resolves its links and media, anchors its headings. */
  wiki?: ProseWiki;
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
  wiki,
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
  const wikiValue = useMemo<WikiValue | undefined>(() => {
    if (!wiki) return undefined;
    const links = new Map(wiki.links.map((l) => [`${l.form}:${l.raw}`, l]));
    return {
      alias: wiki.alias,
      path: wiki.path,
      link: (form, raw) => links.get(`${form}:${raw}`),
      media: (src) => wiki.media[src],
      anchors: new Map(headingsOf(md).map((h) => [h.line, h.anchor])),
    };
  }, [wiki, md]);
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
        doc === "wiki"
          ? "gap-4 text-[15px] leading-[1.65] [--wf-code-size:0.875em] min-[1280px]:text-[16px]"
          : doc === "page"
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
        <WikiContext.Provider value={wikiValue}>
          <Markdown
            remarkPlugins={[remarkGfm, remarkCallouts, remarkWfRefs]}
            rehypePlugins={[[rehypeSanitize, schema]]}
            components={components}
            urlTransform={urlTransform}
            skipHtml
          >
            {md}
          </Markdown>
        </WikiContext.Provider>
      </DiagramsContext.Provider>
      {/* Last, so a heading that opens the page keeps its `first:` margin while the tag shows. */}
      {source && gutter > 0 && (
        <SourceGutter source={source} gutter={gutter} traced={trace.traced} />
      )}
    </div>
  );
}
