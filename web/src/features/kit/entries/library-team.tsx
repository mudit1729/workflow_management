// Kit entries for Add team library (spec 4.1): each screen of the dialog in a framed surface (the
// real dialog is modal and would cover the page). Every frame runs the real flow, so a click goes
// on to the next screen. The example library is read from the fixture repo (web/mock/teams), and
// nothing is added for real: Add shows a toast instead, so the library list does not change.
import type { Failure, Found, Outcome, Preview } from "@mock/libraries/github";
import { useEffect, useRef } from "react";
import { toast } from "sonner";
import { AddLibraryPanel } from "@/features/library/team/AddLibraryPanel";
import type { Controller, Deps } from "@/features/library/team/controller";
import { useAddLibraryFlow } from "@/features/library/team/useAddLibraryFlow";
import type { LibraryInfo } from "@/lib/api/types";
import { entry, type KitEntry, Sandbox, V } from "../kit-ui";

const SRC = "src/features/library/team";

const github = () => import("@mock/libraries/github");

/** The real reader (the fixture answers offline), and an Add that only says what it would do. */
const KIT_DEPS: Partial<Deps> = {
  find: async (raw) => (await github()).findLibrary(raw),
  register: async (source) =>
    ({
      alias: source.alias,
      kind: "team",
      name: source.name,
      pages: Object.keys(source.files).length,
      media: Object.keys(source.media).length,
      others: source.others?.length ?? 0,
      home: null,
      editable: false,
      loaded: true,
    }) satisfies LibraryInfo,
  taken: () => ["me", "wf"],
  added: (info) =>
    toast(`Add would open ${info.name}`, { description: "Nothing was added in the kit." }),
};

const fail = (failure: Failure) => async (): Promise<Outcome<Found>> => ({ ok: false, failure });

/** A repo with two folders that could be the library, so the folder question is asked. */
const MONOREPO = {
  repo: {
    owner: "acme",
    repo: "monorepo",
    url: "https://github.com/acme/monorepo",
    defaultBranch: "main",
    ref: "main",
    commit: "9f8e7d6c5b4a3210fedcba9876543210fedcba98",
    message: "Move the runbooks to docs/",
    author: "li",
    paths: [],
    sizes: {},
    truncated: false,
  },
  manifest: { order: [], owners: [] },
  choices: [
    { root: "docs", pages: 42, media: 6, by: "folder" },
    { root: "wiki", pages: 8, media: 0, by: "folder" },
  ],
} as unknown as Found;

const MONOREPO_PREVIEW: Preview = {
  name: "Monorepo docs",
  description: "How the platform team builds, ships and runs things.",
  pages: 42,
  media: 6,
  others: 3,
  page: "README.md",
  pageTitle: "Monorepo docs",
  pageText: "# Monorepo docs\n\nStart with **Getting started**, then the runbooks.\n",
};

interface FrameProps {
  label: string;
  note?: string;
  /** Puts the controller on the screen to show. */
  script?: (c: Controller) => void;
  deps?: Partial<Deps>;
  height?: number;
}

function Surface({ script, deps }: Pick<FrameProps, "script" | "deps">) {
  const flow = useAddLibraryFlow({ onClose: () => {}, deps: { ...KIT_DEPS, ...deps } });
  const ran = useRef(false);
  useEffect(() => {
    if (ran.current) return;
    ran.current = true;
    script?.(flow.controller);
  }, [script, flow.controller]);
  return (
    <div data-wf="AddLibrarySurface" className="flex min-h-0 flex-1 flex-col bg-bg">
      <header className="flex h-11 shrink-0 items-center px-4 font-semibold text-fg text-md">
        Add team library
      </header>
      <AddLibraryPanel flow={flow} autoFocus={false} />
    </div>
  );
}

function Screen({ label, note, script, deps, height = 520 }: FrameProps) {
  return (
    <V label={label} note={note} width={600} height={height}>
      <Sandbox quiet path="/lib">
        <Surface script={script} deps={deps} />
      </Sandbox>
    </V>
  );
}

const EXAMPLE_LINK = "https://github.com/acme/platform-handbook";

function LinkBody() {
  return (
    <>
      <Screen
        label="1 · paste a GitHub link"
        note="The one place that asks for typing. A pasted link goes on at once. The example is a repo this prototype knows, so it works offline."
      />
      <Screen
        label="1 · a link that cannot be used"
        note="One sentence, and nothing to press: change the link."
        script={(c) => c.paste("https://gitlab.com/acme/handbook")}
      />
      <Screen
        label="1 · a private repo"
        note="A private repo is read by an agent, with your own git credentials."
        script={(c) => c.paste("acme/secret")}
        deps={{
          find: fail({ kind: "private", message: "acme/secret is private, or the name is wrong." }),
        }}
      />
      <Screen
        label="1 · GitHub cannot be reached from this page"
        script={(c) => c.paste("acme/anything")}
        deps={{
          find: fail({ kind: "unreachable", message: "Could not reach GitHub from this page." }),
        }}
      />
      <Screen
        label="1 · reading GitHub"
        script={(c) => c.paste("acme/platform-handbook")}
        deps={{ find: () => new Promise(() => {}) }}
        height={400}
      />
    </>
  );
}

function RootBody() {
  return (
    <Screen
      label="2 · which folder is the library"
      note="Asked only when the repo has more than one folder of pages. Number keys pick, Enter goes on."
      script={(c) => c.paste("acme/monorepo")}
      deps={{
        find: async () => ({ ok: true, value: MONOREPO }),
        preview: async () => MONOREPO_PREVIEW,
      }}
      height={460}
    />
  );
}

function PreviewBody() {
  return (
    <Screen
      label="3 · the example library"
      note="Name, counts, the last commit, the alias (Edit changes it) and the first page, small. Add reads every page and opens the library."
      script={(c) => c.paste(EXAMPLE_LINK)}
      height={640}
    />
  );
}

export const libraryTeamEntries: KitEntry[] = [
  entry(
    "Library · Team",
    "AddTeamLibrary · link",
    `${SRC}/screens.tsx`,
    "A team library is added by pasting its GitHub link, and a link that cannot work says why in one sentence instead of failing later.",
    LinkBody,
  ),
  entry(
    "Library · Team",
    "AddTeamLibrary · folder",
    `${SRC}/screens.tsx`,
    "When a repo holds several folders of pages, one question settles which is the library, with the number of pages beside each.",
    RootBody,
  ),
  entry(
    "Library · Team",
    "AddTeamLibrary · preview",
    `${SRC}/screens.tsx`,
    "Before anything is added you see what it is: its name, size, last commit and first page, so Add is a decision, not a guess.",
    PreviewBody,
  ),
];
