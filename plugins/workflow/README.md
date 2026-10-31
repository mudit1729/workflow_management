# workflow plugin

Skills that run the whole wf issue flow from Claude Code or Codex, without the dashboard. A wf workspace is a folder of markdown files: an issue is a folder with a `goal.md`, and the plan, the current state and the three logs sit beside it. These skills read and edit those files in the contract format (`docs/plan/contract.md` sections 1.2 to 1.7). Because the dashboard reads the same files, a change made by a skill shows on the board within a second, and a change made in the dashboard is just a file for the next skill run.

## The skills

| Skill | Does | Dashboard twin |
|---|---|---|
| `using-wf` | Finds the workspace, lists the formats (`references/format.md`), routes to the other skills | |
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

Helper scripts (plain bash and awk): `skills/using-wf/scripts/wf-env.sh` (workspace, time, ids, issue lookup), `skills/checking-status/scripts/wf-status.sh` (the report), `skills/keeping-a-library/scripts/wf-lib.sh` (the personal library folder, GitHub links, slugs) and `skills/summarizing-work/scripts/wf-rev.sh` (the rev of an issue or a group).

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
```

Codex reads `.agents/skills` from the working folder up to the repository root, and `AGENTS.md` tells it to use them. Only the frontmatter keys `name` and `description` are used, so the skills run unchanged in both tools. Install the skills together: they point at each other with relative paths (`../using-wf/references/format.md`). Run the script again after a plugin update.

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

## Connect an agent (bridge)

The dashboard can run **Do next step** with Codex or Claude Code on your own computer. **Connect an agent** in the nav shows a one-time code and the command to run in the repository; the bridge (`scripts/wf-bridge.mjs`, Node 18 or newer, no dependencies, macOS or Linux) waits for the dashboard, pairs with it once, and from then on starts the agent headless when the dashboard asks. The agent edits the markdown files like any author, and the board shows the edits within a second.

```
node plugins/workflow/scripts/wf-bridge.mjs --agent codex --pair 4F7K-92
```

| Flag | Meaning |
|---|---|
| `--agent codex\|claude` | Which agent to run (required) |
| `--pair <CODE>` | The code the dashboard shows (required; `WF_PAIR=<CODE>` works too and keeps the code out of `ps`) |
| `--port <n>` | Port on `127.0.0.1` (default 7457; the dashboard expects the default) |
| `--origin <url>` | A dashboard origin that may use the bridge; repeat it for more (default `http://localhost:5177` and `http://127.0.0.1:5177`). The dashboard adds it to the command it shows when it is served from another address |
| `--repo <dir>` | The repository the agent works in (default: the current folder) |
| `--agent-bin <path>` | The agent's binary (default `codex` or `claude` from the `PATH`) |
| `-- <args>` | Everything after `--` is passed to the agent as extra arguments |

The bridge prints one line when it starts (`wf bridge: Codex 0.46.0 on my-laptop, repo workflow_management. Pair code 4F7K-92: waiting for the dashboard.`), one when the dashboard pairs, and two for each run (started, ended). It also says so, once, when it refuses an `Origin` or `Host` (`refused Origin http://localhost:4173. If that is your dashboard, start the bridge with --origin http://localhost:4173.`); a browser sees such a refusal only as a network error, so the dashboard would otherwise wait for it in silence. Ctrl+C stops the runs and exits, and so does **Disconnect** in the dashboard: one bridge serves one dashboard, and **Switch agent** or **Connect** again needs the port and a fresh code, so run the new command the dashboard shows. In `pnpm -C web dev` the dashboard pairs with the real bridge; the published static page cannot reach `127.0.0.1`, so there pairing is simulated ("Prototype: the bridge answers by itself"), and the dashboard's **simulate** button does the same when no bridge can run.

### What it can do

One job: **do the next step of an issue**. The dashboard sends the issue id (`wf-` and five characters of `0-9a-z`) and the kind `next_step`. The bridge finds the folder of the issue by the `goal.md` whose frontmatter `id` matches, builds the prompt itself, and starts the agent in the repository, in its own process group, with `WF_ROOT` set to the workspace it found and `WF_AUTHOR` set to `codex` or `claude` (unless you set it). The prompt is the resume prompt of `skills/using-wf/references/format.md` section 15 plus `Use the doing-next-step skill to do the next step.`

| Agent | Command line (the defaults; change them after `--` or with `--agent-bin`) |
|---|---|
| Codex | `codex exec --full-auto <prompt> [extra...]` |
| Claude Code | `claude -p <prompt> --permission-mode acceptEdits [extra...]` |

An extra argument that chooses the sandbox itself replaces the default flag: for Codex `--sandbox`, `-s`, `--ask-for-approval`, `-a`, `--full-auto` or `--dangerously-bypass-approvals-and-sandbox`; for Claude Code `--permission-mode` or `--dangerously-skip-permissions`. For example `... --agent codex --pair 4F7K-92 -- --sandbox workspace-write --model gpt-5-codex`. Codex's flags change between releases; check `codex exec --help` and override them rather than editing the script.

**Claude Code and what `acceptEdits` allows.** A headless run cannot answer "may I run this?", so what the mode does not allow is skipped. `--permission-mode acceptEdits` lets Claude Code edit files and run read-only commands such as `date`, but not the helper scripts (`wf-env.sh`, `wf-status.sh`), `git add`, `git commit` or the project's checks, which are the claim, the verify and the commit steps of `doing-next-step`. Allow them after `--`. This is the list that was run against a real `claude -p` (scripts, `git add`, `git commit` and `pnpm` ran; `curl` stayed denied), and it is the one to start from:

```
node plugins/workflow/scripts/wf-bridge.mjs --agent claude --pair 4F7K-92 -- \
  --allowedTools 'Bash(*/wf-env.sh *)' 'Bash(*/wf-status.sh *)' \
  'Bash(git add *)' 'Bash(git commit *)' 'Bash(pnpm *)'
```

Swap `pnpm` for the tool your tasks' `verify` commands use. `Bash(git *)` alone is not enough: it lets `git` run, and the scripts stay denied. The bridge keeps the default as it is, because every pattern here is a permission; it prints one line at start-up when you gave Claude Code no tool or mode flags.

It also reports its status (agent, version, host, repository, workspace, skills), lists its runs, streams a run's output lines to the dashboard, and stops a run (SIGTERM to the process group, then SIGKILL to whatever of the group is left, and "cancelled" is answered only when the processes are gone; the same holds for Ctrl+C). The status says which of this plugin's skills the agent finds: for Codex the folders of `<repo>/.agents/skills` that hold a `SKILL.md`; for Claude Code those of `<repo>/.claude/skills`, or all of them when the `settings.json` or `settings.local.json` of the repository enables a `workflow@…` plugin. Skills installed for your user only are not counted, because the point is that the whole team has them: the dashboard offers the install command when some are missing (see **Install for Claude Code** and **Install for Codex** above).

The workspace is found the way `using-wf` finds it: `$WF_ROOT`, else the nearest folder with a `workflow.toml` above the repository, else `workspace/` or `web/mock/workspace/` of the git repository. If there is none the bridge says so when it starts and refuses runs.

**Issues must be files.** The bridge finds an issue by the `goal.md` that holds its id, so it can run only issues that exist in the workspace folder it found. Issues made in the prototype (Add work, the loaded sample) live in the browser and are never written to disk; asking for one of them answers `No issue wf-3k9x2 in web/mock/workspace.` To run the 26 sample issues, which are files, start the bridge on that folder: `WF_ROOT=web/mock/sample node plugins/workflow/scripts/wf-bridge.mjs --agent codex --pair 4F7K-92` (run it on a copy if you do not want the agent to edit the sample).

### Safety rules

- It listens on `127.0.0.1` only, and answers only a `Host` of `127.0.0.1:<port>` or `localhost:<port>` (against DNS rebinding).
- A request that names an `Origin` must come from an allowed one (`--origin`); others get 403. Preflights are answered for allowed origins only, with `Access-Control-Allow-Private-Network`.
- Everything but `POST /pair` needs `Authorization: Bearer <token>`, compared in constant time. The token is 32 random bytes and is handed out once, to the one who knows the code. Five wrong codes close pairing until the bridge restarts. `DELETE /pair` (the dashboard's Disconnect) is the end of the bridge: it closes the open event streams, stops the runs and exits, so the code cannot pair again and nothing stays behind. Every refusal carries `instance`, a random name of the bridge process, so the dashboard can tell a restarted bridge from the one that refused it; a dashboard whose new code meets an old bridge (answers `wrong_code`) asks that bridge for its name, which costs no attempt, waits until it is stopped or replaced, and then goes on with the same code.
- A reader of a run's output that stops reading is dropped once a megabyte is waiting for it, instead of being buffered; the dashboard asks again with `Last-Event-ID` and gets the lines the ring (the last 500) still holds.
- The browser never sends a prompt, a path or a command. The bridge validates the issue id, takes the folder from the workspace files, builds the prompt, and starts the agent without a shell, so a title with quotes or `$(...)` stays text. Symbolic links in the workspace are not followed.
- At most three runs go at once, one per issue (a second answers 409).
- It runs the agent with the permissions of the flags above, in your repository, as you. Run it only where you would run the agent yourself, and stop it (Ctrl+C) when you are done.

`pnpm -C web vitest run scripts/wf-bridge.test.ts` runs the bridge as a real child process against a fake agent binary and checks all of the above.
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
- `node plugins/workflow/scripts/check-skills.mjs` checks the house rules for every `SKILL.md`: only `name` and `description` in the frontmatter, a description of at most 1024 characters that starts with "Use when" and names what to avoid, fewer than 300 lines.
- `node plugins/workflow/scripts/check-work-revs.mjs` checks that `summarizing-work/scripts/wf-rev.sh` prints the `rev` the dashboard stores in each work summary of the sample (times are made neutral in both).
- `claude plugin validate plugins/workflow --strict` checks the plugin manifest.

## Notes

- `adding-work` and `handing-off` are orchestrators. The marker lives in their text, not in a frontmatter key such as `disable-model-invocation`, because Codex reads only `name` and `description` and a Claude-only key would also stop Claude from picking the skill up on its own.
- There is no `wf` CLI yet. The skills edit files directly. `using-wf` lists the `wf` command that replaces each step once the binary is on the `PATH`.
- Hooks (session start, stop) are not part of this plugin yet.
- The skill `writing-readable-bulk-text` is adapted from "Five Principles for Generating Readable AI Text in Bulk" by Shreya Shankar.
