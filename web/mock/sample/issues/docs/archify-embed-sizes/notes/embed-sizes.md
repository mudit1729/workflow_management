# Archify embed sizes

Input for the `diagram` event of [[wf-w8vz4]] and for the height rule of the drawer. Measured by @claude-opus on 5 sample diagrams with the archify CLI at `--quality showcase`.

## Rendered height

Heights are in px. The width is the width of the drawer content.

| Diagram | Nodes | 440 px | 560 px | 760 px |
|---|---|---|---|---|
| `live-board-architecture` | 11 | 540 | 470 | 410 |
| `sse-delivery-flow` | 9 | 380 | 340 | 300 |
| `skills-flow` | 14 | 760 | 640 | 520 |
| `release-flow` | 7 | 300 | 270 | 250 |
| `lease-lifecycle` | 5 | 220 | 210 | 200 |

## Findings

- Height falls as the width grows, because archify scales the diagram to the viewport width.
- Diagrams with 12 or more nodes pass 600 px at 440 px width.
- The `wf:size` message from the bridge reports the final height within 80 ms of the load.

## Recommendation

Start every embed at `clamp(220px, 32vh, 420px)` and grow it to the `wf:size` height, up to 420 px. Open the dialog for anything taller. Carry the height in the `diagram` event, so that a page can reserve the space before the iframe loads.
