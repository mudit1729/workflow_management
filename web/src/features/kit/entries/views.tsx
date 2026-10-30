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
      <Bar label="Workdatabase · Library" view="workdatabase" path="/lib" />
      <Bar label="Workdatabase · Glossary" view="workdatabase" path="/glossary" />
      <Bar
        label="Workdatabase · Files"
        note="A red dot shows when any file has an error finding."
        view="workdatabase"
        path="/files"
      />
      <Bar
        label="Workdatabase · Skills"
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
    "Workflow (Board) and Workdatabase (Library, Glossary, Files, Skills) each have sub-views, so every page opens its top bar with them as real links, and the active tab and the counts say where you are and what it holds.",
    ViewTabsBody,
  ),
];
