---
title: High latency on orders
updated: 2026-10-30
author: "@ana"
---

# High latency on orders

Use this when the `orders` dashboard shows p95 above 400 ms for more than five minutes.

## Find where the time goes

1. Open the slowest trace of the last ten minutes and read its spans from the top.
2. Look at the longest span. It is almost always the database, a payment call, or the gateway queue.

| Longest span    | Likely cause                | Go to                                          |
| --------------- | --------------------------- | ---------------------------------------------- |
| `orders.db`     | A slow query or replica lag | [[runbooks/database-failover]], "Decide first" |
| `payments.call` | The payments API is slow    | Check their status page, then open a ticket    |
| `gateway.queue` | Too few gateway pods        | Scale `gateway` to 6                           |

> [!TIP]
> Scaling the gateway is safe and can be undone. Try it before anything that touches data.
