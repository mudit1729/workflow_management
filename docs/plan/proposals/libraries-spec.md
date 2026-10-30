# Spec: personal and team libraries

Written 2026-10-30. Status: proposal. The four choices the user made are marked **(decided)**; every
other default can be changed.

## What the user asked for

- Everyone has a **personal** knowledge base, and can add **team** knowledge bases too.
- Every knowledge base is markdown. The library UI is a markdown viewer styled as a document wiki,
  with embedded videos and GIFs.
- The Library section holds: **Personal library, Team libraries, Files, Skills**.
- A personal library holds (1) the topics a person is researching, (2) summaries of the codebases
  they work on, and (3) group and issue summaries, organised properly.
- Adding a team library takes only its GitHub link, and then you can read it.
- From an issue you can ask a question of one library document or a group of them.

## Decisions

| # | Decision | Choice |
|---|---|---|
| L1 | Where a personal library lives | **(decided)** A private GitHub repo of the person's own, by default `github.com/<you>/wf-library`. The connected agent's bridge keeps a local clone and pushes edits. |
| L2 | How private team repos are read | **(decided)** Through the agent bridge, with the person's own git credentials. Public repos also work without a bridge, read straight from GitHub. |
| L3 | Asking a library from an issue | **(decided)** The connected agent answers with citations. The answer can link the cited pages to the issue or be saved to the issue's log. With no agent connected, the best matching passages are shown instead. |
| L4 | Today's workspace Library and Glossary | **(decided)** They become the first team library, "this workspace". The glossary is one of its pages. Linking from issues and promoting learnings keep working. |
| L5 | Group and issue summaries | Written by the agent on demand (a Refresh button and a skill). They are stored as markdown and marked stale when the issue changes after the summary was written. |
| L6 | Editing | The personal library can be edited in the dashboard; the bridge commits and pushes. Team libraries are read-only in v1, with Open on GitHub; "Propose a change" (the agent opens a PR) comes later. |
| L7 | Media | Images and GIFs are files in the repo. Videos are files (`.mp4`, `.webm`) or a YouTube, Vimeo or Loom link on a line of its own. Players load only on click. |

## 1. Words

| Word | Meaning |
|---|---|
| Library | A folder of markdown files and media in a git repo. Folders are sections; files are pages. |
| Personal library | One per person, in their private repo. Only they see it. |
| Team library | A library in a team's repo, added by its GitHub link. Everyone who adds it sees the same pages. |
| Workspace library | The team library this wf workspace already has (`library/` plus `glossary.md`). It is always listed first. |
| Alias | The short name a library is known by in links, e.g. `platform`. Defaults to the repo name; the personal library is `me`. |
| Page address | `<alias>:<path>`, e.g. `platform:runbooks/rotate-keys.md`, plus an optional `#heading`. |

## 2. Navigation and routes

The nav section is renamed from Workdatabase to **Library**:

- **Personal**: the person's own library, with a page count.
- **Team libraries**: one row per team library, workspace library first, then "+ Add team library".
- **Files**: the workspace's markdown files, unchanged.
- **Skills**: unchanged.

| Route | Shows |
|---|---|
| `/lib` | Library home: the personal library and each team library as cards, then recently opened pages. |
| `/lib/me`, `/lib/me/<path>` | The personal library's home or one of its pages. |
| `/lib/t/<alias>`, `/lib/t/<alias>/<path>` | A team library's home or one of its pages. |
| `/lib/<lib-id>` (old) | Redirects to that item's page in the workspace library. |
| `/glossary` (old) | Redirects to the workspace library's Glossary page. |

## 3. The personal library

### Repo layout

```
wf-library/                         private repo, github.com/<you>/wf-library
  library.toml                      name, owner, kind = "personal"
  libraries.toml                    the team libraries this person added (section 4.4)
  topics/<slug>/index.md            one research topic
  topics/<slug>/<note>.md           notes on that topic
  topics/<slug>/media/              its images, GIFs and videos
  codebases/<owner>-<repo>.md       one codebase summary
  work/<workspace>/<group>/<sub>/_group.md        a group summary
  work/<workspace>/<group>/<sub>/<issue-id>.md    an issue summary
```

The first time a person opens Personal, they set it up with buttons: **Create
github.com/<you>/wf-library (private)** (the bridge runs `gh repo create --private`), or **Use a repo
I already have** (paste its link). Without a connected agent, the screen says to connect one first.

### Research topics (`topics/<slug>/index.md`)

```markdown
---
title: Agent-readable issue context
kind: topic
status: active            # active | paused | done
question: How much context does an agent need to resume an issue cold?
tags: [agents, context]
updated: 2026-10-30
sources:
  - https://example.com/paper
---

## Summary
Two or three sentences: the current answer to the question.

## Findings
- Bundles over 6k tokens lose the goal in the middle. [source](https://example.com/paper)

## Open questions
- Does a diagram beat a paragraph for architecture?

## Notes
- [[topics/agent-context/bundle-sizes]]
```

The UI shows topics as cards (title, question, status, updated, number of notes). A topic page has
its notes in the page tree under it.

### Codebase summaries (`codebases/<owner>-<repo>.md`)

```markdown
---
title: workflow_management
kind: codebase
repo: https://github.com/mudit1729/workflow_management
ref: main
commit: a7f905c
summarized_at: 2026-10-30T15:10+05:30
summarized_by: "@codex"
---

## What it is
## How to run
## Map                 a table: path, what lives there
## Key flows           how a request or an edit moves through the code
## Conventions
## Gotchas
## Where to start      the five files to read first
```

The page header says "Summary of a7f905c, 12 commits behind main", and **Refresh** runs the
`summarizing-codebase` skill on the connected agent.

### Group and issue summaries (`work/…`)

These are organised like the group tree: `work/<workspace>/<group>/<subgroup>/`. Each group folder has
a `_group.md`, and each issue an `<issue-id>.md`.

```markdown
---
title: Push board updates over SSE
kind: issue-summary
issue: wf-3k9x2
workspace: wf
group: wf/web
status: in_progress
rev: 3f2a91c              # hash of the issue's files when the summary was written
summarized_at: 2026-10-30T15:20+05:30
summarized_by: "@codex"
---

## Where it stands       one to three sentences
## Done so far           bullets, each with its commit or PR
## Decisions             titles with links into the issue's log
## Learnings
## Next
```

A group summary (`kind: group-summary`) has the outcome, a table of its issues (status, one line
each), risks and what is next. The Work section lists summaries by group, and inside a group by
status (in progress, review, planned, backlog, done). A summary whose issue changed since `rev` shows
**Stale · Refresh**. **Summarize this group** on a group page runs `summarizing-work` for the group and
its issues.

## 4. Team libraries

### 4.1 Adding one with a GitHub link

This flow uses the same one-question-per-screen pattern as Add work. Pasting the link is the only
typing.

1. **Paste a GitHub link.** These forms are accepted:
   - `https://github.com/o/r`
   - `…/tree/<ref>/<path>`
   - `…/blob/<ref>/<path>.md`
   - `git@github.com:o/r.git`
   - `o/r`

   Recent repos from the person's other libraries are offered as buttons.
2. **The dashboard finds the library** (section 4.2). If there is more than one candidate folder,
   each is a button ("docs/ · 42 pages", "wiki/ · 8 pages").
3. **Preview**: name, description, page and media counts, last commit, public or private, and the
   first page rendered small. The alias is shown with an Edit button.
4. **Add.** The library appears in the nav and opens on its home page.

That is 3 clicks plus one paste.

### 4.2 Finding the library in a repo

1. **A path in the link** is the root.
2. **`wf-library.toml`** at the repo root gives the root (see below).
3. **A known folder:** otherwise the first of `library/`, `docs/`, `wiki/` and `handbook/` that holds
   markdown.
4. **The repo root**, as a last resort.

```toml
# wf-library.toml (optional; a repo works without it)
name = "Platform handbook"
description = "How the platform team builds, ships and runs things."
root = "docs"
home = "README.md"
[nav]
order = ["getting-started", "runbooks", "architecture"]
[owners]
handles = ["@ana", "@li"]
```

Inside the root:

- **Sections:** folders are sections, and `index.md` or `README.md` is a section's page.
- **Page titles:** a page's title is its frontmatter `title`, else its first `#` heading, else its
  file name.
- **Order:** the manifest's `nav.order`, then the page's `order:` frontmatter, then alphabetical.

Files that are not markdown or media are listed under "Other files" and open on GitHub.

### 4.3 Reading the files

| Repo | How |
|---|---|
| Public | Straight from the browser. The tree comes from `GET api.github.com/repos/o/r/git/trees/<sha>?recursive=1`, one API call, cached with its ETag. Files come from `raw.githubusercontent.com/o/r/<sha>/<path>`, pinned to the commit. |
| Private | **(decided)** The bridge clones into `~/.wf/libraries/<o>/<r>` with the person's git credentials. It runs `git pull --ff-only` when the library is opened and the clone is more than 10 minutes old, and serves the tree and files to the dashboard. |

The page footer names the commit it shows ("a1b2c3d · 2 days ago"). When the remote is ahead, a quiet
**Update** appears.

### 4.4 The list of libraries a person added

The list lives in their personal repo, so it follows them from machine to machine:

```toml
# libraries.toml
[[team]]
alias = "platform"
url = "https://github.com/acme/platform-handbook"
ref = "main"
root = "docs"
access = "public"         # public | bridge
added = 2026-10-30
```

The workspace library is not in this list; it comes with the workspace.

## 5. The wiki viewer

### Layout

| Width | Columns |
|---|---|
| 1280 px and up | Page tree (240 px) · document (text measure about 720 px) · right rail (On this page, Linked from, Used in issues, page facts) |
| 1024–1279 px | Page tree · document; On this page moves to a popover in the header |
| Under 1024 px | Document only; the page tree opens as a sheet |

### Document header

- **Breadcrumbs:** Library / Platform handbook / Runbooks.
- **Title.**
- **Meta line:** updated 3 days ago by @ana · 5 min read.
- **Actions:** Ask about this page, Link to an issue…, Copy link, Open on GitHub, a Rendered | Source
  toggle, and Edit (personal library only).

### What renders

- **Markdown:** GitHub-flavoured markdown (tables, task lists, footnotes), heading anchors, and code
  with highlighting.
- **Callouts:** `> [!NOTE]`, `[!TIP]`, `[!IMPORTANT]`, `[!WARNING]` and `[!CAUTION]` in the GitHub
  style.
- **Diagrams:** the existing diagram fences.
- **Links:**

  | Written as | Goes to |
  |---|---|
  | `[text](../runbooks/x.md)` | a page in the same library |
  | `[[runbooks/x]]`, `[[runbooks/x#rotate]]` | a page or heading in the same library |
  | `[[platform:runbooks/x]]` | a page in another library |
  | `[[wf-3k9x2]]` | an issue |
  | `[[lib-6pm4c]]` | a workspace library item |

  A broken link shows dashed and lists itself in the page facts.
- **Images and GIFs:** `![alt](media/flow.gif)`. GIFs play unless the reader prefers reduced motion;
  then they show the first frame and a play button. Images get a caption from their alt text, and
  clicking one opens it full size.
- **Video files:** `![Caption](media/demo.webm)` renders a player with controls. It never autoplays
  and loads only the metadata until played.
- **Video links:** a line holding only a YouTube, Vimeo or Loom link renders a card with the title
  and a thumbnail. The player loads only on click (privacy, and the artifact's content rules).
- **Large media:** files over 25 MB should be links or Git LFS; the viewer says so instead of
  stalling.

### Search

One box searches titles, headings and text across every library in the scope picked beside it
(All, Personal, or one team library). Results are grouped by library and show the matching heading.

### Editing (personal library)

Edit opens the existing markdown editor. Save writes the file, and the bridge commits ("Edit
topics/agent-context/index.md") and pushes. The header then shows "Saved · pushed a1b2c3d". Pasting or
dropping an image or video saves it under the page's `media/` and inserts the link.

## 6. Asking a library from an issue

- **Opening it:** **Ask library** in the issue header, or Ask about this page in the library, or the
  palette. It opens a side panel, so the issue stays in view.
- **Scope:** chips, any number of them:
  - Linked to this issue: the pages in its Links section, the default when there are any.
  - My library.
  - One chip per team library.
  - Pick pages…: a tree with checkboxes, for a group of documents.

  Beside the chips is a size line ("12 pages · ~9k tokens").
- **Question:** three suggested questions as buttons, drawn from the issue's goal, criteria and open
  questions (for example "How should the watcher handle renames?"), and a text box.
- **Answer:** **(decided)**
  - **With an agent:** the connected agent runs the `querying-library` skill on exactly those pages.
    It streams an answer in markdown with numbered citations, and each citation opens the cited
    section in a preview.
  - **Without an agent:** the panel shows the five best matching passages, ranked over sections, with
    the words highlighted, and a **Connect an agent for an answer** button.
- **Actions on an answer:**
  - **Link cited pages:** adds `- [[platform:runbooks/x]]: <why>.` lines to the issue's Links section,
    so the pages enter its context bundle (goal 2).
  - **Save to log:** appends a learning to `learnings.md`, titled by the question, with the answer's
    summary and a `sources:` list (goal 3).
  - **Copy.**
- **Context bundle:** the bundle pins team pages by commit, so a handoff reads exactly what was cited.

## 7. Skills (headless parity)

Each skill writes the same files the dashboard writes, so Codex or Claude Code can keep a library
without the dashboard.

| Skill | Does |
|---|---|
| `keeping-a-library` | The layouts and formats above. Add a topic, a note or media; add a team library (resolve the link, append to `libraries.toml`, clone private repos). |
| `summarizing-codebase` | Write or refresh `codebases/<o>-<r>.md` from the repo at its current commit. |
| `summarizing-work` | Write or refresh `work/…` summaries for a group or an issue from the wf workspace, with `rev`. |
| `querying-library` | Answer a question from a given set of pages, with citations in the `[n]` → `<alias>:<path>#<heading>` form. |

## 8. Bridge additions

These extend the round-2 bridge (`wf-bridge.mjs`, plan D9 and D13), with the same pairing, origin and
host rules.

| Endpoint | Does |
|---|---|
| `GET /libraries` | The personal library and every team library the bridge holds, with commit and sync time. |
| `POST /libraries {url}` | Validates that the URL is on github.com, clones it, and returns the preview of section 4.1. |
| `POST /libraries/<alias>/sync` | Runs `git pull --ff-only`. |
| `GET /libraries/<alias>/tree` and `GET /libraries/<alias>/file?path=` | Read the clone. The path must stay inside it. |
| `PUT /libraries/me/file` | Writes a file in the personal library, commits it and pushes. |
| `POST /ask {issue, scope, question}` | Runs `querying-library` on the agent and streams the answer as server-sent events. The bridge builds the prompt from the validated scope, never from browser text, and gives the question to the agent as data. |

## 9. What the prototype does

The prototype simulates parts of this:

- **Personal library:** a fixture repo (`mock/personal/`) with two research topics (one with a GIF
  and a video), a real summary of this codebase, and work summaries made from the sample when it is
  loaded. The empty workspace shows an empty Work section.
- **Team libraries:**
  - The workspace library, with the glossary as a page.
  - A fixture GitHub team library with media.
  - A public GitHub link is read from GitHub for real where the page is allowed to reach it. Where it
    is not (the published artifact may block it), the dashboard says so plainly and offers the
    fixture.
- **Ask:**
  - Passage search runs for real in the browser.
  - With a simulated agent, the answer is built from the top passages and labelled as a prototype
    answer.
  - With a real bridge, the answer comes from the agent.

## 10. Acceptance

- Pasting a public GitHub link adds a team library in 3 clicks after the paste, and its pages,
  images, GIFs and videos render.
- Personal shows Topics, Codebases and Work. Work is ordered by workspace, group and status, and a
  stale summary says so.
- From wf-3k9x2:
  1. Ask library.
  2. Pick a scope with buttons.
  3. Pick a suggested question.
  4. Get an answer with citations.
  5. Link cited pages: they are in the issue's Links section and its context bundle.
  6. Save to log: a learning with sources.
- The four skills write files that the UI shows unchanged, and wf-lint finds nothing new.
- Old `/lib/<id>` and `/glossary` links still land on the right page.
- The reader works at 390 px, in dark mode and with the keyboard (`[` and `]` move between pages,
  `/` searches).
