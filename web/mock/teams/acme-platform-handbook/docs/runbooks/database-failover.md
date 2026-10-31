---
title: Database failover
updated: 2026-10-12
author: "@ana"
---

# Database failover

The orders database has one primary and two replicas in other zones. Failover promotes a replica. It takes about 90 seconds, during which writes fail.

## Decide first

| Symptom                                      | Fail over?                        |
| -------------------------------------------- | --------------------------------- |
| Primary unreachable for more than 2 minutes  | Yes                               |
| Replica lag over 30 seconds, primary healthy | No. Find the slow query first.    |
| Disk over 90 percent on the primary          | No. Grow the disk, then watch it. |

> [!WARNING]
> Failing over discards writes the replica has not received yet. Check the lag in step 1 and write the number in the incident channel before you go on.

## Fail over

1. Read the lag of both replicas:

   ```sql
   SELECT application_name, replay_lag
   FROM pg_stat_replication;
   ```

2. Promote the replica with the smaller lag:

   ```sh
   platformctl db promote --cluster orders --replica orders-b
   ```

3. Wait for `platformctl db status --cluster orders` to show `primary: orders-b`.
4. Restart the `orders` pods so they reconnect.

## After

- Post the lag you wrote down and the time of the promotion in the incident channel.
- Rebuild the old primary as a replica. Do not put it back as primary.
- If a migration shipped in the last release, check it ran on the new primary: `platformctl db migrations --cluster orders`.

> [!NOTE]
> Rolling back a release that holds a migration is not just a redeploy. See [[getting-started/first-deploy]] for the normal path and ask @ana before you roll back.
