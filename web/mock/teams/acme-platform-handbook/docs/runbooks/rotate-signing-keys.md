---
title: Rotate signing keys
updated: 2026-10-27
author: "@li"
---

# Rotate signing keys

The SSO service signs every login token with one key. Rotate it every 90 days, and at once if it may have leaked. A rotation takes about five minutes and logs nobody out.

Recording of a rotation on staging:

![Rotating the SSO signing key from a terminal](media/rotate-signing-keys.webm)

## Before you start

- You are in the `platform-oncall` group (check with `gh api user/teams`).
- Staging is healthy. Do not rotate during an incident unless the key leaked.

## Rotate

1. Create the new key version and make it the active one:

   ```sh
   kms keys rotate --alias sso-signing
   ```

2. Check that both versions are published. Tokens signed with the old key stay valid for a week, so the key set must hold both:

   ```sh
   kms keys status --alias sso-signing
   ```

3. Watch the `sso` dashboard for ten minutes. Sign-in errors should stay at zero.

| You see                       | It means                         | Do                           |
| ----------------------------- | -------------------------------- | ---------------------------- |
| `v4 active`, `v3 retiring`    | Rotation worked                  | Nothing                      |
| Sign-in errors rise           | A service cached the old key set | Restart the `gateway` pods   |
| `v4` missing from the key set | Publishing failed                | Run the rotate command again |

> [!CAUTION]
> If the key leaked, do not wait a week. Run `kms keys revoke --alias sso-signing --version 3` after the new key is active. Everyone signs in again.

## Why tokens keep working

Services refresh their copy of the key set every minute, so a new key is trusted everywhere within about a minute. The issue [[wf-y4bz7]] makes clients refresh their own tokens before they expire, which is why a rotation does not log anyone out.

Related: [[architecture/request-lifecycle]] shows where the token is checked.
