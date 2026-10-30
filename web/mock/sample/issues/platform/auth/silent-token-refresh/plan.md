---
updated_at: 2026-10-18T13:30+05:30
updated_by: "@claude-opus"
revision: 1
---

## Approach

Start a timer from the `expires_in` value of the token. Refresh through a hidden request. Queue API calls while the refresh runs.

## Assumptions

- A1: The identity provider allows refresh tokens. [open]

## Phase 1: Refresh

### T-1: Start a refresh timer from the token lifetime
- status: todo
- lane: web
- owns: `web/src/lib/auth/refresh.ts`
- satisfies: SC-1
- assignee: role:frontend
- verify: `pnpm -C web test token-refresh`

Read `expires_in` and set a timer for the moment when 5 min remain.

### T-2: Queue API calls during a refresh
- status: todo
- lane: web
- depends_on: T-1
- owns: `web/src/lib/auth/queue.ts`
- satisfies: SC-3
- assignee: role:frontend
- verify: `pnpm -C web test token-queue`

Hold every API call until the new token arrives, then replay the calls in order.

### T-3: Show the login page after 2 failures
- status: todo
- lane: web
- depends_on: T-1
- owns: `web/src/lib/auth/fail.ts`
- satisfies: SC-2
- assignee: role:frontend
- verify: `pnpm -C web test token-refresh-fail`

Count refresh failures. Redirect to the login page on the second one.
