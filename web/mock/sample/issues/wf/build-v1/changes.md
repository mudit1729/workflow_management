# Changes

## 2026-10-11T16:40+05:30 @codex — Verified SC-1 with `init_lints_clean` {#C-6hx3q}
- kind: verify
- task: T-1
- criteria: SC-1
- result: pass
- evidence: `cargo test -p wf-cli init_lints_clean` passed at `7c2e9d4`
- commit: 7c2e9d4
- model: gpt-5-codex

Ran `wf verify wf-b1d7v SC-1`. `wf init` created a workspace in a temp repo and `wf lint` reported zero findings.

## 2026-10-15T12:05+05:30 @mudit — Verified SC-2: roll-ups rebuild in 180 ms {#C-9rm5t}
- kind: verify
- task: T-2
- criteria: SC-2
- result: pass
- evidence: `cargo test -p wf-index rollup_latency` passed at `e41b8a7`
- commit: e41b8a7

Touched one `goal.md` in the golden workspace with 40 issues. The roll-ups rebuilt in 180 ms, below the 500 ms limit.

## 2026-10-16T17:30+05:30 @codex — Verified SC-3 with `write_conflict` {#C-4zp7d}
- kind: verify
- task: T-3
- criteria: SC-3
- result: pass
- evidence: `cargo test -p wf-server write_conflict` passed at `2fa90c6`
- commit: 2fa90c6
- model: gpt-5-codex

Changed `goal.md` between the read and the write. The server answered 409 with the current value and left the file untouched.

## 2026-10-21T14:17+05:30 @codex — CI timed out in `wf-index` {#C-8cw2n}
- kind: failure
- result: fail
- evidence: `test result: FAILED. finished in 612.04s`
- files: `.github/workflows/ci.yml`

The `rust` job ran past 10 min. Each test rebuilt the golden fixtures from scratch, and the runner has 2 cores.

## 2026-10-21T15:37+05:30 @codex — Built the golden fixtures once per CI run {#C-3tb6y}
- kind: fix
- commit: d90b4e3
- files: `fixtures/golden/build.rs`, `.github/workflows/ci.yml`

Moved the fixture build into a `build.rs` step and cached it. The `rust` job now takes 74 s.

## 2026-10-22T11:27+05:30 @claude-sonnet — Built the issue drawer on the mock server {#C-7qs5w}
- kind: progress
- task: T-5
- files: `web/src/features/issue/IssueDrawer.tsx`
- model: claude-sonnet-5-5

Added the five drawer tabs and the docked and overlay modes. The drawer reads every field from the mock `IssueDetail`.
