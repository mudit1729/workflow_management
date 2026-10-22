// Every element in the kit, in index order. A group's entries keep the order of their file.
import { boardEntries } from "./entries/board";
import { diagramEntries } from "./entries/diagrams";
import { filesEntries } from "./entries/files";
import { foundationEntries } from "./entries/foundations";
import { inboxEntries } from "./entries/inbox";
import { issueFilesEntries } from "./entries/issue-files";
import { issueGoalEntries } from "./entries/issue-goal";
import { issueHeaderEntries } from "./entries/issue-header";
import { issueLogEntries } from "./entries/issue-log";
import { issueNowEntries } from "./entries/issue-now";
import { issuePlanEntries } from "./entries/issue-plan";
import { libraryEntries } from "./entries/library";
import { primitiveEntries } from "./entries/primitives";
import { sharedEntries } from "./entries/shared";
import { shellEntries } from "./entries/shell";
import { GROUPS, type KitEntry } from "./kit-ui";

const ALL: KitEntry[] = [
  ...foundationEntries,
  ...shellEntries,
  ...boardEntries,
  ...issueHeaderEntries,
  ...issueNowEntries,
  ...issueGoalEntries,
  ...issuePlanEntries,
  ...issueLogEntries,
  ...issueFilesEntries,
  ...filesEntries,
  ...diagramEntries,
  ...libraryEntries,
  ...inboxEntries,
  ...sharedEntries,
  ...primitiveEntries,
];

export const ENTRIES: KitEntry[] = GROUPS.flatMap((g) => ALL.filter((e) => e.group === g));

export const INDEX = GROUPS.map((group) => ({
  group,
  entries: ENTRIES.filter((e) => e.group === group),
})).filter((g) => g.entries.length > 0);
