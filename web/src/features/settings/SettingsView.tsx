// Settings (spec 5): one page with the tabs Skills flow, Agent and Workspace in the top bar, in the
// style of the Library's. A gear in the nav footer opens it. The flow tab is the one that matters:
// which skill runs each step of the work, clickable to change. The editor of a skill copy is a page
// of the same tab (/settings/flow/edit).
import { ViewTabs } from "@/components/common";
import { useElementWidth } from "@/features/library/useElementWidth";
import { AgentTab } from "./AgentTab";
import { FlowTab } from "./FlowTab";
import { SkillEditorPage } from "./SkillEditor";
import { WorkspaceTab } from "./WorkspaceTab";

export type SettingsPage = "flow" | "edit" | "agent" | "workspace";

export function SettingsView({ page }: { page: SettingsPage }) {
  // The page's own width, not the window's: the rail counts as page.
  const [measure, width] = useElementWidth();
  return (
    <div
      ref={measure}
      data-wf="SettingsView"
      data-page={page}
      className="flex h-full min-h-0 min-w-0 flex-col bg-bg"
    >
      <header className="flex h-(--wf-topbar-h) shrink-0 items-center gap-3 border-border border-b bg-bg px-4 sm:gap-4">
        <ViewTabs view="settings" />
        {width >= 1000 && (
          <span className="ml-auto min-w-0 truncate text-fg-faint text-sm">
            The team's choices are in workflow.toml, yours in library.toml
          </span>
        )}
      </header>
      {page === "flow" && <FlowTab width={width} />}
      {page === "edit" && <SkillEditorPage width={width} />}
      {page === "agent" && <AgentTab />}
      {page === "workspace" && <WorkspaceTab />}
    </div>
  );
}
