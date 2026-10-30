// A page of a library rendered by MarkdownProse: GitHub callouts, heading anchors, wiki links
// (dashed when broken), figures, video files and click-to-load video cards. The text and the
// resolved links come from the real library model, so the test reads what a reader would.

import { buildCorpus } from "@mock/libraries/corpus";
import { QueryClientProvider } from "@tanstack/react-query";
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  RouterProvider,
} from "@tanstack/react-router";
import type { ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { TooltipProvider } from "@/components/ui";
import { queryClient } from "@/lib/api";
import type { LibraryPage, LibrarySource } from "@/lib/api/types";
import { MarkdownProse } from "./MarkdownProse";

/** Render inside a router (links and headings navigate), the providers the app has, and a client. */
async function render(node: ReactElement): Promise<string> {
  const root = createRootRoute({ component: () => node });
  const router = createRouter({
    routeTree: root.addChildren([createRoute({ getParentRoute: () => root, path: "/" })]),
    history: createMemoryHistory({ initialEntries: ["/"] }),
  });
  await router.load();
  return renderToStaticMarkup(
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <RouterProvider router={router} />
      </TooltipProvider>
    </QueryClientProvider>,
  );
}

const source = (files: Record<string, string>): LibrarySource => ({
  alias: "platform",
  kind: "team",
  name: "Platform handbook",
  root: "",
  files,
  media: {
    "media/flow.gif": { url: "/m/flow.gif", bytes: 900 },
    "media/shot.png": { url: "/m/shot.png", bytes: 900 },
    "media/demo.webm": { url: "/m/demo.webm", bytes: 900 },
  },
});

const FILES = {
  "runbooks/rotate.md": "# Rotate\n\n## Why\n\nBecause.\n",
  "guide.md": [
    "# Guide",
    "",
    "## Rotate keys",
    "",
    "Read [[runbooks/rotate#why]], [[runbooks/rotate|the runbook]], [[runbooks/gone]], [the page](runbooks/rotate.md) and [a gap](nowhere.md).",
    "",
    "> [!WARNING]",
    "> Keys leak.",
    "",
    "> [!TIP]",
    "> Rotate on a schedule.",
    "",
    "> A plain quote.",
    "",
    "## Rotate keys",
    "",
    "![The flow of a rotation](media/flow.gif)",
    "",
    "![A screenshot](media/shot.png)",
    "",
    "![A demo](media/demo.webm)",
    "",
    "![Missing](media/none.png)",
    "",
    "https://youtu.be/dQw4w9WgXcQ",
    "",
    "[![Tour](media/shot.png)](https://vimeo.com/76979871)",
    "",
    "Text with an inline ![dot](media/shot.png) image.",
  ].join("\n"),
};

const page = (path: string): LibraryPage => {
  const p = buildCorpus([source(FILES)]).page("platform", path);
  if (!p) throw new Error(`no page ${path}`);
  return p;
};

async function prose(path = "guide.md"): Promise<string> {
  const p = page(path);
  const body = p.text.split("\n").slice(p.lineOffset).join("\n");
  return render(
    <MarkdownProse
      md={body}
      document="wiki"
      wiki={{ alias: p.alias, path: p.path, links: p.links, media: p.media }}
    />,
  );
}

describe("a library page in MarkdownProse", () => {
  it("gives each heading its anchor, once, with a link to it", async () => {
    const out = await prose();
    expect(out).toMatch(/<h2[^>]*id="rotate-keys"/);
    expect(out).toMatch(/<h2[^>]*id="rotate-keys-1"/);
    expect(out).toContain('aria-label="Link to this section"');
    expect(out).toContain('href="/lib/t/platform/guide.md#rotate-keys"');
  });

  it("draws GitHub callouts as boxes with their name, and a plain quote as a quote", async () => {
    const out = await prose();
    expect(out).toContain('data-callout="warning"');
    expect(out).toContain("Warning");
    expect(out).toContain("Keys leak.");
    expect(out).toContain('data-callout="tip"');
    expect(out).not.toContain("[!WARNING]");
    expect(out).not.toContain("[!TIP]");
    expect(out).toMatch(/<blockquote[^>]*>[\s\S]*A plain quote\./);
  });

  it("links a page by [[path]], [[path#heading]] and [[path|label]], and a relative link", async () => {
    const out = await prose();
    expect(out).toContain('href="/lib/t/platform/runbooks/rotate.md#why"');
    expect(out).toContain('href="/lib/t/platform/runbooks/rotate.md"');
    // The label of [[target|label]] wins; a bare [[target]] shows the page's title.
    expect(out).toContain(">the runbook<");
    expect(out).toContain(">the page<");
  });

  it("draws a broken link dashed, with no address to go to", async () => {
    const out = await prose();
    const broken = [...out.matchAll(/<span[^>]*data-broken[^>]*>([^<]*)<\/span>/g)].map(
      (m) => m[1],
    );
    expect(broken).toEqual(expect.arrayContaining(["runbooks/gone", "a gap"]));
    expect(out).not.toContain('href="/lib/t/platform/gone');
    expect(out).not.toContain('href="/lib/t/platform/nowhere');
  });

  it("shows an image as a captioned figure, a GIF and a video file with their rules", async () => {
    const out = await prose();
    expect(out).toContain("A screenshot");
    expect(out).toContain('src="/m/shot.png"');
    // The GIF plays (the test environment has no reduced-motion setting), with a way to pause.
    expect(out).toContain('src="/m/flow.gif"');
    expect(out).toContain("Pause the animation: The flow of a rotation");
    expect(out).toContain("<video");
    expect(out).toContain('src="/m/demo.webm"');
    expect(out).toContain('preload="metadata"');
    expect(out).not.toMatch(/autoplay/i);
    expect(out).toContain("is not in the library");
  });

  it("makes a line that is only a video link a card, and loads no player", async () => {
    const out = await prose();
    expect(out).toContain('data-wf="EmbedCard"');
    expect(out).toContain('data-provider="youtube"');
    expect(out).toContain('data-provider="vimeo"');
    // The poster is the library's own picture, as the image inside the link says.
    expect(out).toContain("Tour");
    expect(out).not.toContain("<iframe");
    expect(out).not.toContain("youtube-nocookie");
  });

  it("leaves an image in the middle of a sentence inline, at the library's address", async () => {
    const out = await prose();
    expect(out).toMatch(/Text with an inline <img[^>]*src="\/m\/shot\.png"/);
  });
});

describe("MarkdownProse elsewhere", () => {
  it("still draws callouts, and gives headings no anchor without a library page", async () => {
    const out = await render(<MarkdownProse md={"## Plain\n\n> [!NOTE]\n> Hi\n"} />);
    expect(out).toContain('data-callout="note"');
    expect(out).not.toContain('id="plain"');
    expect(out).not.toContain("Link to this section");
  });

  it("does not turn a lone video link into a card in compact text", async () => {
    const out = await render(<MarkdownProse compact md={"https://youtu.be/dQw4w9WgXcQ"} />);
    expect(out).not.toContain("EmbedCard");
  });
});
