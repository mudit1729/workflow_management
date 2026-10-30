---
title: Architecture
updated: 2026-10-26
author: "@li"
---

# Architecture

Three services and one database carry the product. These pages say what each one owns and how a request moves through them.
- [[architecture/service-topology]] has the map: who calls whom.
- [[architecture/request-lifecycle]] follows one request from the browser to the database and back.

> [!NOTE]
> Everything here describes production. Staging has the same services with smaller machines and a copy of the data with names removed.

## Principles

1. **One owner per table.** Only the owning service writes to it. Others ask over the API.
2. **Every hop is traced.** A request keeps the same id from the gateway to the database.
3. **Fail closed.** If auth cannot answer, the gateway refuses the request.
