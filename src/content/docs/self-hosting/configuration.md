---
title: Configuration
description: Every telium.toml setting and what it does, plus the server commands around it.
sidebar:
  order: 6
---

This page lists every `telium.toml` key, one at a time. A key you leave out takes its compiled-in default, shown in each table below. The same list in annotated-file form is [`server/telium.example.toml`](https://github.com/telium-chat/telium/blob/main/server/telium.example.toml), and `telium-server init` writes it for you.

The server reads `telium.toml` once at startup. Nothing writes it at runtime, including the admin console, so a change means editing the file and restarting.

## Writing sizes, durations and rates

Every key that takes a size, duration or bitrate accepts two forms. A plain integer keeps the unit its name spells out: `*_bytes` bytes, `*_secs` seconds, `*_ms` milliseconds, `*_days` days, `voice.max_bitrate` bits per second. A quoted string says the unit out loud:

```toml
max_file_bytes = "100MiB"
quota_bytes = "1GiB"
interval_secs = "6h"
stale_after_secs = "2d 12h"
settle_ms = "250ms"
report_retention_days = "365d"
max_bitrate = "2.5Mbps"
```

`MB` (a million bytes) and `MiB` (1,048,576 bytes) are different units, both accepted case-insensitively. Durations compound: `"1d 12h"`, `"1h30m"`. A nonsense value is refused at startup with an example of the right shape. After editing, run [`check`](#checking-a-config).

## Commands

All commands take `--config <path>` (default `telium.toml`).

| Command | Does |
|---|---|
| `serve` | Run the server (the default). |
| `init` | Write the annotated starter config. |
| `check [--strict]` | Audit the config; see [Checking a config](#checking-a-config). |
| `version` | Print the build as `key=value` lines. |
| `backup`, `restore` | See [Backups](/self-hosting/backups/). |
| `keys`, `mfa`, `rotations` | See [Secrets](/self-hosting/secrets/). |
| `admin list`, `admin recover <account> --reason "…"`, `admin claims`, `admin cancel <id>` | Server administrators. Read [Server ownership](/self-hosting/server-ownership/) before `recover`. |
| `standby status`, `pair <domain>`, `sync`, `promote <origin>` | See [Warm standby](/self-hosting/warm-standby/). |
| `updates check` | Read the release manifest; used by the native updater. See [Updates](/self-hosting/updates/). |

The `admin` and `standby` commands work on the database directly, so they still work when nobody can sign in.

## Checking a config

```sh
telium-server --config /etc/telium/telium.toml check [--strict]
```

`check` parses and audits the config without opening the database, binding a port or writing anything, so it is safe beside a running server. It exits `1` on any danger finding, and with `--strict` on warnings too. `serve` runs the same audit at startup and only logs it.

The `profile` key (`auto`, `production`, `development`) sets how loud the audit is and changes no behaviour. `auto` infers the profile from `public_base_url`. Several findings below apply only in the production profile.

| Level | Finding |
|---|---|
| Danger | `server_name` is `localhost` or has no dot |
| Danger | `public_base_url` is unparseable, loopback, or `http://` |
| Danger | `bind` is a wildcard and `public_base_url` is not `https` |
| Danger | `federation.allow_http = true` |
| Danger | `registration.open` with no `registration.admins` |
| Danger | `rate_limit.enabled = false` |
| Danger | `backup.dir` is inside the database directory or `media_dir` |
| Danger | the process runs as uid 0 |
| Danger | the backup key file, or a config holding literal secrets, is readable by others |
| Warning | wildcard bind behind an https proxy with no `rate_limit.trusted_proxies` |
| Warning | `registration.min_password_len` below 8 with open registration |
| Warning | `backup.enabled` or `backup.remote.enabled` is off |
| Warning | no web client (`web.dir` or `web.client_url`) |
| Notice | `updates.check = false`, literal secrets in the file, leftover rotation keys |

Startup also refuses group- or world-writable config, database and key files, and refuses any value still equal to an example placeholder such as `change-me`.

## The server itself

| Key | Default | Does |
|---|---|---|
| `server_name` | `localhost` | The domain in user ids (`@you:example.org`). An identity, not a hostname; permanent once accounts exist. |
| `public_base_url` | `http://localhost:8448` | Where clients and peers reach you. Published at `/.well-known/telium/server`. |
| `bind` | `127.0.0.1:8448` | Local address and port to listen on. Keep it on loopback behind a proxy. |
| `database_url` | `sqlite://telium.db?mode=rwc` | Where the database lives. |
| `media_dir` | `media` | Where uploaded media is stored. |
| `profile` | `auto` | `auto`, `production` or `development`. Only changes how loud `check` is. |

Any string value may be `"${env:NAME}"` or `"${file:/path}"` (whole value only); an unresolvable reference is fatal. See [Secrets](/self-hosting/secrets/).

## Roles

One binary runs three roles. A disabled role mounts none of its routes.

| Key | Default | Does |
|---|---|---|
| `roles.identity` | `true` | Accounts and sign-in. |
| `roles.guild` | `true` | Guilds, channels, voice authorisation. |
| `roles.media` | `true` | File hosting. |
| `roles.relay` | `false` | Forward "Protect my IP" users' guild traffic; needs `identity`. Costs bandwidth. See [Network privacy](/security/network-privacy/). |

## Capabilities

Clients learn what your server offers from `GET /_telium/v1/capabilities`: enabled features, media and upload-scanning policy, the GIF provider, call modes and the abuse contact. Some settings are published on their own endpoints instead:

| Setting | Published at |
|---|---|
| External media hosts, curators | `GET /_telium/v1/media/registry` |
| Voice regions | the voice-region endpoints |
| Managed guild-hosting providers | `GET /_telium/v1/hosting/providers` |

## Relay

Ignored unless `roles.relay = true`. A relay carries guild traffic for this server's own accounts as encrypted TCP tunnels.

| Key | Default | Does |
|---|---|---|
| `max_concurrent_per_account` | `4` | Tunnels one account may hold open at once. |
| `max_concurrent_total` | `256` | Tunnels the whole server may hold open. |
| `max_tunnel_bytes` | `256MiB` | Traffic allowed per tunnel, both directions added. |
| `daily_bytes_per_account` | `4GiB` | Traffic allowed per account in a rolling 24 hours. |
| `idle_timeout_secs` | `2m` | Close a tunnel idle this long. |
| `max_lifetime_secs` | `6h` | Close a tunnel at this age however busy it is. |
| `destinations_per_hour` | `40` | Distinct destination servers one account may use per hour. |
| `opens_burst`, `opens_per_minute` | `20`, `30` | Tunnel-open attempts per account: burst, then steady rate. |
| `ports` | `[443]` | Destination ports a tunnel may target. |
| `allow` | `[]` | Server names to carry traffic for. Empty means any with a valid discovery document. |
| `deny` | `[]` | Server names refused regardless of `allow`. Checked first. |
| `discovery_cache_secs` | `10m` | How long a peer's discovery document (and a failed lookup) is remembered. |
| `log_destinations` | `false` | Log account and destination per tunnel. Off to avoid mapping who talks to whom. |

## Media policy

| Key | Default | Does |
|---|---|---|
| `default` | `"enabled"` | `enabled` (uploads free), `quota` (a per-user allowance) or `disabled`. |
| `quota_bytes` | `1GiB` | The allowance. Only enforced when `default = "quota"`, and for `allowlist` users. |
| `allowlist` | `[]` | User ids that always get tier-1 upload. |
| `blocklist` | `[]` | User ids that never do. |
| `profile_asset_carveout_bytes` | `512KiB` | Avatars and banners stay allowed up to this size even on a media-disabled server. |
| `max_file_bytes` | `100MiB` | Largest single upload accepted. |
| `max_profile_asset_bytes` | `256KiB` | Largest avatar or banner. |
| `max_expiry_secs` | `0` | Longest lifetime a client may request for an upload. Zero caps nothing. |
| `default_expiry_secs` | `0` | Lifetime applied when the client asks for none. Zero keeps such uploads until something reclaims them. |
| `attachment_max_age_days` | `0` | Sweep attachments older than this even when a message still refers to them. Destructive by design; zero never ages anything out. |

With `default = "enabled"`, uploads are unlimited and the client shows no usage line — startup says so. A guild or channel may narrow what it accepts with its own `media_max_file_bytes` (set through the guild or channel settings); an attachment takes the narrowest cap on its path, and `max_file_bytes` always applies underneath. See [Media](/features/media/) and [Data lifecycle](/self-hosting/data-lifecycle/).

Uploaded media can live in an S3-compatible bucket instead of `media_dir`: see [Media store](#media-store).

## Media registry

The curated origins this server offers users who upload elsewhere.

| Key | Default | Does |
|---|---|---|
| `gofile_playback_proxy` | `true` | Stream Gofile files through this server for browser playback (browsers cannot attach Gofile's cookie themselves). Off keeps external bytes off your bandwidth. |
| `feed_refresh_secs` | `1h` | How often a verified origin feed is fetched again. |
| `feed_retry_secs` | `10m` | How soon a failed feed fetch is retried. |
| `feed_timeout_secs` | `10s` | How long one feed fetch may take. |
| `feed_validity_secs` | `7d` | How long the signed feed published from your own `hosts` counts as vouched. |

`[[media_registry.hosts]]` — tier-2 origins recommended to your users:

| Field | Does |
|---|---|
| `origin` | The host's domain. |
| `name` | Display name. |
| `description` | One line shown to users. |
| `max_file_bytes` | Largest upload the host takes. Accepts `"2GiB"` form. |
| `abuse_contact` | Where to report content on that host. |

`[[media_registry.external_hosts]]` — tier-3 upload add-ons (client-direct providers such as Gofile). Fields: `id`, `provider`, `name`, `domain`, `upload_url`, `description`, `max_file_bytes`, `browser_direct`. Public configuration only — never provider account tokens.

`[[media_registry.curators]]` — curator directories you publish (signed with your key): fields `name`, `feed_url`, `key` (the curator's base64 Ed25519 public key), `description`, `contact`. Listing says "we know of these", not "these are approved"; pinning stays a guild moderator's act.

`[[media_registry.curator_directories]]` — directories you read for your moderators: fields `url`, `key` (required — an unsigned directory is never fetched), `label`.

`[media_registry.watch_together]` — `enabled` (default `true`) and `providers` (default all of the client's built-ins) narrow the video services a call may embed. Watching connects participants to the video service directly, with a per-session consent screen.

## Media store

| Key | Default | Does |
|---|---|---|
| `store` | `"local"` | `"local"` writes uploads under `media_dir`; `"s3"` writes them to the bucket in `[media_store.s3]` (same shape as [backup.remote](#backup)). |

## Hosting

The managed guild-hosting directory offered in the client's "create a guild" flow. See [Managed hosting](/self-hosting/managed-hosting/).

| Key | Default | Does |
|---|---|---|
| `enabled` | `true` | Whether managed hosting is offered at all. |
| `catalog_refresh_secs` | `6h` | How often a subscribed catalogue is refetched. |
| `catalog_retry_secs` | `15m` | How soon a failed catalogue fetch is retried. |
| `catalog_timeout_secs` | `10s` | How long one fetch may take. |
| `catalog_validity_secs` | `7d` | How long the catalogue published from your own `providers` counts as valid. |

`[[hosting.catalogs]]` — signed catalogues you subscribe to: `url`, `key` (the publisher's Ed25519 key; the only key the document is checked against), `label`.

`[[hosting.providers]]` — providers you curate and publish as your own signed catalogue: `id`, `name`, `base_url`, `signup_url`, `terms_url`, `privacy_url`, `contact`, `description`, `regions`, `public_key` (the provider's server key), `plans`.

`[[hosting.providers.plans]]` — `id`, `name`, `price_minor` (minor units of `currency`), `currency`, `period` (`free | monthly | yearly | metered`), `member_cap`, `storage_bytes`, `media_quota_bytes`, `notes`. An omitted limit means "the provider did not state one"; sizes accept the `"20GiB"` form.

## Moderation

| Key | Default | Does |
|---|---|---|
| `upload_hash_blocklist` | `[]` | Inline BLAKE3 digests refused on upload. Large lists belong in `upload_hash_lists`. |
| `upload_hash_lists` | `[]` | Files of hex digests, one per line: `name`, `algorithm` (`blake3 | sha256 | sha1`), `path`. A list that cannot be read fails startup. |
| `abuse_contact` | unset | Contact address published in the capabilities document. Set it if you host strangers' content. |
| `blocklist_feeds` | `[]` | URLs of signed blocklist feeds to fetch and honour. Treat as privileged input. |
| `report_retention_days` | `365d` | How long a report stays in the queue. |

A hash match is refused and filed in the report queue under the list's name. See [Reports and defederation](#reports-defederation-and-blocklists).

## Sessions

| Key | Default | Does |
|---|---|---|
| `home_session_ttl_secs` | `30d` | How long a sign-in on the home server lasts. |
| `assertion_ttl_secs` | `5m` | How long an identity assertion may be exchanged for a guild session. Deliberately short. |
| `guild_session_ttl_secs` | `1h` | How long a guild session lives. This is the window in which a home-server sign-out takes effect. |
| `revalidate_interval_secs` | `10m` | How soon a guild session must be renewed with a fresh assertion. |
| `signing_key_validity_secs` | `90d` | How long your identity-signing key is published as valid. |

## MFA

| Key | Default | Does |
|---|---|---|
| `key_file` | `mfa.key` | AES-256 key sealing TOTP secrets. Keep it out of `media_dir` and `backup.dir`; losing it means `telium-server mfa reset-all`. |
| `previous_key_files` | `[]` | Retired keys still able to open old rows, until `telium-server mfa rekey`. |

## Ownership

| Key | Default | Does |
|---|---|---|
| `recovery_delay_secs` | `1d` | Wait before an `admin recover` claim applies, during which another admin can cancel it. `0` allowed. See [Server ownership](/self-hosting/server-ownership/). |

## Registration

| Key | Default | Does |
|---|---|---|
| `open` | `true` | Whether anybody may create an account. Close it once your account exists. |
| `min_password_len` | `8` | Shortest password accepted. |
| `admins` | `[]` | Account localparts granted admin on registration. Empty means the first account becomes the administrator. |
| `recommendations.accepting` | `false` | Offer this server to beginners looking for an account home. Also needs an opt-in in telium.chat's public registry. See [Onboarding](/federation/onboarding/). |
| `recommendations.referral_weight` | `1` | Relative admission preference among accepting servers (catalogue clamps to 1–3). |
| `recommendations.suggest_alternatives` | `false` | Your signup form offers a community recommendation instead of creating the account here. |

An administrator gets a **Control plane** entry in user settings with panes for overview, statistics, storage, settings, accounts, guilds, moderation, federation, continuity and the audit log. Every endpoint behind it checks admin status per request against the accounts table. Destructive actions ask for your password again, and every admin action or refusal is written to the server audit log. The console shows aggregates only: no per-account traffic and no message content.

## Backup

A scheduled, encrypted backup that runs without being thought about. See [Backups](/self-hosting/backups/).

| Key | Default | Does |
|---|---|---|
| `enabled` | `true` | Whether backups run. Turning this off draws a startup warning. |
| `dir` | `backups` | Where archives go. Put it where the data is not — startup and the admin screen grade the placement. |
| `interval_secs` | `6h` | Backup cadence. The first run happens at startup unless a fresh archive exists. |
| `keep` | `8` | Archives kept on this disk. |
| `stale_after_secs` | `2d` | Warn once the newest archive (or off-box upload) is older than this. |
| `include_media` | `true` | Put `media_dir` in the archive. `cache/` and `camo/` never go. |
| `key_file` | `backup.key` | AES-256 key sealing archives. `TELIUM_BACKUP_KEY` overrides. Copy it off the machine — archives without the key are unreadable. |
| `previous_key_files` | `[]` | Old keys that still open older archives. Never used to seal. |
| `drill` | `true` | Periodically fetch, decrypt and open the newest archive as a rehearsal. |
| `drill_interval_secs` | `1d` | Drill cadence; each drill is a full download. |
| `drill_stale_after_secs` | `3d` | Warn when the last passing drill is older than this. |
| `pre_migration_backup` | `true` | Back up right before applying schema migrations. |
| `require_backup_before_migration` | `false` | Refuse to migrate with no restorable archive. |

### S3 settings

`[backup.remote]`, `[archive.s3]` and `[media_store.s3]` share this shape:

| Key | Default | Does |
|---|---|---|
| `enabled` | `false` | Whether this bucket is used. |
| `endpoint` | `https://s3.amazonaws.com` | Works with AWS, Cloudflare R2, Backblaze B2, MinIO — anything speaking the S3 API with Signature Version 4. |
| `bucket` | empty | The bucket name. |
| `region` | `us-east-1` | Part of the request signature. `"auto"` for R2. |
| `prefix` | empty | Key prefix inside the bucket. Empty means `telium/<server_name>/`. |
| `access_key_id`, `secret_access_key` | empty | Credentials. `TELIUM_S3_ACCESS_KEY_ID` / `TELIUM_S3_SECRET_ACCESS_KEY` in the environment win. |
| `path_style` | `true` | `https://endpoint/bucket/key` addressing. Works everywhere, MinIO included. |
| `keep` | `8` | Archives kept in the bucket. |
| `timeout_secs` | `60s` | Per-request timeout for small requests; transfers scale with size. |

## Archive

Cold history, off by default. See [Data lifecycle](/self-hosting/data-lifecycle/).

| Key | Default | Does |
|---|---|---|
| `enabled` | `false` | Whether message archiving runs at all. |
| `store` | `"local"` | `"local"` writes segments to `dir` on disk; `"s3"` to the bucket in `[archive.s3]`. |
| `dir` | `cold` | Segment directory (or key prefix for S3). |
| `horizon_days` | `365d` | How old a message must be before it may be moved. |
| `keep_hot_messages` | `10000` | The newest messages of a channel are never archived, however old. |
| `batch` | `5000` | Messages moved per sweep. |
| `sweep_interval_secs` | `1h` | How often the sweeper looks for candidates. |

## Federation

| Key | Default | Does |
|---|---|---|
| `enabled` | `true` | Whether this server speaks to other servers at all. |
| `allow_http` | `false` | Allow plain HTTP to peers. Test rigs and LANs only — `check` calls it a danger finding. |
| `peers` | `{}` | Fixed addresses for named peers, when discovery is not enough: `peers = { "peer.example" = "https://peer.internal:8448" }`. |
| `request_timeout_secs` | `15s` | How long an ordinary call to another server may take. Migration pushes carry their own, longer allowance. |
| `key_cache_secs` | `1d` | How long a peer's signing key is trusted without asking again. |
| `max_clock_skew_secs` | `5m` | How far another server's clock may drift before signatures are doubted. |
| `media_cache_ttl_secs` | `1d` | How long fetched peer media is served from the local cache. |
| `media_cache_max_bytes` | `2GiB` | Disk the peer-media cache may use. |
| `embed_enabled` | `true` | Whether link previews are fetched at all. |
| `embed_max_bytes` | `8MiB` | Largest page fetched for a preview. |
| `embed_video_max_bytes` | `32MiB` | Cap on a proxied video unfurl; over it, the card falls back to its still image. |
| `embed_timeout_secs` | `8s` | How long one unfurl fetch may take. |
| `embed_cache_secs` | `1d` | How long a preview is kept before being fetched again. |
| `migration_delay_secs` | `1d` | Cooling-off before a scheduled account or guild move executes, during which any logged-in device can cancel it. |
| `revalidate_interval_secs` | `10m` | How often peers are re-checked against their discovery documents. |
| `dm_retry_secs` | `30s` | Base delay for the exponential retry of queued traffic a peer could not receive (direct messages, friend requests). |

## Limits

| Key | Default | Does |
|---|---|---|
| `max_message_len` | `4000` | Longest chat message, in characters. |
| `max_guilds_per_user` | `200` | Guilds one account may belong to. |
| `max_emoji_per_guild` | `250` | Custom emoji per guild. |
| `max_stickers_per_guild` | `60` | Custom stickers per guild. |
| `max_sync_store_bytes` | `1MiB` | Server-side sync payload one account may store. |
| `max_attachments_per_message` | `10` | Files attached to one message. |
| `max_message_requests` | `100` | Pending stranger DM requests per account; overflow is silently declined. |
| `presence_coalesce_secs` | `30s` | Presence updates are batched to this granularity — the fanout bomb. |
| `emoji_max_dimension` | `128` | Emoji are scaled down to fit this square, never up. |
| `sticker_max_dimension` | `320` | The same for stickers. |
| `expression_max_source_pixels` | `16777216` | Most pixels one source frame may declare (4096×4096); refused before decoding. |
| `expression_max_total_pixels` | `268435456` | Most source pixels an animation may have across all frames. |
| `expression_max_frames` | `250` | Most frames one animation may have. |
| `expression_max_duration_ms` | `30s` | Longest animation accepted. |
| `expression_drop_excess_frames` | `true` | Past a cap: keep what fits and drop the rest (`true`), or refuse the upload (`false`). |
| `max_request_bytes` | `2MiB` | Largest request body on routes without their own ceiling. |
| `request_body_timeout_secs` | `30s` | Stall allowed between body chunks before the request is abandoned (slowloris). |

## Voice

| Key | Default | Does |
|---|---|---|
| `enabled` | `true` | Whether calls are offered at all. |
| `default_region` | `local` | Which `[[voice.regions]]` entry clients use first. Only meaningful once regions exist. |
| `stun_servers` | `["stun:stun.l.google.com:19302"]` | Addresses clients use to learn their own public address. Empty it when everyone is on one network. |
| `token_ttl_secs` | `10m` | How long a call-join token lives; the client renews it mid-call. |
| `max_bitrate` | `2.5Mbps` | Bitrate ceiling handed to clients; the streamer spends the budget. |
| `max_streamers_per_channel` | `4` | People who may screenshare in one channel at once. |
| `mesh_max_participants` | `4` | Peer-to-peer calls are used when no SFU is configured; beyond this a channel needs one. |
| `reconnect_grace_secs` | `15s` | How long a call survives its gateway socket dropping. |
| `turn` | unset | Your own TURN relay (`host:port`) for relay-only calls. Needs `turn_secret`; both or nothing. |
| `turn_secret` | unset | Shared secret matching coturn's `static-auth-secret`. `TELIUM_TURN_SECRET` overrides. |
| `turn_ttl_secs` | `1h` | How long the minted TURN credentials live. |

`[[voice.regions]]` — `name`, `sfu` (base URL of a telium-sfu; empty means mesh), optional `turn` and `pubkey_hint`. Without a region with an `sfu` URL, calls are peer-to-peer mesh up to `mesh_max_participants`. A TURN relay must be reachable on UDP from the public internet — an HTTP-only ingress cannot carry it. See [SFU](/self-hosting/sfu/).

## Push

Direct provider credentials; empty by default. Web Push and UnifiedPush need nothing here. See [Notifications](/features/notifications/).

| Key | Default | Does |
|---|---|---|
| `push.fcm.enabled` | `false` | Whether Android devices may be woken through Firebase. |
| `push.fcm.project_id` | empty | Must match the service-account JSON. |
| `push.fcm.service_account_file` | unset | Path to the service-account JSON; never logged or backed up. |
| `push.fcm.base_url`, `push.fcm.token_url` | unset | Test/staging overrides; https only. |
| `push.apns.enabled` | `false` | Whether iOS devices may be woken through Apple. |
| `push.apns.team_id`, `push.apns.key_id`, `push.apns.bundle_id` | empty | From Apple's developer account. |
| `push.apns.key_file` | unset | Path to the `.p8` key. |
| `push.apns.environment` | `production` | `"production"` or `"sandbox"`. |
| `push.apns.base_url` | unset | Test/staging override; wins over `environment`. |

## Web client

Running a web client is optional — [telium.chat](https://telium.chat) works with every server, as do the packaged clients.

| Key | Default | Does |
|---|---|---|
| `dir` | unset | Serve a built client (`bun run build` output) from this process, relative to the working directory. Mounts after the API and discovery routes. |
| `client_url` | unset | Where your web client lives if not `public_base_url`; published as `client` in discovery, and where a guided account move lands. |
| `invite_portal` | `https://telium.chat` | Where invite and vanity links open. The default is Telium's own page — safe for a server serving no client of its own. `"self"` restores links on your `public_base_url`. |

Leaving both `dir` and `client_url` unset is supported; `check` warns, since typing your server's address into a browser gives a 404. A server guiding an account move to you falls back to an import code when neither key is set.

## Klipy

Public browser-side GIF provider configuration. The key is an application credential, not a server secret: clients contact KLIPY directly.

| Key | Default | Does |
|---|---|---|
| `enabled` | `true` | Whether GIF search is offered. |
| `api_key` | the public reference key | Handed to clients. |
| `api_base_url` | `https://api.klipy.com/api/v1` | API endpoint. |
| `media_hosts` | the four Klipy hosts | Domains the client may load GIFs from. |

## Mail

Outbound email: recovery-address confirmation and security warnings. `"none"` sends nothing.

| Key | Default | Does |
|---|---|---|
| `mode` | `"none"` | `"webhook"` POSTs `{ "to", "from", "subject", "text" }` as JSON to `webhook_url`; whatever listens there does the SMTP. Non-2xx is a failed send, 5xx retried twice. |
| `webhook_url` | empty | The endpoint to POST to. |
| `webhook_token` | empty | Sent as a bearer token when set. |
| `from` | empty | Sender address; empty means `noreply@<server_name>`. |

## Rate limits

Generous by default: they blunt runaway clients and floods, not ordinary sessions. Requests are attributed to their TCP peer; `X-Forwarded-For` is ignored unless that peer is in `trusted_proxies` — list only proxies you control, since a trusted address can claim any client IP.

| Key | Default | Does |
|---|---|---|
| `enabled` | `true` | Turning this off is a danger finding. |
| `read_burst`, `read_per_sec` | `200`, `20` | Ordinary reads: burst, then steady per second. |
| `write_burst`, `write_per_sec` | `60`, `5` | Ordinary writes. |
| `auth_burst`, `auth_per_sec` | `10`, `0.25` | Sign-in and registration — the tightest bucket. |
| `federation_burst`, `federation_per_sec` | `240`, `40` | Server-to-server traffic, per socket; generous because a peer relays for all its users. |
| `search_burst`, `search_per_sec` | `600`, `20` | Guild search, in cost units (an ordinary search costs about seven). |
| `trusted_proxies` | `[]` | Proxy addresses allowed to claim a client IP. |

Buckets are keyed by bearer-token hash, bot app id, federation origin, or client IP; at most 20,000 are held. Rejections are counted in `telium_ratelimit_rejections_by_kind_total`.

## Gateway

Per-socket limits.

| Key | Default | Does |
|---|---|---|
| `outbox_depth` | `400` | Queued events before the socket is closed with `4010`. |
| `max_connections_per_account` | `6` | Simultaneous sockets per account (close `4011`). |
| `max_pending_sockets` | `2048` | Upgraded sockets not yet identified, globally (close `4013`). |
| `max_frame_bytes` | `64KiB` | Largest client frame buffered and parsed; the only cap acting before authentication. |
| `frames_per_sec`, `frame_burst` | `10`, `120` | Client frames per account per second; heartbeats exempt. |
| `typing_per_sec`, `typing_burst` | `0.5`, `5` | Typing notifications per account. |

## Failover

Warm standby. `standbys` is who may stream this server's database; `replicate` is whose database this server mirrors and serves read-only. Each side names the other — neither server can enrol the other. See [Warm standby](/self-hosting/warm-standby/).

| Key | Default | Does |
|---|---|---|
| `standbys` | `[]` | Domains allowed to pull your change log and snapshots. Empty means no standby, and no write-logging triggers installed. |
| `replicate` | `[]` | Domains you mirror. |
| `dir` | `replicas` | Where mirrored databases and their media live. |
| `poll_secs` | `5s` | How often a standby asks for new entries; lag is data loss in a failure. |
| `batch` | `500` | Log entries fetched per poll. |
| `keep_acked_secs` | `30m` | How long acknowledged entries are kept, so a briefly disconnected standby resumes. |
| `stale_after_secs` | `5m` | How behind a replica may be before clients are told it is behind, not merely a copy. |
| `media_batch` | `200` | Content addresses examined per sweep of a replica's media. |
| `promoted_standbys` | `{}` | Standbys allowed to stream a logical origin after promotion. |
| `demotion_poll_secs` | `30s` | How often a primary asks its standbys whether one has taken over. |
| `max_snapshot_bytes` | `100GiB` | Disk cap for one bootstrap snapshot; too low silently breaks failover. |

## Updates

The server checks what the current release is and says so when the gap grows. It installs nothing and restarts nothing. See [Updates](/self-hosting/updates/).

| Key | Default | Does |
|---|---|---|
| `check` | `true` | Fetch the public release list every `check_interval_secs`. Off: nothing is fetched, nothing is logged about it. |
| `manifest_url` | the project's `releases.json` | Where the list lives; CI appends to it on every `server-v<version>` tag. Point it at your own copy to mirror. |
| `check_interval_secs` | `6h` | Check cadence. |
| `retry_secs` | `30m` | Retry delay after a failed check. |
| `timeout_secs` | `10s` | How long one check may take. |
| `stale_after_days` | `2w` | Days since the first release this build missed before it is mentioned once at startup. |
| `urgent_after_days` | `45d` | Days before being behind is impossible to overlook. Security releases are urgent immediately. |
| `manifest_public_key` | empty | Ed25519 public key (url-safe base64) the manifest must have been signed with; empty means transport-only trust. |
| `manifest_signature_url` | empty | Where the detached signature lives; empty means `manifest_url` + `.sig`. |

## Usage

A daily, anonymous deployment count: one HTTPS POST with a random id and the number of enabled accounts. No version, no server name, no user data.

| Key | Default | Does |
|---|---|---|
| `report` | `true` | Off sends nothing and stores nothing for later. |
| `count_url` | `https://count.telium.chat/ping` | Where the report goes; point it at your own collector to keep the number in-house. |
| `interval_secs` | `1d` | Report cadence. |
| `timeout_secs` | `10s` | How long one report may take. |

## Metrics

What the operator console measures, and for how long. Aggregates only — no user, channel or peer dimension, no message content. See [Observability](/self-hosting/observability/).

| Key | Default | Does |
|---|---|---|
| `enabled` | `true` | Off loses only the "is it slow, or is it just me" answer. |
| `interval_secs` | `1m` | One history row per interval; between rows, counters live in memory. |
| `retention_days` | `14d` | How long rolled-up history is kept (about twenty thousand rows). |
| `storage_interval_secs` | `15m` | Slower sampling clock for the gauges that cost a table scan. |
| `max_routes` | `512` | Most route patterns tracked in the live per-route table. |
| `scrape_enabled` | `false` | Whether `GET /metrics` answers at all; off gives `404`. |
| `scrape_token` | empty | Bearer token admitting a scrape from anywhere. `TELIUM_METRICS_SCRAPE_TOKEN` overrides. |
| `scrape_token_previous` | empty | Old token still accepted during a rotation. |
| `scrape_allow` | `["127.0.0.1", "::1"]` | TCP peers admitted without a token. |

## Retention

Housekeeping for residue held about people. There is no message retention. See [Data lifecycle](/self-hosting/data-lifecycle/).

| Key | Default | Does |
|---|---|---|
| `erasure_journal_days` | `90d` | How long the journal backing an erasure request is kept after it completes. |
| `tombstone_days` | `365d` | How long local deletion tombstones live. Zero keeps them forever. |
| `remote_cache_days` | `30d` | How long records about a remote server's deleted content are kept. |
| `exports_per_day` | `3` | Account data exports one account may request per day. |
| `delivered_notice_days` | `14d` | How long "delivered" receipts are kept. |
| `audit_log_days` | `730d` | How long guild audit entries live. Zero keeps them forever. |

## Integrity

Startup database checks.

| Key | Default | Does |
|---|---|---|
| `startup_check` | `"quick"` | `off`, `quick` (default) or `full` (several times slower). `TELIUM_DB_INTEGRITY` overrides for one run. |
| `foreign_key_check` | `true` | Look for rows referencing missing records. |
| `refuse_start_on_corruption` | `true` | Leave on: a corrupt server keeps writing and diverges from its backups. `false` starts anyway and salvages. |

## Shutdown

On SIGTERM the server refuses new sockets, closes gateway sockets with code `4005`, waits `settle_ms` for close frames to flush, then gives in-flight HTTP requests up to `grace_secs` before exiting.

| Key | Default | Does |
|---|---|---|
| `grace_secs` | `15s` | Ceiling on how long stopping may take. Allowed range 1–300. |
| `settle_ms` | `250ms` | Flush window for close frames. At most 5000. |

Your supervisor must wait longer than `grace_secs`: the systemd unit uses `TimeoutStopSec=30` and `compose.yml` uses `stop_grace_period: 20s`. Raise those if you raise `grace_secs`.

## One process per database

At startup the server claims an `instance_lease` row and heartbeats it every 30 seconds. A second process on the same database refuses to start. The lease can be taken over when its holder has the same PID and host, when that PID is dead, or after 2 minutes without a heartbeat.

`TELIUM_INSTANCE_LOCK=off` skips the check. Use it only to clear a lease held by a machine that no longer exists. The rate limiter is in-process, so it relies on this rule too.

A process handles roughly 16,000 gateway events per second of fanout. See [Scaling](/self-hosting/scaling/).

## Reports, defederation and blocklists

Server-operator controls are separate from guild moderator permissions. They are in the control plane and on these endpoints (paths relative to `/_telium/v1`):

| Endpoint | Purpose |
|---|---|
| `GET /admin/reports`, `PATCH /admin/reports/{id}` | Report queue and resolution. Reports are kept `moderation.report_retention_days` (365 d). |
| `GET`/`POST /admin/defederation`, `DELETE /admin/defederation/{domain}` | Block federation with a domain, or lift the block. |
| `GET`/`POST`/`DELETE /admin/blocklist-feeds`, `POST /admin/blocklist-feeds/refresh` | Signed blocklist feeds. Also `moderation.blocklist_feeds` in the config. |
| `GET /admin/peers/{origin}`, `POST /admin/revalidate` | Peer status and key revalidation. |
| `POST /admin/archive`, `POST /admin/storage/sweep` | Archive maintenance and storage reclamation. |

Treat a blocklist feed as privileged input: a compromised feed can cut you off from a large part of the network. Refederating reopens communication but does not replay anything that was blocked in the meantime.

## Health

`GET /_telium/v1/health` answers whether the HTTP server is up, and nothing about the SFU, peers, backups or standbys. Admin endpoints give more: `/admin/status` (backups, protocol window, peers), `/admin/health` (warnings with a cause and next step), and `/admin/version`. Log targets and Prometheus are in [Observability](/self-hosting/observability/).
