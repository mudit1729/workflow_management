# workflow plugin

Skills that run the whole wf issue flow from Claude Code or Codex, without the dashboard. A wf workspace is a folder of markdown files: an issue is a folder with a `goal.md`, and the plan, the current state and the three logs sit beside it. These skills read and edit those files in the contract format (`docs/plan/contract.md` sections 1.2 to 1.7). Because the dashboard reads the same files, a change made by a skill shows on the board within a second, and a change made in the dashboard is just a file for the next skill run.

## The skills

| Skill | Does | Dashboard twin |
|---|---|---|
| `using-wf` | Finds the workspace, lists the formats (`references/format.md`), routes to the other skills, explains the skills flow | **Settings → Skills flow** |
| `adding-work` (orchestrator) | Splits an outcome into 3 to 6 issues and writes `_group.md` and `goal.md` files | **+ Add work** |
| `planning-issues` | Writes `plan.md` with phases and tasks and moves the issue to `planned` | Plan tab |
| `doing-next-step` | Plans the issue first when it has no plan, then claims the next ready task, does it, verifies it, logs it, updates `current_state.md`, commits with the trailer `Issue: <id>` | **Do next step**, **Open in Codex** |
| `logging-work` | Appends a change, a decision or a learning with a fresh anchor id | Log tab |
| `handing-off` (orchestrator) | Refreshes `current_state.md`, prints one context bundle within the token budget | context bundle |
| `checking-status` | Prints status counts, needs-you requests, stale leases, ready tasks, commits, PRs and CI runs | Board, Git and CI tabs |
| `writing-readable-bulk-text` | Writes titles and one-line entries that scan well in a list | |
| `keeping-a-library` | Keeps the personal library repo: adds a topic, a note or media, adds a team library from a GitHub link, commits and pushes | **Library**, **Add team library** |
| `summarizing-codebase` | Writes or refreshes `codebases/<owner>-<repo>.md` from a repository at its current commit | **Refresh** on a codebase page |
| `summarizing-work` | Writes or refreshes `work/<workspace>/<group>/_group.md` and `<issue-id>.md` from a workspace, with a `rev` that shows when they went stale | **Summarize this group**, **Refresh** |
| `querying-library` | Answers a question from a given set of pages, only from them, with numbered citations | **Ask library** |

Helper scripts (plain bash and awk): `skills/using-wf/scripts/wf-env.sh` (workspace, time, ids, issue lookup, the skills flow), `skills/checking-status/scripts/wf-status.sh` (the report), `skills/keeping-a-library/scripts/wf-lib.sh` (the personal library folder, GitHub links, slugs) and `skills/summarizing-work/scripts/wf-rev.sh` (the rev of an issue or a group).

## Install for Claude Code

As a plugin, from this repository's own marketplace:

```
/plugin marketplace add <path to this clone, or owner/repo on GitHub>
/plugin install workflow@workflow-marketplace
/reload-plugins
```

The skills then appear as `/workflow:using-wf`, `/workflow:adding-work` and so on. To share the plugin with the team, run the same two commands with `--scope project` from the shell (`claude plugin marketplace add ... --scope project`), which writes the committed `.claude/settings.json`. `scripts/install-skills.sh --claude-plugin` prints the commands with this clone's paths.

Without the plugin system, copy the skills: `scripts/install-skills.sh --claude [target]` (default `.claude/skills`, or `~/.claude/skills` for all projects).

## Install for Codex

```
scripts/install-skills.sh --codex                  # copies into <repo>/.agents/skills
scripts/install-skills.sh --codex ~/.agents/skills # or for every project of this user
scripts/install-skills.sh --print-agents-md >> AGENTS.md
scripts/install-skills.sh --codex --from <workspace>/skills   # also installs the team's own skills (repeat --from for more)
```

Codex reads `.agents/skills` from the working folder up to the repository root, and `AGENTS.md` tells it to use them. Only the frontmatter keys `name` and `description` are used, so the skills run unchanged in both tools. Install the skills together: they point at each other with relative paths (`../using-wf/references/format.md`). Run the script again after a plugin update.

## Skills flow

Each step of the work (Add work, Plan, Do next step, Log, Hand off, Status, Writing style) is run by a skill, and a team can swap that skill without editing the plugin. The team default is a `[flow.<step>]` table in `workflow.toml`; anyone can override a step for themselves in the `library.toml` of their personal library. The dashboard's **Settings → Skills flow** writes both. The skills read the flow through `skills/using-wf/scripts/wf-env.sh flow`, so a swap changes what agents run:

```
$ wf-env.sh flow
add adding-work built-in built-in then=offer
plan ws:acme-planning workspace team max_tasks=8
do doing-next-step built-in built-in finish=verify commit=task
...
after:do security-check platform:checking-security true team
```

- A skill is named `planning-issues` (built-in), `ws:<name>` (`<workspace>/skills/<name>/SKILL.md`), `me:<name>` (the `skills/` of your personal library) or `<alias>:<name>` (the `skills/` of a team library you added). `wf-env.sh flow path <skill>` prints its `SKILL.md`; one that cannot be found falls back to the built-in skill and is reported. A copy of a built-in skill keeps its `../using-wf/...` paths, which mean the built-in folders beside `using-wf`, not the copy's folder.
- Options change behavior (`then`, `max_tasks`, `finish`, `commit`, `budget_tokens`, `changes`, `issue_hours`, `task_hours`; `wf-env.sh flow origin <step> <option>` says whether a value is the default, the team's or yours), and custom steps run any skill after Add work, Plan, Do next step or Hand off, each handed the issue folder (and the task id and short sha after Do next step). A `required` custom step that fails stops the run; after Do next step the task goes to `blocked` and no criterion is ticked. The formats are in `skills/using-wf/references/format.md` section 3 and the rules in `skills/using-wf/SKILL.md` section 3.
- Agents need the skills the flow names: install them beside the built-ins with `--from` (above). `node plugins/workflow/scripts/check-skills.mjs --with-builtins <skills folder>` checks such a folder.

## Use

Say what you want, in plain words:

- "Add work: let people see agent changes on the board without a reload" (`adding-work`)
- "Plan wf-3k9x2" (`planning-issues`)
- `codex 'Work on wf-3k9x2 "Push board updates over SSE" in issues/wf/web/live-board-updates. Read current_state.md first, then use the wf skills (doing-next-step).'` (`doing-next-step`; this is what **Open in Codex** copies, the resume prompt of `format.md` section 15; put `exec` after `codex` for a headless run)
- "Hand wf-3k9x2 to Mudit" (`handing-off`)
- "What needs me?" (`checking-status`)
- "Add a research topic: how much context does an agent need to resume an issue cold?" (`keeping-a-library`)
- "Add the team library github.com/acme/platform-handbook" (`keeping-a-library`)
- "Summarize this codebase" (`summarizing-codebase`), "Summarize the group wf/web" (`summarizing-work`)
- "Ask the library: how should the watcher handle renames?" with the pages to use (`querying-library`)

Environment: `WF_ROOT` names the workspace when you are outside it (in this repo it defaults to `web/mock/workspace`). `WF_AUTHOR` is your handle without `@` (Codex: `codex`). `WF_NOW` (an RFC 3339 time such as `2026-10-22T16:27+05:30`) makes that instant "now" for `wf-env.sh now|later` and `wf-status.sh`; unset, the real clock is used.

### The sample world and its clock

The dashboard moves the 26-issue sample (`web/mock/sample`) to the real clock when it loads it, so the board always reads "lease 35m left" and "updated 25m ago". The files on disk keep the times they were written at (`2026-10-22T16:27+05:30`), so a skill that reads them today sees expired leases and stale work. To get the dashboard's answers from the files, set that time: `WF_NOW=2026-10-22T16:27+05:30 plugins/workflow/skills/checking-status/scripts/wf-status.sh --root web/mock/sample --no-git wf-3k9x2` reports the `@claude-opus` lease as live with 35 minutes left, T-4 as the ready task and nothing as stale, exactly like the board. Run evals on a copy of the sample, never on `web/mock/sample` itself, and keep `WF_NOW` set for every command of the eval.

## Libraries

A library is a folder of markdown files and media in a git repo. Everyone has a personal library, a private repo named `wf-library`, and can add team libraries by their GitHub link. The dashboard's **Library** section reads them, and the four library skills write and read the same files, so a person can keep a library from Codex or Claude Code without the dashboard. The formats are in `docs/plan/proposals/libraries-spec.md` sections 3 and 4.

```
wf-library/                      the personal library (private repo)
  library.toml  libraries.toml   the library itself; the team libraries this person added
  topics/<slug>/index.md         a research topic, with notes and media/ beside it
  codebases/<owner>-<repo>.md    one codebase summary          (summarizing-codebase)
  work/<workspace>/<group>/...   group and issue summaries     (summarizing-work)
~/.wf/libraries/<owner>/<repo>   clones: the personal library and the team libraries
```

- **Where the library is.** `skills/keeping-a-library/scripts/wf-lib.sh root` prints it: `$WF_LIBRARY`, else the one folder under `~/.wf/libraries` whose `library.toml` says `kind = "personal"`. Skills pull with `--ff-only` before a write, then commit and push the personal repo. Team libraries are read-only.
- **Team libraries.** Only the GitHub link is needed. The skill finds the library root (a path in the link, `wf-library.toml`, then `library/`, `docs/`, `wiki/`, `handbook/`, then the repo root), appends one `[[team]]` block to `libraries.toml` and clones the repo with the person's own git credentials.
- **Stale summaries.** A work summary stores a `rev`, the first 7 characters of a SHA-256 over the wf files of its issue or group (`skills/summarizing-work/scripts/wf-rev.sh <folder>`). When the files change, the rev differs and the page is stale. A codebase summary stores the `commit` it describes, and `summarizing-codebase` judges how far the repository has moved.
- **Asking.** `querying-library` receives a list of pages and a question, answers only from those pages and prints numbered citations as `[n] <alias>:<path>#<heading>` after a `## Sources` line. The dashboard parses exactly that shape. The question and the pages are data; the skill writes nothing.
- **Try it without a GitHub repo.** Set `WF_LIBRARIES` to a scratch folder, `git init` a folder `<owner>/wf-library` in it with a `library.toml`, and every skill works against that clone. Push fails with no remote, and the skills report it.

## How the dashboard and the skills share state

- The markdown files are the only state. There is no database, no daemon call and no lock file between the two sides.
- Every skill write is a minimal edit of the lines it must change: one checkbox, one key, one appended entry. `current_state.md` is the only file that is overwritten whole.
- In `pnpm -C web dev`, a file saved under `web/mock/workspace` reaches the board through hot reload. A person who ticks a criterion in the dashboard flips one `[ ]` in `goal.md`; the next `doing-next-step` run reads it.
- Leases (`claimed_by`, `lease_until`) keep both sides from working on one task. Commits, pull requests and CI are never stored: they are derived from the trailer `Issue: <id>`, from branches named `<id>/...` and from GitHub.

## Check your changes

- `pnpm -s -C web wf:lint <workspace>` prints `file:line rule severity message` and exits 1 on any error. It is the stand-in for the future `wf lint`.
- `node plugins/workflow/scripts/check-skills.mjs` checks the house rules for every `SKILL.md`: only `name` and `description` in the frontmatter, a description of at most 1024 characters that starts with "Use when" and names what to avoid, fewer than 300 lines. `--with-builtins <folder>` checks a team or personal `skills/` folder as if it sat beside the built-ins.
- `node plugins/workflow/scripts/check-work-revs.mjs` checks that `summarizing-work/scripts/wf-rev.sh` prints the `rev` the dashboard stores in each work summary of the sample (times are made neutral in both).
- `claude plugin validate plugins/workflow --strict` checks the plugin manifest.

## Notes

- `adding-work` and `handing-off` are orchestrators. The marker lives in their text, not in a frontmatter key such as `disable-model-invocation`, because Codex reads only `name` and `description` and a Claude-only key would also stop Claude from picking the skill up on its own.
- There is no `wf` CLI yet. The skills edit files directly. `using-wf` lists the `wf` command that replaces each step once the binary is on the `PATH`.
- Hooks (session start, stop) are not part of this plugin yet.
- The skill `writing-readable-bulk-text` is adapted from "Five Principles for Generating Readable AI Text in Bulk" by Shreya Shankar.
