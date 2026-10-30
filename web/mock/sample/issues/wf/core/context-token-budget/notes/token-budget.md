# Token budget of the context bundle

Measured on the 6 largest issues of the dogfood workspace, before and after the trim. Counts use the byte-pair estimate of [[#C-7pw3d]] with a 10% margin.

| Issue | Before | After | Dropped |
|---|---|---|---|
| `wf-3k9x2` Push board updates over SSE | 11,240 | 5,870 | 6 older changes, 2 library items |
| `wf-b1d7v` Build v1 | 9,410 | 5,640 | 3 older changes, 1 done task |
| `wf-t3jp5` Trim context bundles | 6,980 | 5,310 | 2 older changes |
| `wf-x5hd3` Promote learnings | 6,210 | 5,120 | 1 older change |
| `wf-skf01` Draw the skills flowchart | 4,880 | 4,880 | nothing |
| `wf-q4fs9` Reap expired task leases | 3,540 | 3,540 | nothing |

## Trim order

1. Changes older than the last 5.
2. Library items beyond the 3 best matches.
3. Done tasks.
4. Notes and docs.

The bundle never drops `## Needs you`, `## Next steps` or the open criteria.

## Findings

- The `tiktoken-rs` count ran 5% above the Claude tokenizer on markdown tables. See [[#C-2ys8h]].
- A diagram stub costs about 30 tokens. The raw archify JSON costs 1,800.
