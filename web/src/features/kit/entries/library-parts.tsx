// Kit entries for the parts of the wiki viewer: the page header, the page tree, the right rail, the
// outline, the callouts and the media (picture, GIF, video file, embed card). The pages are real
// ones: the workspace library's playbooks and the personal library's research topic with its GIF
// and video (web/mock/personal).

import poster from "@mock/personal/topics/agent-context/media/context-bundle-poster.png";
import { type ReactNode, useState } from "react";
import { toast } from "sonner";
import {
  EmbedCard,
  GifPlayer,
  MarkdownProse,
  MediaFigure,
  parseEmbed,
  VideoPlayer,
} from "@/components/common";
import { Outline, OutlinePopover } from "@/features/library/OnThisPage";
import { PageHeader, type PageView } from "@/features/library/PageHeader";
import { PageTree } from "@/features/library/PageTree";
import { RightRail } from "@/features/library/RightRail";
import { useLibrary, useLibraryPage, useLibraryTree } from "@/lib/api";
import type { LibraryInfo, LibraryPage, LibraryTree, PageMedia } from "@/lib/api/types";
import { entry, type KitEntry, Loading, Sandbox, V } from "../kit-ui";

const SRC = "src/features/library";

const PLAYBOOK = "playbooks/write-criteria-as-ears.md";
const TOPIC = "topics/agent-context/index.md";
const GIF_PAGE = "topics/agent-context/resume-points.md";
const VIDEO_PAGE = "topics/agent-context/bundle-sizes.md";

interface Loaded {
  page: LibraryPage;
  library: LibraryInfo;
  tree: LibraryTree;
}

/** Hands a variant a library page with its library and tree once they have loaded. */
function WithPage({
  alias,
  path,
  children,
}: {
  alias: string;
  path: string;
  children: (loaded: Loaded) => ReactNode;
}) {
  const page = useLibraryPage(alias, path).data;
  const library = useLibrary(alias);
  const tree = useLibraryTree(alias).data;
  if (!page || !library || !tree) return <Loading height={120} />;
  return <>{children({ page, library, tree })}</>;
}

/** A media file a page of the personal library names. */
function WithMedia({
  path,
  src,
  children,
}: {
  path: string;
  src: string;
  children: (media: PageMedia) => ReactNode;
}) {
  const page = useLibraryPage("me", path).data;
  const media = page?.media[src];
  if (!media) return <Loading height={120} />;
  return <>{children(media)}</>;
}

// ---------------------------------------------------------------- PageHeader

function HeaderDemo({ alias, path, edit }: { alias: string; path: string; edit?: boolean }) {
  const [view, setView] = useState<PageView>("rendered");
  return (
    <WithPage alias={alias} path={path}>
      {({ page, library }) => (
        <PageHeader
          page={page}
          library={library}
          view={view}
          onView={setView}
          onEdit={edit ? () => toast("Edit opens the markdown editor") : undefined}
        />
      )}
    </WithPage>
  );
}

function PageHeaderBody() {
  return (
    <>
      <V
        label="a workspace page · Open in Files"
        note="Breadcrumbs, the title, who changed it and when, then the actions. The workspace library is edited in Files, so it has no Edit."
        width={760}
      >
        <Sandbox quiet path={`/lib/t/wf/${PLAYBOOK}`}>
          <HeaderDemo alias="wf" path={PLAYBOOK} />
        </Sandbox>
      </V>
      <V
        label="a personal page · Edit"
        note="Only the personal library can be edited here; Rendered | Source shows the markdown as written."
        width={760}
      >
        <Sandbox quiet path={`/lib/me/${TOPIC}`}>
          <HeaderDemo alias="me" path={TOPIC} edit />
        </Sandbox>
      </V>
      <V label="phone" width={390}>
        <Sandbox quiet path={`/lib/me/${TOPIC}`}>
          <HeaderDemo alias="me" path={TOPIC} edit />
        </Sandbox>
      </V>
    </>
  );
}

// ---------------------------------------------------------------- PageTree

function TreeDemo({ alias, path }: { alias: string; path: string }) {
  return (
    <WithPage alias={alias} path={path}>
      {({ library, tree }) => (
        <div className="h-full overflow-y-auto p-3">
          <PageTree library={library} tree={tree} current={path} />
        </div>
      )}
    </WithPage>
  );
}

function PageTreeBody() {
  return (
    <>
      <V
        label="the workspace library · a playbook open"
        note="Folders are sections; the section on the way to the open page is open. Up and Down move between rows, Right opens a section, Left closes it."
        width={264}
        height={560}
      >
        <Sandbox quiet path={`/lib/t/wf/${PLAYBOOK}`}>
          <TreeDemo alias="wf" path={PLAYBOOK} />
        </Sandbox>
      </V>
      <V label="the personal library · a topic open" width={264} height={560}>
        <Sandbox quiet path={`/lib/me/${TOPIC}`}>
          <TreeDemo alias="me" path={TOPIC} />
        </Sandbox>
      </V>
    </>
  );
}

// ---------------------------------------------------------------- RightRail, Outline

function RailDemo({ alias, path }: { alias: string; path: string }) {
  return (
    <WithPage alias={alias} path={path}>
      {({ page }) => (
        <div className="h-full overflow-y-auto p-4">
          <RightRail page={page} />
        </div>
      )}
    </WithPage>
  );
}

function RightRailBody() {
  return (
    <>
      <V
        label="a playbook · On this page, Linked from, Used in issues, page facts"
        note="From 1280 px the rail docks at the right of the document; below that On this page moves to a popover in the header."
        width={280}
        height={620}
      >
        <Sandbox quiet path={`/lib/t/wf/${PLAYBOOK}`}>
          <RailDemo alias="wf" path={PLAYBOOK} />
        </Sandbox>
      </V>
      <V label="a personal topic" width={280} height={620}>
        <Sandbox quiet path={`/lib/me/${TOPIC}`}>
          <RailDemo alias="me" path={TOPIC} />
        </Sandbox>
      </V>
    </>
  );
}

function OutlineBody() {
  return (
    <>
      <V label="On this page · the second heading is being read" width={280}>
        <Sandbox quiet path={`/lib/t/wf/${PLAYBOOK}`}>
          <WithPage alias="wf" path={PLAYBOOK}>
            {({ page }) => (
              <div className="p-3">
                <Outline
                  alias={page.alias}
                  path={page.path}
                  headings={page.headings}
                  active={page.headings.filter((h) => h.depth >= 2)[1]?.anchor}
                />
              </div>
            )}
          </WithPage>
        </Sandbox>
      </V>
      <V
        label="popover · the header button between 1024 and 1279 px"
        note="Picking a heading closes it."
        width={360}
        height={260}
      >
        <Sandbox quiet path={`/lib/t/wf/${PLAYBOOK}`}>
          <WithPage alias="wf" path={PLAYBOOK}>
            {({ page }) => (
              <div className="p-4">
                <OutlinePopover alias={page.alias} path={page.path} headings={page.headings} />
              </div>
            )}
          </WithPage>
        </Sandbox>
      </V>
    </>
  );
}

// ---------------------------------------------------------------- callouts

const CALLOUTS = `> [!NOTE]
> A note: neutral and quiet. Something worth knowing while reading on.

> [!TIP]
> A tip: a shorter way, said once.

> [!IMPORTANT]
> Important: what the reader must not miss. This one takes the accent.

> [!WARNING]
> A warning is amber: it may cost time or data.

> [!CAUTION]
> Caution is red: it cannot be undone.
`;

function CalloutsBody() {
  return (
    <V
      label="the five GitHub callouts"
      note="Written as > [!NOTE] and the like, so a repo's README reads the same on GitHub. Color means severity only."
      width={720}
      height={520}
    >
      <Sandbox quiet>
        <div className="h-full overflow-y-auto px-8 py-6">
          <MarkdownProse
            document="wiki"
            md={CALLOUTS}
            wiki={{ alias: "wf", path: "x.md", links: [], media: {} }}
          />
        </div>
      </Sandbox>
    </V>
  );
}

// ---------------------------------------------------------------- media

const missing: PageMedia = { src: "media/gone.png", kind: "image", missing: true };
const large: PageMedia = {
  src: "media/demo-long.mp4",
  kind: "video",
  url: "https://example.com/demo-long.mp4",
  bytes: 48 * 1024 * 1024,
};

function MediaFigureBody() {
  return (
    <>
      <V
        label="a picture"
        note="The alt text is the caption. Clicking a picture opens it full size."
        width={560}
      >
        <MediaFigure
          media={{
            src: "media/context-bundle-poster.png",
            kind: "image",
            url: poster,
            bytes: 55334,
          }}
          alt="The context bundle of wf-3k9x2: the sections add up to 1,930 of 6,000 tokens"
        />
      </V>
      <V label="a GIF" width={560}>
        <WithMedia path={GIF_PAGE} src="media/flow.gif">
          {(media) => (
            <MediaFigure
              media={media}
              alt="An issue card moves from In progress to Review and its Now line moves with it"
            />
          )}
        </WithMedia>
      </V>
      <V label="a video file" width={560}>
        <WithMedia path={VIDEO_PAGE} src="media/context-bundle.webm">
          {(media) => (
            <MediaFigure
              media={media}
              alt="Copy context on wf-3k9x2: the sections of its bundle add up to 1,930 of 6,000 tokens"
            />
          )}
        </WithMedia>
      </V>
      <V label="a file the library does not have" width={560}>
        <MediaFigure media={missing} alt="A picture that was never added" />
      </V>
      <V
        label="a file over 25 MB"
        note="It is linked, not loaded: a stalled page is worse than a link."
        width={560}
      >
        <MediaFigure media={large} alt="A long screen recording" />
      </V>
    </>
  );
}

function GifPlayerBody() {
  return (
    <WithMedia path={GIF_PAGE} src="media/flow.gif">
      {(media) => (
        <>
          <V
            label="plays"
            note="A GIF plays unless the reader asks their system for less motion."
            width={560}
          >
            <GifPlayer
              src={media.url ?? ""}
              alt="An issue card moves to Review"
              reducedMotion={false}
            />
          </V>
          <V
            label="reduced motion · the first frame and a Play button"
            note="Any reader can start or pause it."
            width={560}
          >
            <GifPlayer src={media.url ?? ""} alt="An issue card moves to Review" reducedMotion />
          </V>
        </>
      )}
    </WithMedia>
  );
}

function VideoPlayerBody() {
  return (
    <V
      label="a video file"
      note="Controls, no autoplay, and only the metadata is loaded until it is played."
      width={560}
    >
      <WithMedia path={VIDEO_PAGE} src="media/context-bundle.webm">
        {(media) => (
          <VideoPlayer src={media.url ?? ""} label="The sections of the context bundle" />
        )}
      </WithMedia>
    </V>
  );
}

const EMBEDS = [
  {
    label: "YouTube",
    href: "https://youtu.be/zjkBMFhNj_g",
    title: "Intro to Large Language Models",
  },
  { label: "Vimeo", href: "https://vimeo.com/76979871", title: undefined },
  {
    label: "Loom",
    href: "https://www.loom.com/share/0123456789abcdef0123456789abcdef",
    title: undefined,
  },
] as const;

const withPoster = parseEmbed("https://youtu.be/zjkBMFhNj_g");

function EmbedCardBody() {
  return (
    <>
      {EMBEDS.map((e) => {
        const embed = parseEmbed(e.href);
        if (!embed) return null;
        return (
          <V
            key={e.label}
            label={e.title ? `${e.label} · with the words of the link` : `${e.label} · no words`}
            note={
              e.label === "YouTube"
                ? "A line holding only a video link is a card. Nothing is requested from the site until the card is clicked."
                : undefined
            }
            width={560}
          >
            <EmbedCard embed={embed} title={e.title} />
          </V>
        );
      })}
      {withPoster && (
        <V label="with a picture from the library as its poster" width={560}>
          <EmbedCard embed={withPoster} title="Intro to Large Language Models" poster={poster} />
        </V>
      )}
    </>
  );
}

export const libraryPartsEntries: KitEntry[] = [
  entry(
    "Library",
    "PageHeader",
    `${SRC}/PageHeader.tsx`,
    "Every page opens with where it is, what it is called, who last changed it, and what you can do with it: ask about it, link it to an issue, copy its link, open it where it lives.",
    PageHeaderBody,
  ),
  entry(
    "Library",
    "PageTree",
    `${SRC}/PageTree.tsx`,
    "The folders of a library are its sections and every file is a page, so the tree you click is the folder structure you would edit, and the open page is always in view.",
    PageTreeBody,
  ),
  entry(
    "Library",
    "RightRail",
    `${SRC}/RightRail.tsx`,
    "What a page links to and what links to it sit beside the text, with the issues that use it, so a page is never read alone.",
    RightRailBody,
  ),
  entry(
    "Library",
    "OnThisPage",
    `${SRC}/OnThisPage.tsx`,
    "The headings of the page as a list that follows your reading, so a long page is easy to move around in.",
    OutlineBody,
  ),
  entry(
    "Library",
    "Callouts",
    "src/components/common/MarkdownProse.tsx",
    "The five GitHub callouts draw attention in the same words on GitHub and here, and only a warning or a caution carries color.",
    CalloutsBody,
  ),
  entry(
    "Library",
    "MediaFigure",
    "src/components/common/MarkdownMedia.tsx",
    "A picture, a GIF or a video in a page comes with its caption, and a missing or very large file says so instead of leaving a gap or stalling the page.",
    MediaFigureBody,
  ),
  entry(
    "Library",
    "GifPlayer",
    "src/components/common/MarkdownMedia.tsx",
    "A GIF plays for most readers and stays still for those who asked for less motion, and either can start or pause it.",
    GifPlayerBody,
  ),
  entry(
    "Library",
    "VideoPlayer",
    "src/components/common/MarkdownMedia.tsx",
    "A video file has its own controls, never starts by itself and costs nothing until it is played.",
    VideoPlayerBody,
  ),
  entry(
    "Library",
    "EmbedCard",
    "src/components/common/MarkdownMedia.tsx",
    "A YouTube, Vimeo or Loom link on a line of its own becomes a card, and the player (and the request to its site) waits for a click.",
    EmbedCardBody,
  ),
];
