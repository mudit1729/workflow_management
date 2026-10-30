# Changes

## 2026-10-19T12:30+05:30 @cursor-bot — Moved focus between cards with j and k {#C-4kg7j}
- kind: progress
- commit: 7aa0e53
- files: `web/src/features/board/useBoardKeys.ts`

Added a roving tabindex to the cards of one column. `j` and `k` move focus down and up.

## 2026-10-20T16:15+05:30 @cursor-bot — Verified SC-1 with `board-keys` {#C-8sy2p}
- kind: verify
- criteria: SC-1
- result: pass
- evidence: `pnpm -C web test board-keys` passed at `d3f8a19`
- commit: d3f8a19

Ran `wf verify wf-h2tb7 SC-1`. The test presses `j` 5 times and checks the focused card.

## 2026-10-22T14:12+05:30 @shruti — Tested the keys on a board with 40 cards {#C-3dv6n}
- kind: review

Opened the board with 40 cards and pressed `j` to the end. Focus moved without a visible lag. Asked for a rule for empty columns.
