// The rules for media in a page (spec L7): a video file never autoplays and loads only its
// metadata, a GIF stays on its first frame for a reader who prefers reduced motion, an embed loads
// nothing until it is clicked, a file over 25 MB is linked, not loaded.
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { TooltipProvider } from "@/components/ui";
import type { PageMedia } from "@/lib/api/types";
import {
  EmbedCard,
  GifPlayer,
  MediaFigure,
  parseEmbed,
  sizeLabel,
  VideoPlayer,
} from "./MarkdownMedia";

const html = (node: React.ReactElement) =>
  renderToStaticMarkup(<TooltipProvider>{node}</TooltipProvider>);

describe("embeds", () => {
  it("reads YouTube, Vimeo and Loom addresses in their usual forms", () => {
    const yt = "dQw4w9WgXcQ";
    for (const url of [
      `https://www.youtube.com/watch?v=${yt}`,
      `https://youtu.be/${yt}`,
      `https://www.youtube.com/shorts/${yt}`,
      `https://www.youtube.com/embed/${yt}`,
      `https://m.youtube.com/watch?v=${yt}&t=3s`,
    ])
      expect(parseEmbed(url)).toMatchObject({ provider: "youtube", id: yt });
    expect(parseEmbed("https://vimeo.com/76979871")).toMatchObject({
      provider: "vimeo",
      id: "76979871",
    });
    expect(parseEmbed("https://player.vimeo.com/video/76979871?h=abc123")).toMatchObject({
      provider: "vimeo",
      frame: expect.stringContaining("h=abc123"),
    });
    expect(parseEmbed("https://www.loom.com/share/0123456789abcdef")).toMatchObject({
      provider: "loom",
      id: "0123456789abcdef",
    });
  });

  it("leaves any other address alone, and never reads a script or a data address", () => {
    for (const url of [
      "https://example.com/watch?v=dQw4w9WgXcQ",
      "https://www.youtube.com/channel/abc",
      "https://vimeo.com/about",
      "https://www.loom.com/pricing",
      "javascript:alert(1)",
      "data:text/html,x",
      "not a url",
    ])
      expect(parseEmbed(url)).toBeUndefined();
  });

  it("loads the player from the privacy-friendly address, and only after the click", () => {
    const embed = parseEmbed("https://youtu.be/dQw4w9WgXcQ");
    if (!embed) throw new Error("expected an embed");
    expect(embed.frame).toContain("youtube-nocookie.com/embed/dQw4w9WgXcQ");
    const card = html(<EmbedCard embed={embed} title="Demo of the watcher" />);
    // What the reader sees: a card with the title and the provider, a button, no frame.
    expect(card).toContain("Demo of the watcher");
    expect(card).toContain("YouTube");
    expect(card).toContain('aria-label="Play video: Demo of the watcher"');
    expect(card).not.toContain("<iframe");
    expect(card).not.toContain("youtube-nocookie");
    expect(card).not.toContain("<img");
  });

  it("shows the library's own picture as the poster, and still no frame", () => {
    const embed = parseEmbed("https://vimeo.com/76979871");
    if (!embed) throw new Error("expected an embed");
    const card = html(<EmbedCard embed={embed} poster="/m/poster.png" />);
    expect(card).toContain('src="/m/poster.png"');
    expect(card).not.toContain("<iframe");
  });

  it("names a sandboxed player once it is loaded, with a way to open the video on its site", () => {
    const embed = parseEmbed("https://www.loom.com/share/0123456789abcdef");
    if (!embed) throw new Error("expected an embed");
    const loaded = html(<EmbedCard embed={embed} defaultLoaded />);
    expect(loaded).toContain("<iframe");
    expect(loaded).toContain("sandbox=");
    expect(loaded).toContain("https://www.loom.com/embed/0123456789abcdef");
    expect(loaded).toContain('href="https://www.loom.com/share/0123456789abcdef"');
  });
});

describe("GIFs", () => {
  it("play for a reader who has not asked for less motion", () => {
    const out = html(<GifPlayer src="/m/flow.gif" alt="The flow" reducedMotion={false} />);
    expect(out).toContain('<img src="/m/flow.gif"');
    expect(out).toContain('aria-label="Pause the animation: The flow"');
  });

  it("show a first frame and a play button under reduced motion, and load no animation", () => {
    const out = html(<GifPlayer src="/m/flow.gif" alt="The flow" reducedMotion />);
    expect(out).not.toContain("<img");
    expect(out).not.toContain("/m/flow.gif");
    expect(out).toContain("<canvas");
    expect(out).toContain('aria-label="Play the animation: The flow"');
    expect(out).toContain("Play");
  });
});

describe("video files", () => {
  const out = html(<VideoPlayer src="/m/demo.webm" label="Demo" />);

  it("have controls, load only the metadata and never autoplay or loop", () => {
    expect(out).toContain("<video");
    expect(out).toContain("controls");
    expect(out).toContain('preload="metadata"');
    expect(out).not.toMatch(/autoplay/i);
    expect(out).not.toMatch(/loop/i);
    expect(out).toContain('aria-label="Demo"');
  });
});

describe("a media figure", () => {
  const base: PageMedia = { src: "media/x.png", kind: "image", url: "/m/x.png", bytes: 2000 };

  it("captions an image with its alt text and opens it full size on click", () => {
    const out = html(<MediaFigure media={base} alt="The board at noon" />);
    expect(out).toContain("<figure");
    expect(out).toContain("<figcaption");
    expect(out).toContain("The board at noon");
    expect(out).toContain('aria-label="Open the image full size: The board at noon"');
    expect(out).toContain('loading="lazy"');
  });

  it("picks the player by what the file is", () => {
    expect(
      html(<MediaFigure media={{ ...base, kind: "video", url: "/m/d.mp4" }} alt="Demo" />),
    ).toContain("<video");
    expect(
      html(
        <MediaFigure media={{ ...base, kind: "gif", url: "/m/d.gif" }} alt="Loop" reducedMotion />,
      ),
    ).toContain("<canvas");
  });

  it("says so, quietly, when the file is not in the library", () => {
    const out = html(
      <MediaFigure media={{ src: "media/gone.png", kind: "image", missing: true }} alt="Gone" />,
    );
    expect(out).toContain("is not in the library");
    expect(out).toContain("media/gone.png");
    expect(out).not.toContain("<img");
  });

  it("links a file over 25 MB instead of loading it", () => {
    const big: PageMedia = {
      src: "media/tour.mp4",
      kind: "video",
      url: "/m/tour.mp4",
      bytes: 48 * 1024 * 1024,
    };
    const out = html(<MediaFigure media={big} alt="Tour" />);
    expect(out).not.toContain("<video");
    expect(out).toContain("48 MB");
    expect(out).toContain("Git LFS");
    expect(out).toContain('href="/m/tour.mp4"');
    expect(sizeLabel(512)).toBe("1 KB");
  });
});
