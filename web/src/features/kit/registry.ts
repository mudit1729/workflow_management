// Every element in the kit, in index order. A group's entries keep the order of their file.
import { addWorkEntries } from "./entries/add-work";
import { boardEntries } from "./entries/board";
import { codexEntries } from "./entries/codex";
import { contextEntries } from "./entries/context";
import { diagramEntries } from "./entries/diagrams";
import { filesEntries } from "./entries/files";
import { foundationEntries } from "./entries/foundations";
import { issueDeliveryEntries } from "./entries/issue-delivery";
import { issueFilesEntries } from "./entries/issue-files";
import { issueGoalEntries } from "./entries/issue-goal";
import { issueHeaderEntries } from "./entries/issue-header";
import { issueLogEntries } from "./entries/issue-log";
import { issueNowEntries } from "./entries/issue-now";
import { issuePlanEntries } from "./entries/issue-plan";
import { libraryEntries } from "./entries/library";
import { libraryViewerEntries } from "./entries/library-viewer";
import { primitiveEntries } from "./entries/primitives";
import { sharedEntries } from "./entries/shared";
import { shellEntries } from "./entries/shell";
import { skillsEntries } from "./entries/skills";
import { viewsEntries } from "./entries/views";
import { GROUPS, type KitEntry } from "./kit-ui";

const ALL: KitEntry[] = [
  ...foundationEntries,
  ...shellEntries,
  ...viewsEntries,
  ...boardEntries,
  ...addWorkEntries,
  ...codexEntries,
  ...issueHeaderEntries,
  ...issueNowEntries,
  ...issueGoalEntries,
  ...issuePlanEntries,
  ...issueDeliveryEntries,
  ...issueLogEntries,
  ...issueFilesEntries,
  ...diagramEntries,
  ...libraryEntries,
  ...libraryViewerEntries,
  ...skillsEntries,
  ...contextEntries,
  ...filesEntries,
  ...sharedEntries,
  ...primitiveEntries,
];

export const ENTRIES: KitEntry[] = GROUPS.flatMap((g) => ALL.filter((e) => e.group === g));

export const INDEX = GROUPS.map((group) => ({
  group,
  entries: ENTRIES.filter((e) => e.group === group),
})).filter((g) => g.entries.length > 0);
