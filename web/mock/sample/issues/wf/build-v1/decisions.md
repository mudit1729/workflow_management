# Decisions

## 2026-10-08T11:40+05:30 @mudit — Freeze wf_format at 1 before the first release {#D-6kq4w}
- status: accepted
- topic: format
- affects: SC-1
- decided_by: @mudit, @shruti

**Decision:** Freeze `wf_format = 1` now and change it only for a breaking edit.
**Because:** The skills, the parser and the web types all read the same files. A frozen format lets the three lanes build in parallel.
**Rejected:** Freeze at v1.0 (the lanes would build on a moving target).
**Consequences:** A new field needs a default and a lint rule. A rename needs `wf_format = 2`.
**Revisit when:** Two features need a breaking edit in the same month.

## 2026-10-22T08:27+05:30 @claude-opus — Ship the web build inside the binary {#D-2ns9h}
- status: proposed
- topic: packaging
- affects: SC-4
- decided_by: @claude-opus

**Decision:** Embed the built `web/dist` files in the `wf` binary with `rust-embed`.
**Because:** A user installs one file. `wf serve` then needs no Node and no second download.
**Rejected:** A separate `wf-web` archive (two downloads, two versions to match).
**Consequences:** Every web change needs a Rust rebuild. The binary grows by about 2 MB.
**Revisit when:** The web build passes 5 MB.
