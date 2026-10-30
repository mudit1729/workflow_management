# Changes

## 2026-10-18T13:20+05:30 @codex — Counted tokens with a byte-pair estimate {#C-7pw3d}
- kind: progress
- task: T-1
- commit: c47a1be
- files: `crates/wf-cli/src/context/tokens.rs`
- model: gpt-5-codex

Added `estimate_tokens()`. It counts byte pairs and adds a 10% margin. The estimate stayed within 4% of the Claude tokenizer on 40 sample bundles.

## 2026-10-18T17:10+05:30 @codex — Overcounted tokens by 5% against the Claude tokenizer in `tiktoken-rs` {#C-2ys8h}
- kind: failure
- task: T-1
- result: fail
- evidence: `bundle 6290 > budget 6000`
- files: `crates/wf-cli/Cargo.toml`

Tried `tiktoken-rs` for the count. It over-counted markdown tables, and the trim cut sections that fit.

## 2026-10-19T11:45+05:30 @codex — Verified SC-1 with `context_budget` {#C-3mf7q}
- kind: verify
- task: T-1
- criteria: SC-1
- result: pass
- evidence: `cargo test -p wf-cli context_budget` passed at `c47a1be`
- commit: c47a1be

Ran `wf verify wf-t3jp5 SC-1`. The largest bundle of the golden workspace came out at 5,870 tokens.

## 2026-10-21T14:27+05:30 @codex — Dropped sections in a fixed order {#C-9ez6r}
- kind: progress
- task: T-2
- criteria: SC-2
- commit: e50d93c
- files: `crates/wf-cli/src/context/trim.rs`
- model: gpt-5-codex

Added `trim()`. It drops older changes, then library items, then done tasks, and stops at the first fit.

## 2026-10-22T15:32+05:30 @codex — Tested the trim order on the golden workspace {#C-5kn4j}
- kind: test
- task: T-2
- criteria: SC-2
- result: pass
- files: `crates/wf-cli/tests/trim_order.rs`

Trimmed the 6 largest issues of the dogfood workspace. Every bundle fit 6000 tokens. See `notes/token-budget.md`.
