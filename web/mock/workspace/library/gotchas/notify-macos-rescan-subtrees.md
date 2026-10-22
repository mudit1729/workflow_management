---
id: lib-4tz7c
title: Rescan subtrees instead of trusting notify on macOS
kind: gotcha
description: Use when a file watcher on macOS must follow renamed or deleted folders. Treat each event as a dirty hint and rescan.
status: reviewed
tags: [notify, macos, watcher]
applies_to: [crates/*/src/watch.rs, notify, fsevents]
source:
  - "[[wf-3k9x2#L-2gk7r]]"
  - "[[wf-3k9x2#C-5wq7k]]"
authors: ["@codex", "@claude-opus"]
reviewed_by: "@shruti"
created: 2026-10-21
last_reviewed: 2026-10-21
review_after: 2027-04-19
---

## Symptom

After a folder rename, the watcher reports the new path. The old path stays in the index. A test that renames an issue folder fails.

## Cause

FSEvents merges the events of one folder. notify then sends no remove event for the old path, and notify 9.0-rc sends `Remove(Any)` without it.

## Fix

1. Treat each event as a dirty hint for its path.
2. Map the path to its nearest existing ancestor.
3. Rescan that subtree and compare the files by blake3 hash.

## Evidence

- [[wf-3k9x2#C-5wq7k]]: `rename_folder` failed with notify 9.0-rc.
- [[wf-3k9x2#C-h6r3n]]: `rename_folder` passes on notify 8.2 with the rescan.
