---
title: Your first deploy
updated: 2026-10-22
author: "@ana"
---

# Your first deploy

Every change reaches production through staging. You will do the whole path once, with a change that cannot hurt anything.

## The path

1. Branch from `main` and change a log line in the orders service.
2. Open a pull request. CI runs the unit tests and builds the image.
3. After one approval, merge. The pipeline deploys to **staging** by itself.
4. Check the dashboard for `orders` in staging: error rate flat, latency unchanged.
5. Press **Promote** in the pipeline. It deploys to production, one region at a time.

```sh
git switch -c first-deploy
git commit -am "orders: log the order id on create"
gh pr create --fill
```

> [!IMPORTANT]
> Promote on weekdays before 16:00 local time. After that, wait for the next morning unless it is a fix for an incident.

## Rolling back

Promote the previous release in the pipeline. It takes about four minutes and needs no approval. If a database migration shipped with the release, stop and read [[runbooks/database-failover]] first.

> [!TIP]
> A change you are unsure about can go out behind a flag. Flags are listed in `config/flags.yaml` and flipped without a deploy.
