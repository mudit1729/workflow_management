// The seed world: the dogfood workspace of wf, tracking its own build.
// `seedWorld()` returns a FRESH deep object on every call, because
// `mockControls.reset()` calls it again. Timestamps come from the real clock
// (see ../time.ts), so every relative time reads naturally on load.
import type { WorkspaceConfig } from "@/gen/types";
import type { IssueSrc, WorldSrc } from "../source";
import { seedAuthors } from "./authors";
import { seedGlossary } from "./glossary";
import { seedGroups } from "./groups";
import { archifyEmbedSizes } from "./issues/archify-embed-sizes";
import { backgroundArchifyRenders } from "./issues/background-archify-renders";
import { buildV1 } from "./issues/build-v1";
import { contextTokenBudget } from "./issues/context-token-budget";
import { glossarySynonymLint } from "./issues/glossary-synonym-lint";
import { hedgeWordLint } from "./issues/hedge-word-lint";
import { liveBoardUpdates } from "./issues/live-board-updates";
import { metaListSpans } from "./issues/meta-list-spans";
import {
  agentHandoffNotes,
  cutRelease,
  githubTwoWaySync,
  indexScanAndSnapshot,
  resumeOnSessionStart,
  silentTokenRefresh,
  ssoLogin,
  userGuide,
  writeBackOneValue,
} from "./issues/others";
import { promoteLearnings } from "./issues/promote-learnings";
import { reapExpiredLeases } from "./issues/reap-expired-leases";
import { skillsFlowchart } from "./issues/skills-flowchart";
import {
  boardKeyboardNavigation,
  commandPalette,
  dragBetweenColumns,
  drawerWidthJump,
  groupRollupBars,
  tabTitleCount,
} from "./issues/web-issues";
import { seedLibrary } from "./library";

export function seedConfig(): WorkspaceConfig {
  return {
    name: "wf",
    wf_format: 1,
    id_prefix: "wf",
    issues_dir: "issues",
    library_dir: "library",
    leases_minutes: 60,
    staleness: { issue_hours: 24, task_hours: 4 },
    author: "shruti",
    archify: "unavailable",
  };
}

/** Every issue of the world, richest first. Each builder returns a fresh object. */
function seedIssues(): IssueSrc[] {
  return [
    liveBoardUpdates(),
    buildV1(),
    skillsFlowchart(),
    promoteLearnings(),
    contextTokenBudget(),
    metaListSpans(),
    glossarySynonymLint(),
    reapExpiredLeases(),
    backgroundArchifyRenders(),
    hedgeWordLint(),
    archifyEmbedSizes(),
    userGuide(),
    agentHandoffNotes(),
    commandPalette(),
    boardKeyboardNavigation(),
    drawerWidthJump(),
    tabTitleCount(),
    dragBetweenColumns(),
    groupRollupBars(),
    resumeOnSessionStart(),
    cutRelease(),
    githubTwoWaySync(),
    ssoLogin(),
    silentTokenRefresh(),
    indexScanAndSnapshot(),
    writeBackOneValue(),
  ];
}

export function seedWorld(): WorldSrc {
  return {
    config: seedConfig(),
    authors: seedAuthors(),
    groups: seedGroups(),
    issues: seedIssues(),
    library: seedLibrary(),
    glossary: seedGlossary(),
  };
}

/**
 * Targets of the scripted live events (see ../events.ts). The IDs are fixed by
 * UI_BUILD.md: the event loop and the DevPanel depend on them.
 */
export const EVENT_TARGETS = {
  appendChange: { issue: "wf-3k9x2", task: "T-3" },
  rewriteState: "wf-3k9x2",
  newBlockingQuestion: "wf-x5hd3",
  leaseExpires: { issue: "wf-skf01", task: "T-2" },
  moveToReview: "wf-h2tb7",
  markBlocked: { issue: "wf-t3jp5", by: "wf-w8vz4" },
  appendDecision: "wf-skf01",
  answerFyi: { issue: "wf-y4bz7", request: "Q-5ys8j" },
} as const;
