# Decisions

## 2026-10-07T10:20+05:30 @codex — Store spans as byte offsets {#D-5fm3v}
- status: accepted
- topic: spans
- affects: SC-1
- decided_by: @codex, @mudit

**Decision:** Store every span as a pair of byte offsets.
**Because:** The writer splices bytes. A line and column pair needs a second conversion and breaks on multi-byte characters.
**Rejected:** Line and column (a conversion on every write).
**Consequences:** Lint findings convert the offset to a line and column when they print.
**Revisit when:** A second editor needs line and column spans.
