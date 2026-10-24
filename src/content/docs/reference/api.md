---
title: HTTP and gateway API
description: A map of Telium's HTTP endpoint families, authentication classes and the realtime gateway.
sidebar:
  order: 1
---

This page maps Telium's network surface by family. It is a guide, not a schema: the executable registry is [`server/src/routes/mod.rs`](https://github.com/telium-chat/telium/blob/main/server/src/routes/mod.rs), and it wins when the two disagree. Read it before scripting against exact methods and paths.

All application endpoints below live under `/_telium/v1` unless shown with a full path. Which families a server mounts depends on its enabled roles (identity, guild, media, relay).

## Authentication classes

| Class | Used for | Credential |
| --- | --- | --- |
| Home session | Account-home API | `Authorization: Bearer <home token>` |
| Guild session | Guild API and guild gateway | `Authorization: Bearer <guild token>`, or the gateway `IDENTIFY` token |
| Signed server request | Server-to-server operations | Federation request signature ([Signing](/docs/reference/protocol/signing/#family-c-federation-requests)) |
| Signed public document | Public lookups (account status, profile, keys) | None; trust the verified signature on the returned document |
| Media capability | Object fetch | Unguessable capability carried with the media reference |
| Public | Discovery, invite previews, failover status | None, with route-specific information limits |

Never present a home token to a foreign guild server. The client exchanges a short-lived, audience-bound identity assertion from its home for a guild-local session instead (`POST /sessions`).

## Discovery and server information

```text
GET /.well-known/telium/server
GET /_telium/v1/keys
GET /_telium/v1/health
GET /_telium/v1/capabilities
GET /_telium/v1/hosting/providers
GET /_telium/v1/hosting/catalog
GET /_telium/v1/hosting/publication
GET /metrics
```

Discovery names the logical server and its current API and gateway endpoints. `/keys` publishes signing keys and `/health` checks reachability and authority. `/capabilities` publishes enabled features and selected operator policy for client feature gating. `/hosting/*` lists managed guild-hosting providers, the signed catalogue this server publishes, and the key to pin for it ([Managed hosting](/docs/self-hosting/managed-hosting/)). `/metrics` is the Prometheus endpoint ([Observability](/docs/self-hosting/observability/)).

## Account and identity

Identity-role routes, all authenticated with a home session unless noted.

```text
POST   /register
POST   /register/opaque/start | /register/opaque/finish
POST   /login
POST   /login/opaque/start | /login/opaque/finish
POST   /password-reset/opaque/start | /password-reset/opaque/finish
POST   /auth/opaque/enroll/start | /auth/opaque/enroll/finish
POST   /auth/opaque/reauth/start | /auth/opaque/reauth/finish
POST   /auth/recovery-key/vault-copy/start | /auth/recovery-key/vault-copy/finish
POST   /logout
POST   /logout-all
GET    /whoami
POST   /account/reactivate
POST   /account/deactivate
GET    /account/export
POST   /account/bundle
DELETE /account
GET    /mfa
POST   /mfa/setup | /mfa/enable | /mfa/disable
GET    /devices
DELETE /devices/{device_id}                  (optional body: root-signed revocation)
GET|PUT    /crosssigning
PUT        /crosssigning/devices/{device_id}
PUT|DELETE /crosssigning/users/{user_id}
GET    /identity
PUT    /identity/anchor
PUT    /identity/recovery-policy
POST   /identity/rotate
PATCH  /profile
POST   /assertions
GET|PUT  /account/recovery-email
GET|POST /account/recovery-email/confirm     (signed out; token from the message)
GET|POST /account/recovery-email/disown      (signed out; token from the message)
POST   /admin/mail/bounce                    (administrators only)
GET    /sync
GET|PUT|DELETE /sync/{key}
```

See [Account security](/docs/security/account-security/) and [Identity continuity](/docs/security/identity-continuity/).

### Sync store

Current clients write only sealed envelopes (`{"sealed": "v1", "kid", "iv", "ct"}`), which the server stores and quotas without opening ([Sync encryption](/docs/security/sync-encryption/)).

- Reads omit sealed values unless the client passes `?sealed=1`.
- The first sealed write marks the account's store sealed. After that a plaintext `PUT` returns `409`.
- `stickers.saved.v1` and `drafts.v2` accept sealed values only (`400` otherwise).
- Keys are at most 64 characters. `DELETE` is always allowed.

### Public account lookups

```text
GET /users/{user_id}/profile
GET /users/{user_id}/public-page
GET /users/{user_id}/devices
GET /users/{user_id}/identity
GET /users/{user_id}/status
```

These GETs are public and return signed documents. Peers verify the origin signature before trusting them.

### Push and notifications

```text
GET|POST    /push
GET         /push/vapid
DELETE      /push/{id}
PUT|DELETE  /notifications/device
POST        /notifications/test-wake
GET         /notifications
POST        /notifications/ack
```

See [Notifications](/docs/features/notifications/).

## Guild sessions

```text
POST /sessions
POST /sessions/local
```

`/sessions` exchanges an audience-bound identity assertion for a guild-local session. `/sessions/local` is mounted only when the identity and guild roles run on the same server, and performs the same exchange internally.

## Guilds, channels, roles and invites

```text
GET|POST          /guilds
GET|PATCH|DELETE  /guilds/{guild_id}
POST              /guilds/{guild_id}/transfer-ownership
GET               /guilds/{guild_id}/status
PUT|DELETE        /guilds/{guild_id}/alias
GET               /guild-aliases/{alias}
GET               /guild-addresses/resolve?address=%23name%3Ahost
GET               /guilds/{guild_id}/join-preview
POST              /guilds/{guild_id}/join
GET|POST|PATCH    /guilds/{guild_id}/channels
PATCH|DELETE      /channels/{channel_id}
PUT               /channels/{channel_id}/voice-status
PUT               /channels/{channel_id}/overwrites/{target_type}/{target_id}
GET|POST|PATCH    /guilds/{guild_id}/roles
PATCH|DELETE      /guilds/{guild_id}/roles/{role_id}
GET               /guilds/{guild_id}/members
GET|PATCH|DELETE  /guilds/{guild_id}/members/{user_id}
GET               /guilds/{guild_id}/bans
PUT|DELETE        /guilds/{guild_id}/bans/{user_id}
POST              /guilds/{guild_id}/leave
GET|POST          /guilds/{guild_id}/invites
DELETE            /guilds/{guild_id}/invites/{code}
GET               /invites/{code}
POST              /invites/{code}/join
GET               /guilds/{guild_id}/expressions
POST              /guilds/{guild_id}/emojis
DELETE            /guilds/{guild_id}/emojis/{emoji_id}
GET               /emoji/{emoji_id}
POST              /guilds/{guild_id}/stickers
GET               /sticker/{sticker_id}
GET               /guilds/{guild_id}/audit-log
```

- `PATCH` on the channel and role collections reorders them.
- Channel overwrites are created or replaced with `PUT`. That path has no `DELETE`.
- `PATCH /guilds/{guild_id}` also accepts `emoji_export_policy` (`everyone`, `members`, `role`) and `emoji_export_role_id`, which set who may use the guild's emoji outside it.
- `GET /guild-aliases/{alias}` is public vanity-address resolution.
- `/guild-addresses/resolve` is public only for addresses on that server (or its verified relocated successor). A guild session may also use it to resolve a foreign address through its connected server. Anonymous callers cannot use it as a federation proxy.
- `join-preview` is public but answers only while the guild has a live vanity address. `POST .../join` needs a guild session, uses that address as authorisation, then runs the normal join gates and screening.

In the browser, `/invite/gaming` is the HTTPS spelling of `#gaming:host`. Generated invite codes start with `~` (for example `/invite/~abcdefgh`), which vanity names cannot contain. The web landing tries an invite first and falls back to vanity resolution on not-found.

See [Guilds](/docs/features/guilds/).

## Messages and channel state

```text
GET|POST     /channels/{channel_id}/messages
PATCH|DELETE /channels/{channel_id}/messages/{message_id}
POST         /channels/{channel_id}/typing
GET          /channels/{channel_id}/segments
GET|DELETE   /messages/{message_id}/reactions
PUT|DELETE   /messages/{message_id}/reactions/{emoji}/@me
GET          /channels/{channel_id}/pins
PUT|DELETE   /channels/{channel_id}/pins/{message_id}
GET|POST     /channels/{channel_id}/threads
PATCH|DELETE /threads/{thread_id}
POST         /channels/{channel_id}/ack
GET          /guilds/{guild_id}/read-state
GET          /guilds/{guild_id}/search
POST         /channels/{channel_id}/follow
DELETE       /channels/{channel_id}/follow/{target_id}
```

### Interactions

```text
POST       /channels/{channel_id}/messages/{message_id}/interact
POST       /channels/{channel_id}/ephemeral/{ephemeral_id}/interact
POST|PATCH /interactions/{id}/{token}/callback
POST       /interactions/{id}/modal
```

See [Interactivity](/docs/features/interactivity/).

## Bots and applications

```text
GET|POST          /applications
GET|PATCH|DELETE  /applications/{application_id}
POST              /applications/{application_id}/token/reset
POST              /bots/assertions
GET               /bots/installations
POST              /bots/session
GET|POST          /guilds/{guild_id}/bots
POST              /guilds/{guild_id}/bots/preview
PATCH|DELETE      /guilds/{guild_id}/bots/{bot_user_id}
```

Applications and bot assertions live on the identity role; bot sessions and installations on the guild role. See [Bots](/docs/features/bots/).

## Moderation

```text
POST         /guilds/{guild_id}/moderation/purge
GET|POST     /guilds/{guild_id}/automod
PATCH|DELETE /guilds/{guild_id}/automod/{rule_id}
GET          /guilds/{guild_id}/automod-hits
GET|PUT      /guilds/{guild_id}/gates
POST         /guilds/{guild_id}/gates/refresh-feeds
GET          /guilds/{guild_id}/gates/curators
GET          /guilds/{guild_id}/held
POST         /guilds/{guild_id}/held/{held_id}
GET          /guilds/{guild_id}/applicants
POST         /guilds/{guild_id}/applicants/{user_id}
POST         /guilds/{guild_id}/screening
```

Two report paths have different trust boundaries:

```text
POST /reports   # client-facing report submission
POST /report    # signed server-to-server report delivery
```

## Operator administration

```text
GET             /admin/status
GET             /admin/version
GET             /admin/health
GET             /admin/continuity
GET             /admin/audit
GET|POST|DELETE /admin/step-up
GET             /admin/reports
PATCH           /admin/reports/{id}
GET|POST|DELETE /admin/blocklist-feeds
POST            /admin/blocklist-feeds/refresh
GET             /admin/hosting-catalogs
POST            /admin/hosting-catalogs/refresh
GET|POST        /admin/defederation
DELETE          /admin/defederation/{domain}
GET             /admin/peers
GET             /admin/peers/{origin}
POST            /admin/revalidate
POST            /admin/archive
POST            /admin/media/curator-key/rotate
GET             /admin/moderation/summary
GET             /admin/metrics
GET             /admin/metrics/series
GET             /admin/storage
POST            /admin/storage/sweep
GET             /admin/accounts
GET             /admin/accounts/{user_id}
POST            /admin/accounts/{user_id}/suspend
POST            /admin/accounts/{user_id}/reinstate
GET             /admin/guilds
GET             /admin/guilds/{guild_id}
POST            /admin/guilds/{guild_id}/purge
GET             /admin/ownership
POST            /admin/ownership/grant
POST            /admin/ownership/revoke
GET             /admin/ownership/sessions
DELETE          /admin/ownership/sessions/{device_id}
POST            /admin/ownership/recovery/{id}/cancel
```

| Route | Returns |
| --- | --- |
| `/admin/status` | Name, build, protocol, uptime, roles, registration, demoted/shut-down state, queue counts |
| `/admin/health` | Signals with `key`, `severity` (`notice`/`warning`/`critical`), `title`, `cause`, `action`, loudest first. `verdict` is the worst severity, or `ok`. Reads existing state; never probes. |
| `/admin/continuity` | Standby, mirror, sunset and tombstone state (read-only) |
| `/admin/accounts`, `/admin/guilds` | Operator reads. Guild reads give shape only (counts, owner, archive size, moved), never content. |
| `/admin/metrics` | Live snapshot: counters since process start, latency percentiles, gauges sampled on request |
| `/admin/metrics/series` | History re-bucketed into `points` buckets between `since` and `until`. Histograms are merged before percentiles are taken. |
| `/admin/peers` | Peer table with queue depth per destination; probes nothing |
| `/admin/peers/{origin}` | One live probe |
| `/admin/storage`, `/admin/storage/sweep` | Disk usage; reclaim expired cache entries and unreferenced media |

Measurement responses are aggregates only (whole-server or per-route), never scoped to an account, conversation or channel. A value that was not sampled, has too few samples, or belongs to a disabled role is `null`, not `0`. History is kept for `[metrics] retention_days` (example config: 14).

### Authority and step-up

- Every admin route checks `accounts.admin` on each request. Guild `ADMINISTRATOR` grants nothing here.
- Destructive or authority-changing routes return `403` with `"error": "step_up_required"` until you call `POST /admin/step-up` (password or OPAQUE reauth). That opens a 5-minute window; `GET` shows it and `DELETE` ends it. Step-up uses the strict login rate bucket.
- Every mutating admin call, and every refusal, is appended to `server_audit_log` (`GET /admin/audit`, filters `before`, `action`, `actor`). This is separate from the guild audit log.

See [Server ownership](/docs/self-hosting/server-ownership/) and [Observability](/docs/self-hosting/observability/).

## Friends and presence

```text
GET|POST    /friends
DELETE      /friends/{user_id}
POST        /friends/{user_id}/accept
PUT|DELETE  /friends/{user_id}/block
GET         /friends/mutual/{user_id}
```

Signed server-to-server routes `friends/relay`, `friends/presence` and `friends/mutual-check` relay friendship and presence facts. See [Friends](/docs/features/friends/).

## Direct messages and vaults

```text
GET|POST       /conversations
GET            /conversations/{id}
GET|POST       /conversations/{id}/messages
POST           /conversations/{id}/request/accept
POST           /conversations/{id}/request/decline
POST|DELETE    /conversations/{id}/members
DELETE         /conversations/{id}/policy
GET            /conversations/{id}/notification-keys
POST           /conversations/{id}/notification-hints
PUT            /conversations/{id}/notifications
POST           /conversations/{id}/leave
POST           /conversations/{id}/reanchor
POST           /conversations/{id}/promote
GET|POST       /keypackages
DELETE         /keypackages/last-resort
POST           /users/{user_id}/keypackages/claim
POST           /verify
GET|PUT        /vault
POST           /vault/mode
GET|PUT|DELETE /vault/backup
```

The server treats MLS application content as opaque. Server-to-server delivery uses the `dm/*` routes in [Federation](/docs/reference/protocol/federation/#signed-routes). See [DM encryption](/docs/security/dm-encryption/).

## Voice, video and screenshare

Guild voice:

```text
GET          /voice/regions
GET|POST     /guilds/{guild_id}/voice/regions
PATCH        /guilds/{guild_id}/voice/regions/default
DELETE       /guilds/{guild_id}/voice/regions/{name}
GET          /channels/{id}/voice
POST         /channels/{id}/voice/join | leave | state | token | stream | watch | signal
GET|POST     /channels/{id}/voice/e2ee
GET          /channels/{id}/voice/e2ee/commits
POST         /channels/{id}/voice/e2ee/refuse
POST         /guilds/{guild_id}/voice/{user_id}
```

DM calls:

```text
GET  /conversations/{id}/voice
POST /conversations/{id}/voice/join | leave | state | signal | server
```

See [Voice and video](/docs/features/voice-and-video/) and [DM calls](/docs/features/dm-calls/).

## Media

Account media choice. These identity-role routes exist even when the media role is off:

```text
GET|PUT /media/preference
GET     /media/registry
GET     /media/registry/feed
GET     /media/registry/feeds
GET     /media/curators
```

- `/media/registry` publishes curated media origins, external hosts and `gofile_playback_proxy`, plus the URL and curator key of this server's signed origin feed. `/media/registry/feed` serves that feed.
- `/media/registry/feeds` needs a session: it returns the external hosts vouched for by feeds that this account's guilds subscribe to.
- `/media/curators` is this server's signed curator directory.

Telium-hosted media:

```text
POST       /media                         (media role)
GET|DELETE /media/{hash}                  (media role)
GET        /media/{hash}/meta             (media role)
POST       /media/vouchers
POST       /media/voucher-upload
GET        /media/remote/{origin}/{hash}
GET        /embed
GET        /camo/{hash}
```

External hosts (Gofile adapter):

```text
POST /media/external/{host_id}            # compatibility upload relay; the client uploads to Gofile directly
POST /media/external/{host_id}/resolve
POST /media/external/gofile/session
POST /media/external/gofile/playback      # only when gofile_playback_proxy is enabled
GET  /media/external/gofile/play          # only when gofile_playback_proxy is enabled
```

See [Media](/docs/features/media/).

## Migration, relocation, sunset and failover

```text
GET|POST /migrate
POST     /migrate/grant-payload
POST     /migrate/accept
POST     /migrate/handoff
GET      /migrate/handoff/{id}
POST     /migrate/{id}/execute | cancel | retry
GET|POST /memberships
GET      /migrate/memberships
POST     /migrate/memberships/retry
GET      /migrate/alerts
GET|POST /migrate/cancel-link
GET      /relocation                           (POST is the signed server-to-server leg)
GET      /relocation/{old}/discovery
GET      /sunset
POST     /admin/sunset
POST     /admin/sunset/execute
POST     /admin/sunset/finalize
POST     /admin/failover
POST     /admin/failover/{subject_type}/{subject_id}/promote
POST     /admin/standby/{origin}/promote
GET      /failover/status/{origin}
```

Warm-standby replication reads (`failover/head`, `log`, `snapshot`, `media/{hash}`) require a signed standby request. `GET /failover/status/{origin}` is unauthenticated so a client can find a promoted authority when it has no working session against the failed primary. Promotion is an authenticated admin action.

This area is continuity-sensitive. Build against `routes/mod.rs` and the procedure pages: [Migration](/docs/federation/migration/), [Relocation](/docs/self-hosting/relocation/), [Sunset](/docs/self-hosting/sunset/), [Warm standby](/docs/self-hosting/warm-standby/).

## Gateway

Guild realtime traffic uses a WebSocket at `GET /gateway/v1`, mounted on the guild role.

```text
HELLO    { d: { heartbeat_interval_ms, gateway_version, protocol } }
  -> IDENTIFY { d: { token, intents, presence, protocol } }
  -> READY    { d: { session_id, user, server_name, protocol, intents, guilds } }
  -> DISPATCH ...
```

A client may hold gateway connections to several servers at once. A reconnect or degraded state belongs to that one connection, not the whole account. The full contract, opcodes, intents and close codes are in [Gateway](/docs/reference/protocol/gateway/).

## Errors

Handlers return structured JSON errors (`error`, `code`, `message`); the full table is in [Federation errors](/docs/reference/protocol/federation/#errors). Branch on `code`, never on the English `message`. Some statuses hide information: a channel you cannot view returns not found rather than confirming it exists.
