---
title: Set up your laptop
updated: 2026-10-14
author: "@li"
---

# Set up your laptop

About 40 minutes, most of it downloads.

## What you need first

| Tool   | Version     | Check with         |
| ------ | ----------- | ------------------ |
| Docker | 25 or newer | `docker --version` |
| Node   | 22          | `node --version`   |
| Go     | 1.23        | `go version`       |
| `gh`   | any         | `gh auth status`   |

## Steps

1. Clone the monorepo and the handbook side by side:

   ```sh
   gh repo clone acme/platform
   gh repo clone acme/platform-handbook
   ```

2. Start the local stack. It runs the gateway, auth and orders services with a throwaway database:

   ```sh
   cd platform
   make dev
   ```

3. Open `http://localhost:8080/healthz`. It answers `ok` when every service is up.

> [!WARNING]
> `make dev` writes to a local database only. Never point it at staging: the seed script drops every table first.

## If something fails

- **Port 5432 is taken.** A Postgres from another project is running. Stop it, or set `PGPORT=5433` in `.env`.
- **`make dev` hangs on auth.** The signing key is created on the first run and takes about a minute. See [[runbooks/rotate-signing-keys]] for what the key does.

Next: [[getting-started/first-deploy]].
