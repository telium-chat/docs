---
title: Federation
description: Server discovery, server-to-server authentication, the signed route list and error semantics.
sidebar:
  order: 3
---

This page lists how one Telium server finds another, authenticates to it, which routes are signed, and how errors are reported. Every signed route uses [Family C](/reference/protocol/signing/#family-c-federation-requests) request signing and none accepts a user session token. Behaviour is described in [Federation overview](/federation/overview/).

## Discovery

| Request | Signed | Returns |
| --- | --- | --- |
| `GET https://<domain>/.well-known/telium/server` | no | `server_name`, `api` (API base), `gateway`, `keys`, `authority`, `protocol` |
| `GET <api>/_telium/v1/keys` | Family A document | `server_name`, `signer`, `authority`, `current_key_id`, `verify_keys` (`key_id` → `key`, `valid_from`, `valid_until` in ms), `generated_at` |
| `GET <api>/_telium/v1/health` | no | `{ok, server_name, authority}` |

After a relocation, `/keys` serves the **previous** domain's keys. `authority` differs from `server_name` after a warm-standby promotion.

## Authentication classes

- **`Fed`**: signed POST. Body cap 4 MB (raised only for `migrate/import`), else `413 too_large`. Large bodies: at most 2 concurrent reads, a 300 s window, and a 16 KiB/s floor after a 15 s grace (1 KiB/s for ordinary bodies). Slower peers are disconnected.
- **`FedOrigin`**: signed bodyless GET using the empty-body hash. Only the GET routes listed below.
- **Delegated**: the header carries `signer=` and `authority=` (a promoted server signing for `origin`). The receiver verifies with the signer's key and **MUST** require a promotion proof binding the signer to the origin.

## Signed routes

All are `POST /_telium/v1/...` (`Fed`) unless marked GET (`FedOrigin`):

```text
profile/update                    users/{user_id}/memberships
users/{user_id}/moved             users/{user_id}/revoked
relocation
dm/submit  dm/deliver  dm/reanchor  dm/typing  dm/leave  dm/departed
dm/handoff  dm/handoff/request
dm/notification-keys  dm/notification-hints
dm/keypackages/claim  dm/verify  dm/voice  dm/voice/notify  dm/voice/token
friends/relay  friends/presence  friends/mutual-check
media/authorize  media/purge  media/moved  media/moved/list
users/{user_id}/notification-keys  users/{user_id}/notifications
notifications/keys/batch  notifications/batch
report  emoji/entitlement
bots/installations/receipt
migrate/import (raised cap, gated)  migrate/receipt
migrate/media/fetch  migrate/media/confirm  migrate/handoff/deliver
GET dm/frames/{id}/{since}  GET dm/handoff/{id}
GET applications/{application_id}/federation
GET failover/head  GET failover/log  GET failover/snapshot
GET failover/media/{hash}
```

`dm/submit` and `dm/deliver` are distinct routes; there is no `dm/send`. Notification batches carry at most 128 recipients and 256 device envelopes per call.

## Errors

```json
{"error":"forbidden","code":"bot_not_installed","message":"…"}
```

Branch only on `code`. `message` is English prose and may change.

| HTTP | `error` | Retry |
| --- | --- | --- |
| 400 | `bad_request` | no |
| 400 | `incompatible_protocol` | no; see [Compatibility](/reference/compatibility/) |
| 401 | `unauthorized` | no (unless your clock was wrong) |
| 403 | `forbidden` | no; includes defederation |
| 403 | `step_up_required` | after step-up (admin routes) |
| 404 | `not_found` | no |
| 409 | `conflict` | no |
| 409 | `try_again` | yes, shortly (tell it apart from `conflict` by `code`) |
| 409 | `demoted` | no; follow the `authority` field |
| 413 | `too_large` | no |
| 422 | `unprocessable_entity` | no; version skew, see [Compatibility](/reference/compatibility/) |
| 429 | `rate_limited` | yes, with backoff |
| 500 | `internal` | yes, with backoff |
| 502 | `bad_gateway` | upstream failure |
| 503 | `upstream_unavailable`, `standby_read_only` | upstream failure, or a write to a standby copy |
| 504 | `gateway_timeout` | upstream failure |

- A request to a defederated domain fails locally as `403 forbidden`.
- Codes are the constants in [`server/src/errcodes.rs`](https://github.com/telium-chat/telium/blob/main/server/src/errcodes.rs) (normative). A code never changes spelling or meaning and never changes its status or `error`. Adding a code is compatible ([Stability](/start/stability/)). A 500 has no code.
- Values named in the message travel as extra top-level fields, for example `permission` alongside `missing_permission`. They never shadow `error`, `code` or `message`.
- `demoted`, `standby_read_only` and `shut_down` appear in both `error` and `code`.
- For an unknown code, fall back to `error` for retry decisions and `message` for display.
