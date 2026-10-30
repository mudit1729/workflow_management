---
name: logging-work
description: Use when something happened on a wf issue that the log must keep, such as work finished, a test run, a failure, a choice between options, a surprise worth remembering, or a human's answer to a request. Appends one entry to changes.md, decisions.md or learnings.md in the exact heading format with a fresh anchor id. Avoid for updating the current state (use handing-off), for editing or deleting old entries (logs are append-only), and for ticking tasks or criteria (use doing-next-step).
---

# Logging work

The three logs are what makes an issue traceable: every entry has a time, an author, a title, a stable id and, for changes, a commit. They are append-only. Formats: `../using-wf/references/format.md` section 8.

## Pick the file

| What happened | File | Id prefix | Title shape |
|---|---|---|---|
| Work was done, tested, failed, reviewed, verified or answered | `changes.md` | `C-` | past tense: "Added the SSE delta stream" |
| A choice was made between real options | `decisions.md` | `D-` | the choice as an imperative: "Push board updates over SSE" |
| A rule worth keeping for later work | `learnings.md` | `L-` | the rule, subject first, full stop: "Compare files by hash, never by mtime." |

If it is one of several lines of the same kind, collect them first and write the titles together (`writing-readable-bulk-text`).

## Steps

1. **Resolve.** `$ISSUE` = `../using-wf/scripts/wf-env.sh issue <id|slug|path>`. Your handle comes from `$WF_AUTHOR` or `authors.md` (an unknown handle gets a block in `authors.md` first, `format.md` section 9).
2. **Make the heading.** `## <now> @<you> — <title> {#<id>}` with `wf-env.sh now` and `wf-env.sh id change|decision|learning`. Use the long dash ` — `. Never reuse an id.
3. **Fill the meta list** directly under the heading, no blank line, keys in the order of `format.md` section 8.
   - Change: `kind`, `task` (the `T-n` it belongs to), `criteria`, `result` (`pass` or `fail`), `evidence` (the command and its result), `commit` (short sha), `files` (backticked paths: relative to the issue folder for its own files such as `plan.md`, else relative to the repository root). Write only the keys that apply. A test, verify or failure entry always has `result` and `evidence`.
   - Decision: `status` (`proposed`, `accepted` or `rejected`), `topic`, `supersedes` (when it replaces an earlier decision), `affects` (`SC-n`), `decided_by` (handles).
   - Learning: `kind` (`tip`, `gotcha`, `pattern`), `tags`, `applies_to`, `promote` (`candidate` if other issues would repeat the mistake, else `no`).
4. **Write the body** after one blank line.
   - Change: past tense, one change, at most 3 sentences. Name the file, the command or the number. Do not start with "It" or "This".
   - Decision: bold labels, point first: `**Decision:**`, `**Because:**`, `**Rejected:**`, `**Consequences:**`, `**Revisit when:**`. Only `Decision` and `Because` are required.
   - Learning: the rule first, then a blank line and `Evidence:` with a link such as `[[#C-5wq7k]]`, at most 3 lines.
5. **Append at the bottom.** If the file is missing, create it with its H1 (`# Changes`, `# Decisions` or `# Learnings`). Leave exactly one blank line before the new heading and end the file with one newline. Add the text with an append (`cat >> "$ISSUE/changes.md" <<'EOF' ... EOF`, or the editor's insert at the end of the file); do not rewrite the file.
6. **Special cases.**
   - A mistake in an old entry: append a new entry; for a decision add `supersedes: D-xxxxx`. Only the `status:` line of a decision may change in place (`proposed` to `accepted` or `rejected`).
   - A human answered a `Needs you` request: remove that item from `current_state.md`, then append a `kind: answer` change whose body is `**Q:** <question>` and `**A:** <answer> (@person)`.
   - A failure: `kind: failure`, `result: fail`, and a title with a clearly negative verb ("Lost", "Failed", "Broke"). Do not soften it.
7. **Check.** Run `pnpm -s -C web wf:lint <root>`; fix findings in your entry (max 3 rounds). Report the id you wrote.

## Example

From `wf-3k9x2`. A change, a decision and a learning, in that order:

```markdown
## 2026-10-21T00:25+05:30 @codex — Reverted to notify 8.2 and rescanned the subtree {#C-h6r3n}
- kind: fix
- task: T-2
- result: pass
- commit: a3f9c21
- files: `crates/wf-index/src/watch.rs`, `Cargo.lock`

Pinned notify 8.2. Mapped each event to its nearest existing ancestor and rescanned that subtree. `rename_folder` passes.
```

```markdown
## 2026-10-20T19:37+05:30 @claude-opus — Push board updates over SSE {#D-7f3k2}
- status: accepted
- topic: live-transport
- supersedes: D-2ab3c
- affects: SC-1, SC-3
- decided_by: @claude-opus, @shruti

**Decision:** Use SSE for board updates.
**Because:** Data flows one way. SSE reconnects with `Last-Event-ID`. Polling every 2 s misses the latency target.
**Rejected:** WebSocket (two-way, more code); polling (latency up to 2 s).
```

```markdown
## 2026-10-21T13:22+05:30 @claude-opus — Compare files by blake3 hash, never by mtime. {#L-6ct3p}
- kind: pattern
- tags: watcher, hashing
- applies_to: `crates/wf-index/**`
- promote: no

Compare files by blake3 hash, never by mtime. Editors and git checkouts rewrite mtimes without content changes.

Evidence: `git checkout main` touched 212 files. The hash diff found 3 real changes.
```

## Red flags

- You edited or deleted an old entry.
- The heading uses a hyphen, has no `{#id}`, or the id exists elsewhere (`grep -r` finds it).
- A change has no `commit` although the work is committed, or a failure has no `evidence`.
- The title says "various fixes", "updates" or "stuff".
- A decision lists no `Because`.
