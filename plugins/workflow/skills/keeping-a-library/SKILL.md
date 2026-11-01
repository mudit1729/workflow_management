---
name: keeping-a-library
description: Use when someone wants to keep a wf library, such as "add a research topic", "save this note", "add this GIF to the topic", "add the team library at github.com/acme/handbook" or the dashboard's Library section, and the result must be markdown files in the personal library repo or a new entry in libraries.toml. Creates the personal library repo, adds topics, notes and media, adds a team library from a GitHub link, then commits and pushes the personal repo. Avoid for codebase summaries (use summarizing-codebase), for group and issue summaries (use summarizing-work), for answering a question from pages (use querying-library), and for the issues of a workspace (use using-wf).
---

# Keeping a library

A library is a folder of markdown files and media in a git repo. Everyone has one personal library, a private repo named `wf-library`, and can add team libraries by their GitHub link. This is the headless twin of the dashboard's **Library** section: it writes the files the dashboard shows, and a page saved in the dashboard is just a file for the next run. Formats: `docs/plan/proposals/libraries-spec.md` sections 3 and 4. The skills `summarizing-codebase`, `summarizing-work` and `querying-library` fill and read the same repo.

## 1. Find the library

1. Run `scripts/wf-lib.sh root` (path relative to this file). It prints `$WF_LIBRARY`, else the one folder `~/.wf/libraries/<owner>/<repo>` whose `library.toml` says `kind = "personal"`. Call it `$LIB`. Working elsewhere? Set `WF_LIBRARY` on every command: a shell tool call may not keep exported variables.
2. Nothing found? Ask one question with two numbered choices: **1** create `github.com/<you>/wf-library` (private), **2** use a repo I already have (paste its link).
   - Create: `<you>` = `gh api user -q .login`. Run `mkdir -p ~/.wf/libraries/<you>` and `cd` there, then `gh repo create wf-library --private --clone`. Write `library.toml` (section 3), commit and push.
   - Existing: `git clone <link> ~/.wf/libraries/<owner>/<repo>`. Add `library.toml` if it has none.
3. Before every write: `git -C "$LIB" pull --ff-only`. If it fails, stop and say why. Never merge, rebase or force. Say which folder and which remote (`git -C "$LIB" remote get-url origin`) you write to.
4. Times and dates come from `../using-wf/scripts/wf-env.sh now`; a date is its first 10 characters. Quote a YAML value that holds `: ` or starts with a symbol, and quote handles (`"@codex"`).

## 2. The layout

```
wf-library/                         private repo, github.com/<you>/wf-library
  library.toml                      name, owner, kind = "personal"
  libraries.toml                    the team libraries this person added
  topics/<slug>/index.md            one research topic
  topics/<slug>/<note>.md           notes on that topic
  topics/<slug>/media/              its images, GIFs and videos
  codebases/<owner>-<repo>.md       one codebase summary (summarizing-codebase)
  work/<workspace>/<group>/.../_group.md, <issue-id>.md      summaries (summarizing-work)
```

Slugs are lowercase kebab-case, at most 5 words, unique among siblings: `scripts/wf-lib.sh slug "Agent-readable issue context"`.

## 3. Formats

```toml
# library.toml
name = "Shruti's library"
owner = "shruti-joshi"            # the GitHub login
kind = "personal"
```

A topic, `topics/agent-context/index.md`. All four sections stay; an empty one holds `None yet.`

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

A note, `topics/agent-context/bundle-sizes.md`. It opens with its point.

```markdown
---
title: Bundle sizes
kind: note
topic: agent-context
updated: 2026-10-30
---

Bundles over 6k tokens lose the goal in the middle.

![Recall against bundle size](media/recall.gif)
```

Links: `[[topics/agent-context/bundle-sizes]]` is a page of this library, `[[platform:runbooks/x]]` a page of a team library, `[[wf-3k9x2]]` an issue, `[text](../x.md)` a relative link. Findings cite their source as a link.

## 4. Add a topic, a note or media

1. **Topic.** Ask for the question in one sentence if the request has none; infer the title, 1 to 5 tags and `status: active`. Make `topics/<slug>/index.md` from the template. Do not invent findings: a new topic has `None yet.` or only what the person gave you, each finding with its source link.
2. **Note.** Put `topics/<slug>/<note-slug>.md` beside the topic's `index.md`, then add `- [[topics/<slug>/<note-slug>]]` to its `## Notes` (replace `None yet.`) and set `updated` to today. Make minimal edits to an existing page: change only the lines you must and never reformat.
3. **Media.** Copy the file to `media/` next to the page that shows it (notes share the topic's folder), with a kebab-case name and a lowercase extension. Images and GIFs: `.png .jpg .jpeg .gif .webp .svg`. Video files: `.mp4 .webm`. Embed it with `![Caption](media/<name>)`: the alt text is the caption, one short sentence, never empty. A hosted video is its YouTube, Vimeo or Loom link alone on a line, with a blank line above and below.
   - **Size rule.** A file over 25 MB does not go into the repo: the viewer refuses it and GitHub rejects 100 MB. Link the video instead, or track the file with Git LFS (`git lfs track "<pattern>"`, then commit `.gitattributes`). `find "$LIB" -path '*/media/*' -size +25M -not -path '*/.git/*'` must print nothing.
4. **Save** (section 6) with `Add topic <slug>`, `Add note <slug>/<note-slug>` or `Add media <slug>/<file>`.

## 5. Add a team library from a GitHub link

The dashboard asks for the link, finds the library, shows a preview and adds it. Do the same.

1. **Parse.** `scripts/wf-lib.sh parse '<link>'` prints `owner`, `repo`, `kind` (`repo`, `tree`, `blob`), `rest`, `alias` and `url`. It accepts `https://github.com/o/r`, `.../tree/<ref>/<path>`, `.../blob/<ref>/<path>.md`, `git@github.com:o/r.git` and `o/r`, and refuses every other host. Stop on its error.
2. **Already there?** If `$LIB/libraries.toml` has a `[[team]]` with the same `url`, stop and name its alias.
3. **Access and default branch.** `GIT_TERMINAL_PROMPT=0 git -c credential.helper= ls-remote --exit-code --symref <url> HEAD` offers no credentials. If it succeeds the repo is public (`access = "public"`), and its first line (`ref: refs/heads/main`, then a tab and `HEAD`) names the default branch. If it fails, run `git ls-remote --exit-code --symref <url> HEAD` with the person's own credentials: success means a private repo (`access = "bridge"`, read through the agent's git credentials), failure means the repo does not exist or cannot be read, so stop and say so.
4. **Ref and path.** `kind=repo`: the default branch. `tree` or `blob`: `rest` is `<ref>/<path>`, and a branch name may hold slashes, so list `git ls-remote --heads <url>` and take the longest branch name that is a prefix of `rest`; the rest is the path. No branch matches: the first segment is a tag or sha.
5. **Clone** into `scripts/wf-lib.sh dir <o> <r>` (`~/.wf/libraries/<o>/<r>`): `git clone --depth 1 --branch <ref> <url> <dir>`, or `git -C <dir> pull --ff-only` when it exists. A private repo needs the person's own credentials. When the clone fails, tell them to sign in (`gh auth login`) or fix their SSH key. Never ask for a token and never write one to a file.
6. **Find the root.** The first rule that applies: (1) a path in the link; (2) `wf-library.toml` at the repo root, key `root`; (3) the first of `library/`, `docs/`, `wiki/`, `handbook/` that holds a `.md` file; (4) the repo root. With a person present and more than one folder from rule 3, offer each as a numbered choice with its page count ("1. docs/ · 42 pages"), the first as the default. A `blob` link names a page, not a root: apply rules 2 to 4 and tell the person which page it was.
7. **Alias.** The `alias` of step 1 (the repo name in lowercase), unless a `[[team]]` already uses it (add `-2`). `me` is the personal library, `t` is part of the routes and `ws` is this workspace in a skill reference (`ws:<name>`), so none of them is used.
8. **Append** one block to `$LIB/libraries.toml` (create the file if it is missing; do not rewrite the rest). `root` is left out when it is the repo root. `added` is today's date, an unquoted TOML date.

   ```toml
   [[team]]
   alias = "platform"
   url = "https://github.com/acme/platform-handbook"
   ref = "main"
   root = "docs"
   access = "public"         # public | bridge
   added = 2026-10-30
   ```

9. **Report** the alias, root, access, page count (`find "<dir>/<root>" -name '*.md' -not -path '*/.git/*' | wc -l`) and the clone's `git rev-parse --short HEAD`. **Save** (section 6) with `Add team library <alias>`.

Team libraries are read-only: never edit, commit or push inside a clone. To remove one, delete its `[[team]]` block and leave the clone.

## 6. Save

```
git -C "$LIB" status --short                  # only the files you meant
git -C "$LIB" add -A && git -C "$LIB" commit -m "<message>" && git -C "$LIB" push
```

One commit per request. The dashboard commits its own edits as `Edit <path>`. If the push fails, say the commit is local and why; never force-push.

## Red flags

- A write happened without `pull --ff-only`, or after it failed.
- A topic holds findings nobody gave you, or a finding has no source.
- A media file over 25 MB is committed, an image has no caption, or a file sits outside a `media/` folder.
- `libraries.toml` was rewritten instead of appended, or holds a token, a non-github.com url or the alias `me`, `t` or `ws`.
- You edited, committed in or pushed from a team library clone.
- A secret, a token or private customer data is in a page.
- A tree or blob link was split into ref and path without the remote's branch list.

## Checks for this skill

- Given `https://github.com/acme/handbook/tree/feature/x/docs`, the root is `docs` on the branch `feature/x` when that branch exists.
- Given a repo with `wf-library.toml` and a `docs/` folder, the manifest's `root` wins over the known folder.
- Given a GIF of 30 MB, nothing is committed and the person gets the link or LFS choice.
- Given a second request for the same url, `libraries.toml` is unchanged and the alias is named.
- Given a new note, the topic's `## Notes` links it and `updated` is today.
- After every run `git -C "$LIB" status --short` prints nothing and the dashboard shows the same pages.
