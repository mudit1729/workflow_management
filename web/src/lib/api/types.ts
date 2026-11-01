// Types shared by the client, the mock server and the hooks.
import type {
  ContextLink,
  Diagnostic,
  FlowConfig,
  GroupId,
  Handle,
  IssueId,
  Op,
  OpResult,
  Priority,
  Rev,
  Size,
  TaskId,
  Ts,
} from "@/gen/types";

/** Where `search` looks. `all` mixes every kind of hit. */
export type SearchScope = "all" | "issues" | "entries" | "docs" | "library" | "terms";

/** `new_issue` also carries the size picked in the dialog (the generated type predates it). */
export type NewIssueOp = Extract<Op, { op: "new_issue" }> & { size?: Size };

// ---------------------------------------------------------------- add work

/** One issue `create_work` writes as a `goal.md`. */
export interface WorkIssueInput {
  title: string;
  priority: Priority;
  size: Size;
  status: "backlog" | "planned";
  /** EARS sentences, one `SC-n` each, in order. At least one. */
  criteria: string[];
  /** Prose for `## Context`. Empty keeps the template's own text. */
  context?: string;
  /** Workdatabase items to link under `## Links`, in order. */
  links?: ContextLink[];
}

/**
 * An existing group by id, or a new group to create under `parent`. `goal` is the outcome in one
 * line: it becomes `goal:` in `_group.md` (`adding-work`, step 5), and the board shows it as the
 * tooltip of the group.
 */
export type WorkGroup = GroupId | { parent: GroupId; title: string; goal?: string };

/**
 * Add work: the group (new or existing) and 1 to 8 issues, written as `_group.md` and `goal.md`
 * files in ONE commit with one activity entry.
 */
export interface CreateWorkOp {
  op: "create_work";
  base_rev: Rev;
  group: WorkGroup;
  issues: WorkIssueInput[];
}

/** What `create_work` created: the group and the issues, in the order they were sent. */
export interface CreateWorkResult {
  groupId: GroupId;
  issueIds: IssueId[];
}

/** `OpResult` of `create_work`; `created` holds the group id. */
export interface WorkOpResult extends OpResult {
  work: CreateWorkResult;
}

/** Every op the client may send. */
export type WfOp = Exclude<Op, { op: "new_issue" }> | NewIssueOp | CreateWorkOp;

/** The progress the person sees while Codex splits a group, in order. */
export const SPLIT_STEPS = [
  "Reading the group",
  "Reading linked context",
  "Splitting into issues",
] as const;

/** What Codex reads to split a group into issues. `context` holds library, glossary or file ids. */
export interface SplitInput {
  title: string;
  outcome: string;
  size?: Size;
  context: string[];
}

/** One issue Codex proposes. The person keeps or drops it before it is added. */
export interface Proposal {
  /** Stable within one result. */
  key: string;
  /** Imperative verb first. */
  title: string;
  size: Size;
  priority: Priority;
  /** An EARS sentence for `SC-1`. */
  criterion: string;
  /** One line, imperative verb first. */
  why: string;
}

export interface SplitResult {
  issues: Proposal[];
}

// ---------------------------------------------------------------- delivery: git, PRs, CI
// Derived, never written into the workspace (plan D2). The prototype reads a fixture while the
// sample is loaded and what a Codex run adds; `wf serve` reads `git` and `gh`.

export interface Commit {
  /** 7 hex characters. */
  sha: string;
  subject: string;
  author: Handle;
  at: Ts;
  branch: string;
  task?: TaskId;
  /** Number of the pull request that carries the commit. */
  pr?: number;
  files_changed: number;
  /**
   * The line that ties the commit to the issue (`Issue: wf-3k9x2`). Absent when only the branch
   * name (`wf-3k9x2/…`) does.
   */
  trailer?: string;
}

export type PullRequestState = "open" | "draft" | "merged" | "closed";
export type ReviewState = "approved" | "changes_requested" | "pending";

export interface PullRequest {
  number: number;
  title: string;
  state: PullRequestState;
  branch: string;
  author: Handle;
  updated_at: Ts;
  checks: { passed: number; failed: number; pending: number };
  review: ReviewState;
  /** `null` in the prototype: there is no GitHub to link to. */
  url?: string | null;
}

export type PipelineStatus = "queued" | "in_progress" | "completed";
export type PipelineConclusion = "success" | "failure" | "cancelled";

export interface PipelineJob {
  name: string;
  /** Absent while the job has not finished. */
  conclusion?: PipelineConclusion;
  duration_s?: number;
}

export interface PipelineRun {
  id: string;
  workflow: string;
  trigger: "push" | "pull_request";
  branch: string;
  sha: string;
  status: PipelineStatus;
  /** Present when `status` is `completed`. */
  conclusion?: PipelineConclusion;
  started_at: Ts;
  /** Wall time of the run. Present when `status` is `completed`. */
  duration_s?: number;
  jobs: PipelineJob[];
}

/** Everything git, GitHub and CI know about one issue, newest first. */
export interface Delivery {
  commits: Commit[];
  prs: PullRequest[];
  pipelines: PipelineRun[];
}

// ---------------------------------------------------------------- Codex runs

/** The kinds of run Codex starts. `next_step` does the next ready task of an issue. */
export type CodexRunKind = "next_step";

/**
 * `running` until the last phase lands. `nothing_ready` ends at once (see `reason`). `failed`
 * means the task changed under the run (see `reason`).
 */
export type CodexRunStatus = "running" | "done" | "failed" | "cancelled" | "nothing_ready";

/**
 * The phases of a `next_step` run, in order: `claim` (with the plan first when the issue has
 * none), `log`, `verify` (CI; absent when the flow commits nothing), one `custom:<id>` for each
 * custom step after Do next step that runs, and `done`.
 */
export type CodexPhaseId = "claim" | "log" | "verify" | "done" | `custom:${string}`;

export interface CodexPhase {
  id: CodexPhaseId;
  /** Imperative, for a step list: "Claim T-2". */
  label: string;
  /**
   * The skill that ran the phase, as a reference (`doing-next-step`, `ws:acme-planning`): the Plan
   * step's skill for a claim that plans first, the Log step's for `log`, a custom step's own, the
   * Do next step's for the rest. Shown in the tooltip of the run strip and in the run's details.
   */
  skill?: string;
  /**
   * `running` only while the run is `running`. A run that stops early (`cancelled`, `failed`)
   * leaves the phase it cut short, and the ones after it, `pending`.
   */
  state: "pending" | "running" | "done";
}

export interface CodexRun {
  id: string;
  issue: IssueId;
  kind: CodexRunKind;
  status: CodexRunStatus;
  /** Who the run writes as. */
  by: Handle;
  /** The task the run picked. Absent when nothing was ready. */
  task?: TaskId;
  task_title?: string;
  /** The phase in progress; for a run that stopped early, the phase it stopped in. Absent for `nothing_ready`. */
  phase?: CodexPhaseId;
  /** Empty for `nothing_ready`. */
  phases: CodexPhase[];
  started_at: Ts;
  finished_at?: Ts;
  /** Why the run did not do a task: nothing ready, stopped, or changed under it. */
  reason?: string;
  /** The commit the run added, once the last phase has landed. */
  commit?: string;
  /** The CI run the run added. */
  pipeline?: string;
  /** The issue had no plan: the run wrote `plan.md` first, then claimed the first task. */
  plans?: boolean;
  /** The task ended in `review`, not `done`: a person checks it by hand (its verify is `manual`). */
  review?: boolean;
}

/** An op without its tag and revision: what a write hook takes. */
export type OpArgs<N extends Op["op"]> = Omit<Extract<WfOp, { op: N }>, "op" | "base_rev"> & {
  base_rev?: string;
};

// ---------------------------------------------------------------- workspace files
// Prototype endpoints beyond contract 1.10: `GET /api/files`, `GET|PUT|DELETE /api/files/{path}`.
// The Workdatabase · Files view reads and edits the markdown the board is built from.

/** One file of the workspace, as the file tree lists it. */
export interface WorkspaceFileInfo {
  path: string;
  kind: "md" | "toml" | "image" | "other";
  bytes: number;
  /** Content hash: changes whenever the text does. */
  rev: string;
  /** The issue whose folder holds the file. */
  issue?: string;
  /** The group this file (`_group.md`) describes. */
  group?: string;
  /** The library item this file holds. */
  library?: string;
  /** Lint findings in this file, by severity. */
  errors: number;
  warnings: number;
  infos: number;
}

/** One file with its content. `text` is null for a binary file (see `url`). */
export interface WorkspaceFile {
  path: string;
  text: string | null;
  /** Where an image is served. */
  url?: string;
  rev: string;
  bytes: number;
  /** Findings of this file, with line numbers. */
  diagnostics: Diagnostic[];
}

/** One text file of a skill folder: `SKILL.md`, `scripts/run.sh`, `references/format.md`. */
export interface SkillFile {
  /** Relative to the skill's folder. */
  path: string;
  text: string;
}

/**
 * The person's `library.toml`: the raw text to edit and the flow override it holds
 * (skills-flow-spec 3.2). `rev` is the `base_rev` of the next save.
 */
export interface PersonalConfig {
  /** Empty when the library has no `library.toml` yet. */
  text: string;
  rev: string;
  /** The `[flow]` tables, valid values only. */
  flow: FlowConfig;
  /** What the server could not use: invalid TOML, a value the flow does not take. */
  problems: string[];
}

// ---------------------------------------------------------------- libraries
// A library is a folder of markdown files and media in a git repo (docs/plan/proposals/libraries-spec.md).
// The workspace's own library, the person's private one and any team library added by a GitHub link
// all read the same way. The prototype builds these shapes in `mock/libraries/`; `wf serve` and the
// bridge would build them from a clone.

/** Where a library comes from: this workspace, the person's own repo, or a team's repo. */
export type LibraryOrigin = "personal" | "team" | "workspace";

/** How its files are read: straight from GitHub, through the agent bridge, or from this workspace. */
export type LibraryAccess = "public" | "bridge" | "local";

/** A media file of a library: where the browser loads it and how large it is. */
export interface LibraryMedia {
  url: string;
  bytes: number;
}

/**
 * What a library is made of. `files` and `media` are keyed by repo-relative path; `root` is the
 * folder of the repo that holds the library (empty: the repo root, left out: find it by the rules
 * of spec 4.2). Pages and addresses are root-relative.
 */
export interface LibrarySource {
  /** The short name links use: `platform` in `[[platform:runbooks/x]]`. The personal library is `me`. */
  alias: string;
  kind: LibraryOrigin;
  name: string;
  description?: string;
  /** The GitHub repo, `https://github.com/o/r`. */
  url?: string;
  ref?: string;
  /** The commit the files were read at. */
  commit?: string;
  root?: string;
  access?: LibraryAccess;
  /** Text files by repo-relative path: markdown pages, manifests, and any other text file. */
  files: Record<string, string>;
  /** Images, GIFs and videos by repo-relative path. */
  media: Record<string, LibraryMedia>;
  /** Names of files the browser has no text for (listed under "Other files", opened on GitHub). */
  others?: string[];
  /** Where a page lives in its own repo when that differs from its root-relative path. */
  origin?: Record<string, string>;
  /** What git knows about a page, by root-relative path: its last change and who made it. */
  meta?: Record<string, { updated?: string; author?: string }>;
}

/** One library, as the nav and the home list it. */
export interface LibraryInfo {
  alias: string;
  kind: LibraryOrigin;
  name: string;
  description?: string;
  url?: string;
  ref?: string;
  commit?: string;
  root?: string;
  access?: LibraryAccess;
  /** The handle that owns a personal library. */
  owner?: string;
  /** Markdown pages, media files and other files. */
  pages: number;
  media: number;
  others: number;
  /** Path of the home page, or null when the library has none (the viewer draws an overview). */
  home: string | null;
  /** The dashboard can edit its pages (the personal library). */
  editable: boolean;
  /** Its files are in memory. A library listed in `libraries.toml` that nobody has loaded is not. */
  loaded: boolean;
}

/** A folder (section) or a page of the tree. Paths are root-relative; the root itself is "". */
export interface LibraryTreeNode {
  type: "section" | "page";
  path: string;
  title: string;
  /** A section: the path of its own page (`index.md`, `README.md` or `_group.md`), if it has one. */
  page?: string;
  /** The `kind:` of the page's frontmatter. */
  kind?: string;
  /** The `status:` of the page's frontmatter. */
  status?: string;
  /** A section: the pages below it, its own page included. */
  count?: number;
  /** Characters of the file (a page) or of every file below (a section), for "12 pages · ~9k tokens" (about 4 characters a token). */
  chars?: number;
  children?: LibraryTreeNode[];
}

export interface LibraryTree {
  alias: string;
  /** The root section: `children` are the top level. */
  root: LibraryTreeNode;
  /** The home page, or null. */
  home: string | null;
  /** Every page in reading order: a section's own page, then its children. */
  pages: string[];
  /** Files that are neither markdown nor media. */
  others: string[];
}

/** One heading of a page. `anchor` is the GitHub-style slug, unique within the page. */
export interface PageHeading {
  depth: number;
  text: string;
  anchor: string;
  /** 1-based line in the page body (after the frontmatter). */
  line: number;
}

/** The ways a link can be written (spec section 5). */
export type LinkForm =
  | "relative" // [text](../runbooks/x.md)
  | "wiki" // [[runbooks/x]], [[runbooks/x#rotate]]
  | "alias" // [[platform:runbooks/x]]
  | "issue" // [[wf-3k9x2]], [[wf-3k9x2#D-7f3k2]]
  | "library-item" // [[lib-6pm4c]]
  | "anchor" // [[#rotate]], [text](#rotate)
  | "external"; // [text](https://…)

/** A link of a page and where it goes. */
export interface PageLink {
  /** As written: the href of a markdown link, or the text inside `[[ ]]`. */
  raw: string;
  form: LinkForm;
  /** The text of a markdown link. */
  label?: string;
  /** The target exists. */
  ok: boolean;
  /** What is missing when `ok` is false. */
  missing?: "page" | "heading" | "library" | "issue" | "item";
  /** The page it goes to. */
  alias?: string;
  path?: string;
  anchor?: string;
  /** `alias:path#anchor`. */
  address?: string;
  /** The title of the page or issue it goes to. */
  title?: string;
  /** An issue (and an entry of it, `D-7f3k2`). */
  issue?: string;
  entry?: string;
  /** A workspace library item (`lib-6pm4c`). */
  item?: string;
  /** An external address. */
  href?: string;
}

/** A media file a page names, resolved. `src` is the path as written in the markdown. */
export interface PageMedia {
  src: string;
  kind: "image" | "gif" | "video";
  url?: string;
  bytes?: number;
  /** The library has no such file. */
  missing?: boolean;
  /** An address outside the library (`https://…`). */
  external?: boolean;
}

/** A page that links to another, or a neighbour in the reading order. */
export interface PageRef {
  address: string;
  alias: string;
  path: string;
  title: string;
  /** The name of its library. */
  library: string;
}

/** An issue whose `## Links` name a page. */
export interface UsedInIssue {
  id: string;
  title: string;
  status: string;
  group_path: string[];
}

/** One page of a library: its text, what it links to and what links to it. */
export interface LibraryPage {
  /** `alias:path`. */
  address: string;
  alias: string;
  path: string;
  title: string;
  /** The frontmatter `kind:`, else `section` for a section's own page, `glossary`, or `page`. */
  kind: string;
  /** The page is the page of a folder. */
  section: boolean;
  /** The library's name, for breadcrumbs. */
  library: string;
  libraryKind: LibraryOrigin;
  /** The whole file, frontmatter included. */
  text: string;
  /** Lines of the file before the body starts. */
  lineOffset: number;
  frontmatter: Record<string, unknown>;
  headings: PageHeading[];
  /** Last change (a date or a timestamp) and who made it, from the frontmatter or from git. */
  updated?: string;
  author?: string;
  /** The frontmatter `created`, for a page that says when it was written but not when it changed. */
  created?: string;
  /** Minutes to read the body. */
  read_minutes: number;
  /** Every link of the body, resolved. */
  links: PageLink[];
  /** The links that did not resolve. */
  broken: PageLink[];
  /** Pages of any library that link here. */
  backlinks: PageRef[];
  /** Issues whose goal.md Links name this page. */
  used_in: UsedInIssue[];
  /** Media the body names, by `src`. */
  media: Record<string, PageMedia>;
  /** Section breadcrumbs, from the root: the sections that hold the page. */
  trail: { title: string; path: string; page?: string }[];
  prev: PageRef | null;
  next: PageRef | null;
  /** For a section's page: the pages below it. */
  children: PageRef[];
  /** The file in its own repo or workspace (`library/playbooks/x.md`). */
  file: string;
  /** Hash of the file, for `savePage`. */
  rev: string;
  /** Open on GitHub, for a library with a GitHub address. */
  github?: string;
  /** The workspace library item this page is (`lib-6pm4c`). */
  item?: string;
  /** The library's commit, for the page footer. */
  commit?: string;
}

/** A section of a page that matched a search, with the words marked. */
export interface LibraryPassage {
  /** `alias:path#anchor` (no anchor for the lead of a page). */
  address: string;
  alias: string;
  path: string;
  anchor?: string;
  library: string;
  pageTitle: string;
  /** The heading of the section, `Procedure` or `Procedure › Step 2`; empty for a page's lead. */
  heading: string;
  /** About 200 characters of plain text around the best match. */
  snippet: string;
  /** Character ranges of the matches inside `snippet`. */
  marks: [number, number][];
  score: number;
}

/** Where a search looks: every library, one, several, or exactly the listed pages. */
export type LibraryScope = "all" | { alias: string } | { aliases: string[] } | { pages: string[] };

/** What an address or a link text points at. */
export interface ResolvedAddress {
  raw: string;
  form: LinkForm;
  ok: boolean;
  alias?: string;
  path?: string;
  anchor?: string;
  address?: string;
  title?: string;
  issue?: string;
  item?: string;
}
