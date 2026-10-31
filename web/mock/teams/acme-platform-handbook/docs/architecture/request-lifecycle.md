---
title: Request lifecycle
updated: 2026-10-26
author: "@li"
---

# Request lifecycle

What happens to `POST /orders` between the browser and the database.

## 1. At the gateway

The gateway ends TLS, applies the rate limit for the caller (100 requests a minute for a signed-in user) and writes the first trace span with a new request id.

## 2. Auth

The gateway asks `auth` to check the token. `auth` verifies the signature against the current key set, then checks the token has not expired. See [[runbooks/rotate-signing-keys]] for how the key changes.

```json
{ "sub": "user_8f2", "exp": 1793000000, "kid": "sso-signing-v4" }
```

If `auth` does not answer within 500 ms the gateway refuses the request with a 503. It never lets a request through unchecked.

## 3. Orders

`orders` validates the body, writes the order in one transaction and publishes an `order.created` event.

## 4. The way back

The response carries the request id in the `x-request-id` header. Quote it when you report a problem: with it, anyone can find every span of that request.

| Step                | Typical time | Budget |
| ------------------- | ------------ | ------ |
| Gateway             | 3 ms         | 10 ms  |
| Auth                | 8 ms         | 50 ms  |
| Orders and database | 35 ms        | 200 ms |

> [!TIP]
> To follow one request, search the trace tool for its id. The spans line up like the steps above.
