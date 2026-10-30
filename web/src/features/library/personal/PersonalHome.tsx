// The home of the personal library (`/lib/me`): what one person is researching, the codebases
// they work in, and what their work adds up to (spec 3). Each part is a section of markdown
// pages of their private repo; this page only draws the shelf. Before the library is set up, the
// first visit asks how.
import { Lock } from "lucide-react";
import { Chip } from "@/components/ui";
import { useLibrary, useLibraryTree } from "@/lib/api";
import { PERSONAL_ALIAS } from "../address";
import { CodebasesSection } from "./CodebasesSection";
import { repoSlug } from "./codebase";
import { PersonalSetup } from "./PersonalSetup";
import { usePersonalSetup } from "./setup";
import { usePersonalAgent } from "./summarize";
import { TopicsSection } from "./TopicsSection";
import { WorkSection } from "./WorkSection";

export function PersonalHome() {
  const ready = usePersonalSetup((s) => s.ready);
  const repo = usePersonalSetup((s) => s.repo);
  const library = useLibrary(PERSONAL_ALIAS);
  const tree = useLibraryTree(PERSONAL_ALIAS).data;
  const agent = usePersonalAgent();
  if (!ready) return <PersonalSetup />;
  const url = repo
    ? `github.com/${repo}`
    : library?.url
      ? `github.com/${repoSlug(library.url)}`
      : undefined;
  return (
    <div data-wf="PersonalHome" className="flex flex-col gap-10">
      <header className="flex flex-col gap-1.5">
        <h1 className="m-0 font-semibold text-[26px] text-fg leading-tight tracking-[-0.02em] min-[1280px]:text-[28px]">
          Personal library
        </h1>
        <p className="m-0 text-fg-muted text-lg leading-snug">
          Your research, your codebases and your work, as markdown. Only you see it.
        </p>
        <p className="m-0 flex flex-wrap items-center gap-x-2 gap-y-1 pt-1 text-fg-faint text-sm">
          <Lock aria-hidden size={12} strokeWidth={1.75} />
          Private
          {url && <span className="font-mono text-xs">{url}</span>}
          {library && (
            <span className="tabular">
              {library.pages} {library.pages === 1 ? "page" : "pages"}
            </span>
          )}
        </p>
      </header>
      <TopicsSection tree={tree} />
      <CodebasesSection tree={tree} />
      <WorkSection />
      {!agent && (
        <p className="m-0 flex flex-wrap items-center gap-2 border-border border-t pt-4 text-fg-faint text-sm leading-snug">
          <Chip tone="outline">Prototype</Chip>
          No agent is connected, so Refresh and Summarize are written by the dashboard itself. With
          one connected, it runs the summarizing skills instead.
        </p>
      )}
    </div>
  );
}
