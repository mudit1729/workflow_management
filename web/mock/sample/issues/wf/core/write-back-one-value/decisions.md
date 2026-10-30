# Decisions

## 2026-08-07T11:20+05:30 @codex — Splice one value span; never re-serialize frontmatter {#D-3qv8n}
- status: accepted
- topic: write-back
- affects: SC-1
- decided_by: @codex, @mudit

**Decision:** Replace only the bytes of the changed value. Never write a file from a serialized tree.
**Because:** People edit these files by hand. A round trip drops their comments and reorders their keys.
**Rejected:** A round-trip YAML serializer (loses comments); a custom YAML emitter (a large surface to maintain).
**Consequences:** Every editable value needs a byte span from the parser.
**Revisit when:** A value needs a multi-line rewrite that a span cannot express.
