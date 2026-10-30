import { ViewTabs, type WfView } from "@/components/common";
import { entry, type KitEntry, Sandbox, V } from "../kit-ui";

const SRC = "src/components/common";

/** The left end of a page's one 44 px top bar, in a private router that starts at `path`. */
function Bar({
  label,
  note,
  view,
  path,
  width = 520,
}: {
  label: string;
  note?: string;
  view: WfView;
  path: string;
  width?: number;
}) {
  return (
    <V label={label} note={note} width={width}>
      <Sandbox path={path}>
        <header className="flex h-(--wf-topbar-h) items-center overflow-hidden rounded-md border border-border bg-bg px-4">
          <ViewTabs view={view} />
        </header>
      </Sandbox>
    </V>
  );
}

function ViewTabsBody() {
  return (
    <>
      <Bar
        label="Workflow · Board"
        note="The board, its drawer (/w/i/$id) and the full issue page (/i/$id) all count as Board. Workflow has the one tab: what needs you is a filter of the board, not a page. Under 900 px the view name gives way to its icon, under 420 px the icon goes too."
        view="workflow"
        path="/w"
      />
      <Bar
        label="Library · Personal"
        note="The Library home (/lib) shows the Library tabs with none active; Personal and Team libraries are pages of their own, and the Glossary is a page of the workspace library."
        view="workdatabase"
        path="/lib/me"
      />
      <Bar label="Library · Team libraries" view="workdatabase" path="/lib/t/wf" />
      <Bar
        label="Library · Files"
        note="A red dot shows when any file has an error finding."
        view="workdatabase"
        path="/files"
      />
      <Bar
        label="Library · Skills"
        note="The count is the skills of every plugin in the repository."
        view="workdatabase"
        path="/skills"
      />
    </>
  );
}

export const viewsEntries: KitEntry[] = [
  entry(
    "Shell",
    "ViewTabs",
    `${SRC}/ViewTabs.tsx`,
    "Workflow (Board) and Library (Personal, Team libraries, Files, Skills) each have sub-views, so every page opens its top bar with them as real links, and the active tab and the counts say where you are and what it holds.",
    ViewTabsBody,
  ),
];
