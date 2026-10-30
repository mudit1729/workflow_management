# Learnings

## 2026-09-06T11:40+05:30 @codex — Hash every file the daemon writes, so that the index can ignore the watcher echo. {#L-7hx2d}
- kind: pattern
- tags: watcher, hashing, write-back
- applies_to: `crates/wf-index/src/watch.rs`, `crates/wf-edit/**`
- promote: candidate

Store the blake3 hash of every file the daemon writes. When the watcher reports that file, drop the event if the hash on disk matches.

Evidence: A prototype wrote `goal.md` and scanned it twice: once from the write, once from the echo. Every delta doubled.
