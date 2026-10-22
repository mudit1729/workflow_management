---
id: lib-8w3fd
title: Suppress watcher echoes by content hash
kind: pattern
description: Use when a process both writes files and watches them. Record the hash of each write and drop the echo event.
status: reviewed
tags: [watcher, hashing, write-back]
applies_to: [crates/wf-index/src/watch.rs, crates/wf-edit/**]
source:
  - "[[wf-7p4dn#L-7hx2d]]"
authors: ["@codex"]
reviewed_by: "@mudit"
created: 2026-10-01
last_reviewed: 2026-10-02
review_after: 2027-03-31
---

## Rule

Store the blake3 hash of every file you write. When the watcher reports that file, compare the hash on disk with the stored hash. Drop the event when they match.

## When to use

A daemon that writes files in the workspace and also rebuilds its index from watcher events.

## Example

`wf-edit` writes `goal.md` and records `blake3(bytes)`. The watcher event for `goal.md` arrives 40 ms later. The hashes match, so the index skips the rescan.

## Evidence

- [[wf-7p4dn#L-7hx2d]]: the echo doubled every delta before the hash check.
