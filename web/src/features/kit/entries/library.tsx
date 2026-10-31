import { useState } from "react";
import { MarkdownProse } from "@/components/common";
import { Button } from "@/components/ui";
import { GlossaryView, PromoteDialog } from "@/features/library";
import { LibraryHome } from "@/features/library/LibraryHome";
import { WikiView } from "@/features/library/WikiView";
import type { DecisionEntry, LearningEntry } from "@/gen/types";
import { entry, type KitEntry, Row, Sandbox, V, WhenVisible, WithDetail } from "../kit-ui";
import { ISSUE } from "./data";

const SRC = "src/features/library";

const PLAYBOOK = "playbooks/write-criteria-as-ears.md";

// ---------------------------------------------------------------- WikiView

function WikiViewBody() {
  return (
    <>
      <V
        label="a page · tree, document, right rail (from 1280 px)"
        note="The workspace library, its playbook page. The tree is the folders of library/; On this page, Linked from, Used in issues and the page facts are on the right."
        fill
        height={680}
      >
        <Sandbox quiet path={`/lib/t/wf/${PLAYBOOK}`}>
          <WikiView alias="wf" path={PLAYBOOK} />
        </Sandbox>
      </V>
      <V label="the Glossary page" fill height={620}>
        <WhenVisible>
          <Sandbox quiet path="/lib/t/wf/glossary.md">
            <WikiView alias="wf" path="glossary.md" />
          </Sandbox>
        </WhenVisible>
      </V>
      <V
        label="a library without a home page · the overview is drawn from the tree"
        fill
        height={560}
      >
        <WhenVisible>
          <Sandbox quiet path="/lib/t/wf">
            <WikiView alias="wf" path="" />
          </Sandbox>
        </WhenVisible>
      </V>
      <V label="search results" fill height={520}>
        <WhenVisible>
          <Sandbox quiet path="/lib/t/wf?q=criteria">
            <WikiView alias="wf" path={PLAYBOOK} />
          </Sandbox>
        </WhenVisible>
      </V>
      <V label="phone: the document alone, the tree is a sheet" width={390} height={640}>
        <WhenVisible>
          <Sandbox quiet path={`/lib/t/wf/${PLAYBOOK}`}>
            <WikiView alias="wf" path={PLAYBOOK} />
          </Sandbox>
        </WhenVisible>
      </V>
    </>
  );
}

// ---------------------------------------------------------------- LibraryHome

function LibraryHomeBody() {
  return (
    <V label="cards for each library, then the pages opened last" fill height={560}>
      <Sandbox quiet path="/lib">
        <LibraryHome />
      </Sandbox>
    </V>
  );
}

// ---------------------------------------------------------------- MarkdownProse, wiki

const WIKI_MD = `## Callouts

> [!NOTE]
> A note: neutral, quiet.

> [!TIP]
> A tip.

> [!IMPORTANT]
> Important: the indigo accent.

> [!WARNING]
> A warning is amber.

> [!CAUTION]
> Caution is red.

## Links and code

A [[playbooks/write-criteria-as-ears]] link, a [[playbooks/gone]] link that goes nowhere, and \`inline code\`.

\`\`\`sh
git pull --ff-only
\`\`\`

## A video link

https://www.youtube.com/watch?v=dQw4w9WgXcQ
`;

function ProseWikiBody() {
  return (
    <V
      label="wiki typography, callouts, a video card"
      note="Body 15 to 16 px at about 1.65, headings 22 / 18. The video card loads its player only when clicked."
      width={720}
      height={720}
    >
      <Sandbox quiet>
        <div className="h-full overflow-y-auto px-8 py-6">
          <MarkdownProse
            document="wiki"
            md={WIKI_MD}
            wiki={{ alias: "wf", path: "x.md", links: [], media: {} }}
          />
        </div>
      </Sandbox>
    </V>
  );
}

// ---------------------------------------------------------------- GlossaryView

function GlossaryViewBody() {
  return (
    <V label="with its own search box" width={760} height={600}>
      <Sandbox quiet>
        <GlossaryView />
      </Sandbox>
    </V>
  );
}

// ---------------------------------------------------------------- PromoteDialog

function PromoteDemo({
  label,
  pick,
}: {
  label: string;
  pick: (learn: LearningEntry[], dec: DecisionEntry[]) => LearningEntry | DecisionEntry | undefined;
}) {
  const [open, setOpen] = useState(false);
  return (
    <WithDetail id={ISSUE.rich}>
      {(d) => {
        const e = pick(d.learnings, d.decisions);
        if (!e) return null;
        return (
          <>
            <Button variant="secondary" size="sm" onClick={() => setOpen(true)}>
              {label}
            </Button>
            <PromoteDialog open={open} onOpenChange={setOpen} issueId={d.summary.id} entry={e} />
          </>
        );
      }}
    </WithDetail>
  );
}

function PromoteDialogBody() {
  return (
    <V
      label="open with a real entry of wf-3k9x2"
      note="Create draft writes a draft item into the mock data and asks the group owner to review."
    >
      <Row>
        <PromoteDemo
          label="Candidate tip · L-9mz4e"
          pick={(l) => l.find((x) => x.id === "L-9mz4e")}
        />
        <PromoteDemo
          label="Plain pattern · L-6ct3p"
          pick={(l) => l.find((x) => x.id === "L-6ct3p")}
        />
        <PromoteDemo
          label="Gotcha with a similar item · L-2gk7r"
          pick={(l) => l.find((x) => x.id === "L-2gk7r")}
        />
        <PromoteDemo
          label="Decision · D-7f3k2"
          pick={(_, d) => d.find((x) => x.id === "D-7f3k2")}
        />
      </Row>
    </V>
  );
}

export const libraryEntries: KitEntry[] = [
  entry(
    "Library",
    "WikiView",
    `${SRC}/WikiView.tsx`,
    "A library reads as a calm document wiki: the page tree on the left, the page in the middle at a comfortable measure, and what links to it and where it is used on the right.",
    WikiViewBody,
  ),
  entry(
    "Library",
    "LibraryHome",
    `${SRC}/LibraryHome.tsx`,
    "The Library home shows every library as a card, yours first, and the pages you opened last, so the way back to work in progress is one click.",
    LibraryHomeBody,
  ),
  entry(
    "Library",
    "MarkdownProse (wiki)",
    "src/components/common/MarkdownProse.tsx",
    "The same renderer as the issue views, with document typography, anchors on headings, GitHub callouts, wiki links that go dashed when broken, and media that never loads before it is asked for.",
    ProseWikiBody,
  ),
  entry(
    "Library",
    "GlossaryView",
    `${SRC}/GlossaryView.tsx`,
    "The glossary fixes one word per idea and lists the words to avoid, which is what the S09 lint enforces in every issue.",
    GlossaryViewBody,
  ),
  entry(
    "Library",
    "PromoteDialog",
    `${SRC}/PromoteDialog.tsx`,
    "Promotion turns an issue's learning or decision into a reusable draft; the dialog previews it and warns about near-duplicates before a reviewer sees it.",
    PromoteDialogBody,
  ),
];
