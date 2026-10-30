# Learnings

## 2026-10-21T00:47+05:30 @codex — Rescan the subtree, since notify 8.2 drops rename events on macOS. {#L-2gk7r}
- kind: gotcha
- tags: notify, macos, watcher
- applies_to: `crates/*/src/watch.rs`, notify
- promote: candidate

Treat each notify event as a dirty hint. Rescan the nearest existing ancestor and compare the files by hash.

Evidence: [[#C-5wq7k]] lost a rename with notify 9.0-rc. [[#C-h6r3n]] passes `rename_folder` on 8.2 with the rescan.

## 2026-10-21T13:22+05:30 @claude-opus — Compare files by blake3 hash, never by mtime. {#L-6ct3p}
- kind: pattern
- tags: watcher, hashing
- applies_to: `crates/wf-index/**`
- promote: no

Compare files by blake3 hash, never by mtime. Editors and git checkouts rewrite mtimes without content changes.

Evidence: `git checkout main` touched 212 files. The hash diff found 3 real changes.

## 2026-10-21T14:52+05:30 @codex — Keep the SSE ring buffer at 256 events. {#L-9mz4e}
- kind: tip
- tags: sse, reconnect
- applies_to: `crates/wf-server/src/sse.rs`
- promote: candidate

Keep the SSE ring buffer at 256 events. Send `resync` when `Last-Event-ID` is older than the buffer.

Evidence: A 10 min soak test on this workspace produced 140 events.
