---
title: Configuration
description: The telium.toml settings and server commands that matter most when you operate a Telium homeserver.
sidebar:
  order: 2
---

This page covers the parts of `telium.toml` and the `telium-server` command line that change how your server behaves for users and peers. Every key has a compiled-in default. The fully annotated list is [`server/telium.example.toml`](https://github.com/telium-chat/telium/blob/main/server/telium.example.toml), and `telium-server init` writes it for you.

The server reads `telium.toml` once at startup. Nothing writes it at runtime, including the admin console, so a change means editing the file and restarting.

## Commands

All commands take `--config <path>` (default `telium.toml`).

| Command | Does |
|---|---|
| `serve` | Run the server (the default). |
| `init` | Write a starter config. |
| `check [--strict]` | Audit the config; see [Running in production](/self-hosting/production/#audit-the-config-telium-server-check). |
| `version` | Print the build as `key=value` lines. |
| `backup`, `restore` | See [Backups](/self-hosting/backups/). |
| `keys`, `mfa`, `rotations` | See [Secrets](/self-hosting/secrets/). |
| `admin list`, `admin recover <account> --reason "…"`, `admin claims`, `admin cancel <id>` | Server administrators. Read [Server ownership](/self-hosting/server-ownership/) before `recover`. |
| `standby status`, `pair <domain>`, `sync`, `promote <origin>` | See [Warm standby](/self-hosting/warm-standby/). |
| `updates check` | Read the release manifest; used by the native updater. See [Updates](/self-hosting/updates/). |

The `admin` and `standby` commands work on the database directly, so they still work when nobody can sign in.

## Identity

| Key | Default | Notes |
|---|---|---|
| `server_name` | `localhost` | The domain in user ids. Permanent once accounts exist. |
| `public_base_url` | `http://localhost:8448` | Where clients and peers reach you. Published at `/.well-known/telium/server`. |
| `bind` | `127.0.0.1:8448` | Listener. Keep it on loopback behind a proxy. |
| `database_url` | `sqlite://telium.db?mode=rwc` | |
| `media_dir` | `media` | |
| `profile` | `auto` | `auto`, `production` or `development`. Only changes how loud `check` is. |

Federation signatures bind to `server_name`. `public_base_url` can point somewhere else, such as a different hostname behind a proxy.

## Roles

One binary runs three roles. A disabled role mounts none of its routes.

```toml
[roles]
identity = true   # accounts and sign-in
guild = true      # guilds, channels, voice authorisation
media = true      # file hosting
relay = false     # forward "Protect my IP" users' guild traffic; needs identity
```

Relay budgets live in `[relay]`. See [Network privacy](/security/network-privacy/).

## Capabilities

Clients learn what your server offers from `GET /_telium/v1/capabilities`: enabled features, media and upload-scanning policy, the GIF provider, call modes and the abuse contact. Some settings are published on their own endpoints instead:

| Setting | Published at |
|---|---|
| External media hosts, curators | `GET /_telium/v1/media/registry` |
| Voice regions | the voice-region endpoints |
| Managed guild-hosting providers | `GET /_telium/v1/hosting/providers` |

## Registration and administrators

```toml
[registration]
open = true
min_password_len = 8
admins = []        # localparts granted admin on registration
```

With `admins` empty, the first account registered becomes the administrator. Close registration once your account exists. `[registration.recommendations]` controls onboarding referrals; see [Onboarding](/federation/onboarding/).

An administrator gets a **Control plane** entry in user settings with panes for overview, statistics, storage, settings, accounts, guilds, moderation, federation, continuity and the audit log. Every endpoint behind it checks admin status per request against the accounts table. Destructive actions ask for your password again, and every admin action or refusal is written to the server audit log. The console shows aggregates only: no per-account traffic and no message content.

## Trusted proxies and rate limits

The server attributes a request to its TCP peer and ignores `X-Forwarded-For` unless that peer is listed:

```toml
[rate_limit]
enabled = true
trusted_proxies = ["127.0.0.1"]
```

List only proxies you control. A trusted address can claim any client IP.

- Buckets are keyed by bearer-token hash, bot app id, federation origin, or client IP for anonymous requests. At most 20,000 are held.
- Sign-in and registration use a tighter bucket (`auth_burst`, `auth_per_sec`). Federation traffic has its own (`federation_burst`, `federation_per_sec`), as does search.
- Friend requests, conversation creation, remote media fetches and key refresh for unknown origins have separate, tighter budgets.
- Rejections are counted in `telium_ratelimit_rejections_by_kind_total`.

Per-socket gateway limits are in `[gateway]`: `outbox_depth` (close `4010` when a slow client falls behind), `max_connections_per_account` (close `4011`), `max_pending_sockets` (close `4013`), and frame and typing rates.

## One process per database

At startup the server claims an `instance_lease` row and heartbeats it every 30 seconds. A second process on the same database refuses to start. The lease can be taken over when its holder has the same PID and host, when that PID is dead, or after 2 minutes without a heartbeat.

`TELIUM_INSTANCE_LOCK=off` skips the check. Use it only to clear a lease held by a machine that no longer exists. The rate limiter is in-process, so it relies on this rule too.

A process handles roughly 16,000 gateway events per second of fanout. See [Scaling](/self-hosting/scaling/).

## Media

```toml
[media_policy]
default = "enabled"            # enabled | quota | disabled
quota_bytes = 1073741824
max_file_bytes = 104857600
profile_asset_carveout_bytes = 524288
```

`disabled` still allows small avatars and banners. External media hosts and curators are configured in `[media_registry]`. Uploaded media can live in an S3-compatible bucket with `[media_store] store = "s3"` and `[media_store.s3]`. See [Media](/features/media/).

### Upload scanning

Every upload passes a hash check before storage. Add digests inline or point at list files:

```toml
[moderation]
upload_hash_blocklist = []    # BLAKE3 hex digests
abuse_contact = "abuse@chat.example.com"

[[moderation.upload_hash_lists]]
name = "example-list"
algorithm = "sha256"          # blake3 | sha256 | sha1
path = "/var/lib/telium/example-list.txt"
```

A configured list that cannot be read fails startup. A match is refused and filed in the report queue under the list's name, which the uploader does not see.

## Reports, defederation and blocklists

Server-operator controls are separate from guild moderator permissions. They are in the control plane and on these endpoints (paths relative to `/_telium/v1`):

| Endpoint | Purpose |
|---|---|
| `GET /admin/reports`, `PATCH /admin/reports/{id}` | Report queue and resolution. Reports are kept `moderation.report_retention_days` (365). |
| `GET`/`POST /admin/defederation`, `DELETE /admin/defederation/{domain}` | Block federation with a domain, or lift the block. |
| `GET`/`POST`/`DELETE /admin/blocklist-feeds`, `POST /admin/blocklist-feeds/refresh` | Signed blocklist feeds. Also `moderation.blocklist_feeds` in the config. |
| `GET /admin/peers/{origin}`, `POST /admin/revalidate` | Peer status and key revalidation. |
| `POST /admin/archive`, `POST /admin/storage/sweep` | Archive maintenance and storage reclamation. |

Treat a blocklist feed as privileged input: a compromised feed can cut you off from a large part of the network. Refederating reopens communication but does not replay anything that was blocked in the meantime.

## Voice

```toml
[voice]
enabled = true
default_region = "local"
stun_servers = ["stun:stun.l.google.com:19302"]
mesh_max_participants = 4
turn = "turn.example.com:3478"
turn_secret = "${file:/run/secrets/turn}"

[[voice.regions]]
name = "local"
sfu = "https://sfu.example.com"
```

Without a region that has an `sfu` URL, calls use peer-to-peer mesh up to `mesh_max_participants`. TURN needs both `turn` and `turn_secret`, and setting only one does nothing. See [SFU](/self-hosting/sfu/).

## Other sections

| Section | Covers | Page |
|---|---|---|
| `[web]` | `dir` for a built client, `client_url` | [Running in production](/self-hosting/production/#web-client) |
| `[backup]`, `[backup.remote]` | archives | [Backups](/self-hosting/backups/) |
| `[archive]`, `[archive.s3]` | cold history segments (off by default) | [Data lifecycle](/self-hosting/data-lifecycle/) |
| `[retention]`, `[integrity]` | housekeeping, startup DB checks | [Data lifecycle](/self-hosting/data-lifecycle/) |
| `[metrics]` | console metrics, `/metrics` scrape | [Observability](/self-hosting/observability/) |
| `[updates]`, `[usage]` | version check, deployment count | [Updates](/self-hosting/updates/) |
| `[failover]` | warm standby | [Warm standby](/self-hosting/warm-standby/) |
| `[hosting]` | guild-hosting directory | [Managed hosting](/self-hosting/managed-hosting/) |
| `[sessions]`, `[mfa]`, `[ownership]` | session lifetimes, MFA key, admin recovery delay | [Secrets](/self-hosting/secrets/), [Server ownership](/self-hosting/server-ownership/) |
| `[push]`, `[mail]` | FCM/APNs credentials, outbound mail webhook | [Notifications](/features/notifications/) |
| `[klipy]` | GIF search; the key is public by design | |
| `[shutdown]` | `grace_secs`, `settle_ms` | [Running in production](/self-hosting/production/#stopping) |

## Health

`GET /_telium/v1/health` answers whether the HTTP server is up, and nothing about the SFU, peers, backups or standbys. Admin endpoints give more: `/admin/status` (backups, protocol window, peers), `/admin/health` (warnings with a cause and next step), and `/admin/version`. Log targets and Prometheus are in [Observability](/self-hosting/observability/).
