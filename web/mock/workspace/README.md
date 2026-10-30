# The prototype workspace

This folder is a real `wf` workspace (`wf_format = 1`): markdown files and one `workflow.toml`.
**It is the shipped workspace: the groups, the library and the glossary, and no issues.** The board
starts as a clean slate. Groups (`wf`, `core`, `web`, `skills`, `platform`, `auth`) are the folders
with a `_group.md` under `issues/`; an issue is a folder that holds a `goal.md`, and none is here.

**The sample world lives in `../sample/`.** It is a full copy of this workspace from before the
issues were removed: 26 issues (every status, every signal, the diagrams, the evidence image), the
same library and glossary. It is a fixture, not shipped content. **Load sample data** in the
Prototype panel (or `window.__wf.loadSample()`) puts it on the board; **Reset data** comes back to
this folder; the Kit (`/kit`) shows it while it is open; the tests read it. The library items here
still cite entries of sample issues (`[[wf-3k9x2#C-5wq7k]]`), so until the sample is loaded they
show as dangling references (lint F009, a warning): 18 of them, plus one Q013 info, and no error.
The scripted live events belong to sample issues and are skipped quietly here.

In the browser the workspace has two views. **Workflow** (Board, with a Needs you filter for what waits on you) is work in motion.
**Workdatabase** (Library, Glossary, Files) is everything stored. An issue is a folder of markdown
files, as in the product. A text editor is enough:

- Edit any file while `pnpm dev` runs and the board updates within a second. The mock watcher
  re-reads the files, finds what changed and fades the cards that moved.
- In the browser, open **Workdatabase · Files** to edit, create or delete a file. The board, signals,
  lint, the Needs you filter and the library follow the text. This works in the static build too.
- Every action in the UI is a minimal text edit of these files. Ticking `SC-3` flips `[ ]` to `[x]`
  on that line of `goal.md` and changes nothing else.

## Layout

```
workflow.toml                   config: wf_format, [workspace], [leases], [staleness], [lint], [server]
authors.md                      the roster: one "## @handle" per author
glossary.md                     one "## term" per term, with kind, means, avoid, see
issues/                         the root group (issues_dir)
  wf/                           a group: a folder with _group.md
    _group.md                   id, title, goal, owner, color, order, definition_of_done
    web/                        a nested group (core, web and skills sit under wf; auth under platform)
    <an issue>/                 an issue: a folder that holds goal.md (none ships here; see ../sample/)
      goal.md  plan.md  current_state.md  changes.md  decisions.md  learnings.md
      notes/research.md         any other .md file is listed as a plain doc
      evidence/sc2.png          images and other files are assets
  docs/                         an implicit group: a folder with issues and no _group.md (sample only)
library/                        patterns/  playbooks/  gotchas/  decisions/   one <slug>.md per item
```

The grammar is contract 1.2 to 1.7 (`docs/plan/contract.md`). The short version:

- Frontmatter is YAML. Handles in YAML are quoted (`owner: "@shruti"`). Timestamps are RFC 3339
  with an offset (`2026-10-22T14:05+05:30`).
- A criterion is `- [ ] SC-1: <EARS sentence>`. A task is `### T-1: <title>` with a meta list
  (`- status: todo`). A request is `- [ ] Q-xxxxx: <question>` under `## Needs you`.
- A log entry is `## <ts> @<author> — <title> {#C-xxxxx}`, then a meta list, then the body.
- A diagram is a fenced `archify <type> id=<slug>` block holding the archify JSON.
- Unknown keys are kept and reported (F006). Broken input never hides a file: it shows as plain
  markdown with a lint finding. The linter is `web/mock/md/lint.ts`.

`[lint] disable = ["S09"]` in `workflow.toml` is on purpose: the web issues say "card" for the board
card, and the glossary lists "card" as a synonym of "issue". Delete the entry to see the S09
findings appear. Try `severity = { S06 = "error" }` too.

## Times and RECORDED_AT

The files hold **absolute** times. They were written once, at `RECORDED_AT`
(`web/mock/md/recorded-at.ts`). When the prototype loads, `rebaseWorkspace` shifts every RFC 3339
timestamp anywhere in the text by `now - RECORDED_AT`, and every date-only value of a date field
(`due`, and `created`, `last_reviewed`, `review_after` in library items) by the matching number of
local days. So a lease that ran 35 minutes ahead when the files were written still runs 35 minutes
ahead, and "12m ago" stays "12m ago", on any day. The files on disk never change by this.

Times in the files are therefore in the recording's frame. An entry stamped 5 minutes before
`RECORDED_AT` reads "5m ago" on any day, and a lease stamped 40 minutes after it reads "40m left".
Times you write by hand into a file on disk follow the same rule: write them relative to
`RECORDED_AT`. The Workdatabase · Files editor in the browser shows the working copy, whose times are
already shifted, so write times there as they read on the board.

## How the prototype reads and writes these files

- `mock/workspace-files.ts` globs this folder (`?raw` for text, `?wf-asset` for images);
  `mock/sample-files.ts` globs `../sample/` the same way. They are the only places the mock world
  comes from. In the dev server a saved, added or removed file replaces
  that module and hands the new file set to the store (`mock/workspace-bus.ts`): the store shifts
  the times like at load, applies what differs from its working copy and ignores a file whose text
  it already holds (an echo).
- The store (`mock/store.ts`) keeps the working copy of the files in memory. Every Op and every
  scripted live event is a minimal text edit of it (`mock/md/edit.ts`); then `loadWorkspace` and
  `derive` run again. Edits made in the browser (Workdatabase · Files, the board) stay in memory and
  are never written back here. `reset()` goes back to the files of this folder as they are on disk;
  `loadSample()` swaps in the sample folder in one commit.
- `mock/diagram-previews.json` lists the diagrams that have a stand-in preview page. The pages in
  `public/diagrams/` are drawn from the archify blocks of `goal.md` and `plan.md` of this folder and
  of `../sample/` by `node scripts/render-diagram-previews.mjs`. The dev server runs it again when a
  file with an archify block changes in either folder.

`pnpm exec vitest run mock` reads these files back. The tests that name issues by id read
`../sample/` (the grammar of every file, the lint findings the sample world is meant to show);
`mock/shipped.test.ts` checks this folder: no issues, six groups, the library and glossary, the
findings above, a new issue written into it, and the round trip with `loadSample()`. Editing a
sample file changes what those tests see, so a test that names an issue may need a look after a
large edit.
