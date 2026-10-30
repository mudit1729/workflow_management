// Media inside a markdown page (spec L7): images with a caption and click-to-zoom, GIFs that stay
// still for a reader who prefers reduced motion, video files with controls that never autoplay,
// and YouTube, Vimeo and Loom links as a card whose player loads only on click.
//
// Nothing here loads anything the reader did not ask for: a video file loads its metadata only,
// an embed loads no frame (and no request to the provider) until the card is clicked, a GIF under
// reduced motion shows its first frame. A file over 25 MB is linked, not loaded.
import { ExternalLink, FileWarning, ImageOff, Pause, Play, X } from "lucide-react";
import { Dialog as DialogPrimitive, VisuallyHidden } from "radix-ui";
import { type ReactNode, useEffect, useRef, useState } from "react";
import { IconButton } from "@/components/ui";
import { LARGE_MEDIA_BYTES } from "@/features/library/address";
import type { PageMedia } from "@/lib/api/types";
import { cn } from "@/lib/cn";
import { useMediaQuery } from "@/lib/hooks";

/** The reader asked the system for less motion. */
export function usePrefersReducedMotion(): boolean {
  return useMediaQuery("(prefers-reduced-motion: reduce)");
}

const ICON = { size: 14, strokeWidth: 1.75 } as const;

/** "48 MB", "320 KB". */
export function sizeLabel(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${Math.round(bytes / (1024 * 1024))} MB`;
  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

const fileName = (src: string) => src.slice(src.lastIndexOf("/") + 1);

// ---------------------------------------------------------------- embeds

export type EmbedProvider = "youtube" | "vimeo" | "loom";

export interface Embed {
  provider: EmbedProvider;
  id: string;
  /** The address of the video on its own site. */
  watch: string;
  /** The player's address, with the start-on-load flag: it is only used after a click. */
  frame: string;
}

export const PROVIDER_NAME: Record<EmbedProvider, string> = {
  youtube: "YouTube",
  vimeo: "Vimeo",
  loom: "Loom",
};

/** A YouTube, Vimeo or Loom address as an embed. `undefined` for any other address. */
export function parseEmbed(href: string): Embed | undefined {
  let url: URL;
  try {
    url = new URL(href.trim());
  } catch {
    return undefined;
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") return undefined;
  const host = url.hostname.replace(/^(www|m)\./, "");
  const parts = url.pathname.split("/").filter(Boolean);
  const first = parts[0];

  if (host === "youtu.be" && first && /^[\w-]{6,}$/.test(first)) return youtube(first);
  if (host === "youtube.com" || host === "youtube-nocookie.com") {
    const id =
      first === "watch"
        ? url.searchParams.get("v")
        : first && ["embed", "shorts", "live", "v"].includes(first)
          ? parts[1]
          : null;
    if (id && /^[\w-]{6,}$/.test(id)) return youtube(id);
  }
  if (host === "vimeo.com" || host === "player.vimeo.com") {
    const id = parts.find((p) => /^\d{5,}$/.test(p));
    const hash = parts[parts.indexOf(id ?? "") + 1];
    if (id) {
      const h = url.searchParams.get("h") ?? (hash && /^[0-9a-f]{6,}$/i.test(hash) ? hash : "");
      return {
        provider: "vimeo",
        id,
        watch: `https://vimeo.com/${id}${h ? `/${h}` : ""}`,
        frame: `https://player.vimeo.com/video/${id}?${h ? `h=${h}&` : ""}autoplay=1&dnt=1`,
      };
    }
  }
  if (host === "loom.com" && (first === "share" || first === "embed") && parts[1]) {
    const id = parts[1];
    if (/^[\w-]{8,}$/.test(id))
      return {
        provider: "loom",
        id,
        watch: `https://www.loom.com/share/${id}`,
        frame: `https://www.loom.com/embed/${id}?autoplay=1`,
      };
  }
  return undefined;
}

function youtube(id: string): Embed {
  return {
    provider: "youtube",
    id,
    watch: `https://www.youtube.com/watch?v=${id}`,
    frame: `https://www.youtube-nocookie.com/embed/${id}?autoplay=1&rel=0`,
  };
}

export interface EmbedCardProps {
  embed: Embed;
  /** The words of the link, if it had any; otherwise the card names the provider. */
  title?: string;
  /** A picture from the library to stand in for the player. Nothing is fetched from the provider. */
  poster?: string;
  /** Start with the player loaded. Only for tests and screenshots: a reader loads it by clicking. */
  defaultLoaded?: boolean;
}

/** A video on another site, as a card. The player (and the request to its site) waits for a click. */
export function EmbedCard({ embed, title, poster, defaultLoaded = false }: EmbedCardProps) {
  const [loaded, setLoaded] = useState(defaultLoaded);
  const name = PROVIDER_NAME[embed.provider];
  const named = Boolean(title && title !== embed.watch);
  const label = named && title ? title : `${name} video`;
  return (
    <figure data-wf="EmbedCard" data-provider={embed.provider} className="m-0 flex flex-col gap-2">
      <div className="relative aspect-video w-full overflow-hidden rounded-md border border-border bg-subtle">
        {loaded ? (
          <iframe
            src={embed.frame}
            title={label}
            className="absolute inset-0 size-full border-0"
            allow="autoplay; fullscreen; picture-in-picture; encrypted-media"
            allowFullScreen
            referrerPolicy="strict-origin-when-cross-origin"
            sandbox="allow-scripts allow-same-origin allow-presentation allow-popups"
          />
        ) : (
          <button
            type="button"
            aria-label={`Play video: ${label}`}
            onClick={() => setLoaded(true)}
            className="group/play absolute inset-0 flex size-full cursor-pointer flex-col items-center justify-center gap-3 text-left"
          >
            {poster && (
              <img
                src={poster}
                alt=""
                loading="lazy"
                className="absolute inset-0 size-full object-cover"
              />
            )}
            {/* A calm stand-in when the library supplies no picture. */}
            {!poster && (
              <span
                aria-hidden
                className="absolute inset-0 bg-[repeating-linear-gradient(135deg,transparent_0_10px,var(--wf-border)_10px_11px)] opacity-60"
              />
            )}
            <span
              aria-hidden
              className="relative flex size-12 items-center justify-center rounded-full border border-border bg-bg text-fg shadow-pop transition-transform duration-150 ease-wf group-hover/play:scale-105 motion-reduce:transition-none"
            >
              <Play size={18} strokeWidth={1.75} className="translate-x-px" />
            </span>
            <span className="relative rounded-sm bg-bg/90 px-2 py-0.5 font-medium text-fg-muted text-xs">
              Click to load the {name} player
            </span>
          </button>
        )}
      </div>
      <figcaption className="flex min-w-0 items-baseline gap-2 text-sm">
        <span className="min-w-0 truncate font-medium text-fg">{label}</span>
        {named && <span className="shrink-0 text-fg-faint">{name}</span>}
        <a
          href={embed.watch}
          target="_blank"
          rel="noopener noreferrer"
          className="ml-auto inline-flex shrink-0 items-center gap-1 text-fg-muted hover:text-fg"
        >
          Open
          <ExternalLink {...ICON} size={12} aria-hidden />
        </a>
      </figcaption>
    </figure>
  );
}

// ---------------------------------------------------------------- images

/** A picture over the page; Esc, a click anywhere or the × closes it. */
function Lightbox({ src, alt, onClose }: { src: string; alt: string; onClose: () => void }) {
  return (
    <DialogPrimitive.Root open onOpenChange={(open) => !open && onClose()}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-dialog bg-scrim data-[state=open]:fade-in-0 data-[state=open]:animate-in data-[state=open]:duration-150" />
        <DialogPrimitive.Content
          data-wf="ImageLightbox"
          aria-describedby={undefined}
          onClick={onClose}
          className="fixed inset-4 z-dialog flex cursor-zoom-out flex-col items-center justify-center gap-3 outline-none"
        >
          <VisuallyHidden.Root>
            <DialogPrimitive.Title>{alt || "Image"}</DialogPrimitive.Title>
          </VisuallyHidden.Root>
          <img
            src={src}
            alt={alt}
            className="min-h-0 max-w-full rounded-md border border-border bg-bg object-contain shadow-pop"
          />
          {alt && (
            <p className="max-w-[72ch] rounded-sm bg-bg px-2 py-1 text-center text-fg-muted text-sm">
              {alt}
            </p>
          )}
          <DialogPrimitive.Close asChild>
            <IconButton
              label="Close"
              shortcut="Escape"
              icon={<X {...ICON} />}
              variant="subtle"
              className="absolute top-0 right-0 bg-bg"
              onClick={(e) => e.stopPropagation()}
            />
          </DialogPrimitive.Close>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}

/** The picture itself, as a button that opens it full size. */
function ZoomImage({ src, alt }: { src: string; alt: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        aria-label={`Open the image full size${alt ? `: ${alt}` : ""}`}
        onClick={() => setOpen(true)}
        className="block w-full cursor-zoom-in overflow-hidden rounded-md border border-border bg-subtle"
      >
        <img
          src={src}
          alt={alt}
          loading="lazy"
          className="mx-auto block max-h-[520px] max-w-full"
        />
      </button>
      {open && <Lightbox src={src} alt={alt} onClose={() => setOpen(false)} />}
    </>
  );
}

// ---------------------------------------------------------------- GIFs

/** The first frame of a GIF on a canvas, so a still picture stands in for the animation. */
function FirstFrame({ src, alt }: { src: string; alt: string }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const [ratio, setRatio] = useState("16 / 9");
  useEffect(() => {
    const img = new Image();
    img.onload = () => {
      const el = canvas.current;
      const ctx = el?.getContext("2d");
      if (!el || !ctx) return;
      el.width = img.naturalWidth;
      el.height = img.naturalHeight;
      setRatio(`${img.naturalWidth} / ${img.naturalHeight}`);
      ctx.drawImage(img, 0, 0);
    };
    img.src = src;
  }, [src]);
  return (
    <canvas
      ref={canvas}
      role="img"
      aria-label={alt}
      className="mx-auto block max-h-[520px] max-w-full"
      style={{ aspectRatio: ratio }}
    />
  );
}

export interface GifPlayerProps {
  src: string;
  alt: string;
  /** Default: what the reader's system asks for (`prefers-reduced-motion`). */
  reducedMotion?: boolean;
}

/**
 * An animated GIF. It plays, unless the reader prefers reduced motion: then it shows its first
 * frame under a play button, and any reader can pause or start it.
 */
export function GifPlayer({ src, alt, reducedMotion }: GifPlayerProps) {
  const system = usePrefersReducedMotion();
  const calm = reducedMotion ?? system;
  // The system setting can change while the page is open; a choice the reader made stays.
  const [choice, setChoice] = useState<boolean>();
  const shown = choice ?? !calm;
  return (
    <div data-wf="GifPlayer" data-playing={shown || undefined} className="group/gif relative">
      {shown ? (
        <img
          src={src}
          alt={alt}
          loading="lazy"
          className="mx-auto block max-h-[520px] max-w-full overflow-hidden rounded-md border border-border"
        />
      ) : (
        <div className="overflow-hidden rounded-md border border-border bg-subtle">
          <FirstFrame src={src} alt={alt} />
        </div>
      )}
      <button
        type="button"
        aria-label={shown ? `Pause the animation: ${alt}` : `Play the animation: ${alt}`}
        aria-pressed={shown}
        onClick={() => setChoice(!shown)}
        className={cn(
          "absolute flex items-center gap-1.5 rounded-md border border-border bg-bg/95 font-medium text-fg text-sm shadow-pop transition-opacity duration-100 ease-wf",
          shown
            ? "bottom-2 left-2 h-6 px-1.5 opacity-0 focus-visible:opacity-100 group-hover/gif:opacity-100"
            : "inset-0 m-auto h-8 w-fit px-3",
        )}
      >
        {shown ? <Pause {...ICON} aria-hidden /> : <Play {...ICON} aria-hidden />}
        {shown ? <span className="sr-only">Pause</span> : "Play"}
      </button>
    </div>
  );
}

// ---------------------------------------------------------------- video files

export interface VideoPlayerProps {
  src: string;
  /** Names the video for a screen reader. */
  label: string;
}

/** A video file with its own controls. It never autoplays and loads only its metadata. */
export function VideoPlayer({ src, label }: VideoPlayerProps) {
  return (
    // biome-ignore lint/a11y/useMediaCaption: a library video has no track file to point at.
    <video
      data-wf="VideoPlayer"
      src={src}
      controls
      preload="metadata"
      playsInline
      aria-label={label || fileName(src)}
      className="block max-h-[520px] w-full rounded-md border border-border bg-subtle"
    />
  );
}

// ---------------------------------------------------------------- one media reference

export interface MediaFigureProps {
  media: PageMedia;
  /** The alt text of the markdown image: it names the media and is its caption. */
  alt: string;
  /** Overrides what the reader's system asks for. For tests. */
  reducedMotion?: boolean;
}

/** An image, GIF or video of a page with its caption, or a quiet note when it cannot be shown. */
export function MediaFigure({ media, alt, reducedMotion }: MediaFigureProps) {
  const { kind, url, missing, bytes = 0 } = media;
  let body: ReactNode;
  if (missing || !url) {
    body = (
      <Note icon={<ImageOff {...ICON} aria-hidden />}>
        This {kind === "video" ? "video" : "image"} is not in the library:{" "}
        <code className="code-inline">{media.src}</code>
      </Note>
    );
  } else if (bytes > LARGE_MEDIA_BYTES) {
    // A stalled page is worse than a link: say what the file is and where it is.
    body = (
      <Note icon={<FileWarning {...ICON} aria-hidden />}>
        <code className="code-inline">{fileName(media.src)}</code> is {sizeLabel(bytes)}. Files over
        25 MB should be links or Git LFS, so the page does not load it.{" "}
        <a href={url} target="_blank" rel="noopener noreferrer" className="text-accent underline">
          Open the file
        </a>
      </Note>
    );
  } else if (kind === "video") body = <VideoPlayer src={url} label={alt} />;
  else if (kind === "gif") body = <GifPlayer src={url} alt={alt} reducedMotion={reducedMotion} />;
  else body = <ZoomImage src={url} alt={alt} />;

  return (
    <figure data-wf="ProseFigure" data-kind={kind} className="m-0 flex flex-col gap-2">
      {body}
      {alt && !missing && (
        <figcaption className="text-center text-fg-muted text-sm leading-snug">{alt}</figcaption>
      )}
    </figure>
  );
}

function Note({ icon, children }: { icon: ReactNode; children: ReactNode }) {
  return (
    <p className="m-0 flex items-start gap-2 rounded-md border border-border border-dashed px-3 py-2.5 text-fg-muted text-sm leading-snug">
      <span className="mt-0.5 shrink-0 text-fg-faint">{icon}</span>
      <span className="min-w-0">{children}</span>
    </p>
  );
}
