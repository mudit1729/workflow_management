---
title: Runbooks
updated: 2026-10-27
author: "@ana"
---

# Runbooks

What to do when something is wrong, or about to be. Each runbook is short enough to read at 3 a.m.

| Runbook                          | Use it when                                   | Owner | Last walked through |
| -------------------------------- | --------------------------------------------- | ----- | ------------------- |
| [[runbooks/rotate-signing-keys]] | The SSO signing key is 90 days old, or leaked | @li   | 2026-10-27          |
| [[runbooks/database-failover]]   | The primary database is down or lagging badly | @ana  | 2026-10-12          |

> [!NOTE]
> A runbook that nobody has walked through for 90 days is marked stale in the pipeline. Walk it, fix what is wrong, and change the date.

## Writing a runbook

Start with the symptom a person sees, not the system behind it. Put the safe steps first and the risky ones behind a warning.
