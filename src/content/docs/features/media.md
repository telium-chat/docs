---
title: Media
description: Where Telium stores uploads, how guilds decide which media origins to accept, and how link previews avoid exposing viewers.
sidebar:
  order: 4
---

This page covers file uploads (the three upload tiers), operator media policy and quotas, how a guild decides which media origins it accepts, external hosts such as Gofile, and link previews through camo.

Telium keeps two things apart: the server that **stores** a file, and the guild that **carries the message** referencing it. A guild server normally holds a descriptor or a provider URL, not a second authoritative copy of the bytes.

## Upload tiers

Each account picks where its uploads go in **Settings -> Account -> Where your uploads go**. The choice is stored on your home server (`GET|PUT /_telium/v1/media/preference`) and follows the account to every device.

| Tier | Label in the client | Who stores the file | Attachment |
| --- | --- | --- | --- |
| 1 | This server | your home server | `media://origin/hash` reference |
| 2 | Another Telium server | a Telium media origin you name, after a guild voucher | `media://origin/hash` reference |
| 3 | Another host | an external provider (Gofile), chosen per attachment | provider URL |

Only tier 2 stores an origin in the preference. For tier 3 you choose the provider when you attach a file. Pasting an HTTPS link into a message has nothing to do with tier 3: links go through [link previews](#link-previews-and-camo).

### Telium media references

Tiers 1 and 2 produce a content-addressed object:

```json
{
  "reference": "media://origin.example/9f2a…",
  "origin": "origin.example",
  "hash": "9f2a…",
  "capability": "…",
  "url": "https://origin.example/_telium/v1/media/9f2a…?cap=…",
  "filename": "screenshot.png",
  "mime": "image/png",
  "size": 184320,
  "width": 1280,
  "height": 720,
  "thumbhash": "…"
}
```

- `hash` is the BLAKE3 digest of the stored bytes. Identical uploads share one refcounted object.
- `origin` is the server authoritative for the bytes.
- `capability` is an unguessable fetch token. Holding the descriptor is what makes the file fetchable, so deleting a message does not revoke a capability someone already copied.
- `mime`, `size` and dimensions come from the origin, not from the message author.

Guild emoji and stickers are the exception: they are public and carry no capability, so other guilds can render them.

### Tier 1: your home server

```text
POST /_telium/v1/media
Authorization: Bearer <home token>
Content-Type: <type>
X-Telium-Filename: <name>
X-Telium-Purpose: attachment | profile | expression
<raw bytes>
```

The server enforces size and policy. Client-side resizing is only an optimization.

### Tier 2: another Telium media origin

You upload to another Telium server without holding an account there. Your guild issues a short-lived signed voucher (`POST /_telium/v1/media/vouchers`) binding the guild, user, destination origin, byte ceiling and expiry. The client presents it to the destination's `POST /_telium/v1/media/voucher-upload`, and the origin checks the guild server's signature and audience before storing the file. No password or login session is involved.

The client's upload-host picker lists hosts from two places: your home server's registry, and hosts vouched for by the curated feeds your guilds subscribe to (`GET /_telium/v1/media/registry/feeds`, authenticated, at most 60 entries, each labelled with who vouched for it). You can also type any origin that implements the media protocol.

### Tier 3: external hosts (Gofile)

Gofile is the one external adapter today. Upload bytes go **from your client straight to Gofile**, with progress reported in the upload dialog. Your home server may answer small session and metadata calls, but the file does not pass through it. The attachment stays a Gofile URL with no Telium hash or capability, and the bytes skip Telium's upload scanner.

Gofile's free download path needs a cookie that a browser `<video>` element cannot send cross-origin, so playback differs by client:

| Client | Playback path |
| --- | --- |
| Electron desktop, Tauri Android | the native shell sets a scoped Gofile cookie and plays from Gofile directly |
| Web browser, `gofile_playback_proxy = true` | your home server streams the file through a short-lived signed URL, without storing it |
| Web browser, `gofile_playback_proxy = false` | the client opens the Gofile URL instead of playing inline |

Turning the proxy off removes the playback routes and publishes `gofile_playback_proxy: false` in the registry. Uploads keep working and stay client-direct.

## Operator configuration

### Media policy

Hosting files is optional. A server with `default = "disabled"` still works: its users attach through another origin, and the client walks them through choosing one on their first upload.

```toml
[media_policy]
default = "enabled"          # enabled | quota | disabled
quota_bytes = 1073741824     # applies when default = "quota", and to allowlisted users
allowlist = []               # user ids that always get tier-1 upload
blocklist = []               # user ids that never do
profile_asset_carveout_bytes = 524288
max_file_bytes = 104857600
```

The profile-asset carveout keeps avatars and banners working on a server that hosts nothing else.

### Registry: suggested hosts and external providers

`GET /_telium/v1/media/registry` publishes the tier-2 origins you recommend, the external providers you enable, the Gofile playback policy and the [watch-together](/features/watch-together/) allowlist.

```toml
[media_registry]
gofile_playback_proxy = true

[[media_registry.hosts]]
origin = "files.example.org"
name = "Example Files"
description = "2 GB per file, kept for a year."
max_file_bytes = 2147483648
abuse_contact = "abuse@example.org"

[[media_registry.external_hosts]]
id = "gofile"
provider = "gofile"
name = "Gofile"
domain = "gofile.io"
upload_url = "https://upload.gofile.io/uploadfile"
browser_direct = true
```

`hosts` is a recommendation, not an allowlist. Remove the `external_hosts` entry to stop offering Gofile. Unknown provider names are not advertised, and Gofile is always reported as browser-direct regardless of what the config says. Keep provider account tokens out of this file: these entries are public.

If you set `[media_policy] default = "disabled"`, populate `hosts` so your users have somewhere to upload.

### Upload scanning

Every path that stores Telium media runs the scanning hook. Configure lists to make it refuse matches:

```toml
[moderation]
upload_hash_blocklist = []          # inline BLAKE3 digests
abuse_contact = "abuse@example.org" # published in /_telium/v1/capabilities

[[moderation.upload_hash_lists]]
name      = "example-list"
algorithm = "sha256"                # blake3 | sha256 | sha1
path      = "/var/lib/telium/example-list.txt"
```

A list file holds one hex digest per line, with `#` comments. A list that cannot be read **fails startup**. A match refuses the upload and files a report for operators; the uploader is not told which list matched.

### Emoji and sticker normalization

Expression uploads are re-encoded before storage: PNG, APNG, GIF, WebP and JPEG are accepted, SVG is refused, stills become PNG and animations become bounded GIF, and metadata is stripped. Limits live under `[limits]` as `expression_max_source_pixels`, `expression_max_total_pixels`, `expression_max_frames`, `expression_max_duration_ms` and `expression_drop_excess_frames`.

## Guild origin rules

A guild's moderators decide which media origins messages in the guild may reference, in **Guild settings -> Gates and origins** (`GET|PUT /_telium/v1/guilds/{id}/gates`, fields `origin_policy` and `origins`). Rules can name hosts one at a time or subscribe to a curator's signed feed.

When a message references a foreign Telium object, the guild server asks the origin to confirm it (`POST /_telium/v1/media/authorize`) before trusting its metadata.

### Precedence

The first match decides:

1. **Operator defederation.** An origin your server has defederated, for media or entirely (including via `blocklist_feeds`), is refused. No guild rule overrides it.
2. **Your server's own origin** is accepted.
3. **A literal guild rule** (`allow` or `block`) for that host. Feeds never override it.
4. **Feeds.** A `block` subscription blocks every host on its feed. A `block` entry blocks under any subscription. An `allow` entry under an `allow` subscription allows, if the feed has not expired. Any block beats any allow.
5. **The guild's `origin_policy`.** `allowlist` refuses anything not allowed above; `open` and `blocklist` accept anything not refused above.

Matching is by exact host, with no wildcards. A guild may subscribe to at most 8 feeds.

### Feed subscriptions

```json
{ "action": "allow", "feed": "https://registry.example/hosts.json", "key": "<curator Ed25519 public key, base64url>" }
```

- A rule without a pinned `key` is refused on save. Older keyless rules show as `unpinned` and do nothing.
- A feed is verified only against the pinned key (or a successor reached through signed rollovers).
- Fetches are HTTPS only, refuse redirects and internal addresses, and are size-capped.
- A new document is adopted only if it verifies, is well formed, is unexpired, is not issued too far in the future, and has a **higher serial**. Otherwise the last good copy stays in force and the reason is shown.
- When a feed expires, its **allow** entries lapse and its **block** entries stay.

Feeds are fetched when a rule is saved, every `feed_refresh_secs` after success, every `feed_retry_secs` after failure, and on demand from the pane's refresh button (`POST /_telium/v1/guilds/{id}/gates/refresh-feeds`, at most once a minute per feed).

```toml
[media_registry]
feed_refresh_secs = 3600
feed_retry_secs = 600
feed_timeout_secs = 10
feed_validity_secs = 604800   # lifetime of the feed this server publishes
```

Each feed rule in `GET .../gates` has a `status`: `state` (`active`, `expired`, `pending`, `failed` or `unpinned`), `curator`, `serial`, `issued_at`, `expires_at`, `fetched_at`, `attempted_at`, `error`, and host counts `allows`, `blocks` and `hosts`.

### Publishing a feed

Every Telium server publishes its `[[media_registry.hosts]]` as a signed feed at `GET /_telium/v1/media/registry/feed`. It is signed with a dedicated curator key, separate from the federation signing key. The registry document's `feed` object gives the URL and the key to pin (`feed.key`); `feed.next_key` during a rotation is informational, not something to pin.

To rotate the curator key with an overlap during which subscribers follow the rollover:

```text
POST /_telium/v1/admin/media/curator-key/rotate   { "overlap_secs": 604800 }
```

The overlap is clamped to between one and ninety days, and only one rotation runs at a time (a second request gets `409`). A subscriber that misses the whole overlap stops verifying the feed and needs its moderator to re-pin the new key.

### Finding curators

Servers can publish and follow signed curator directories, so moderators can pick a feed from a list instead of being handed a URL and key out of band.

```toml
[[media_registry.curators]]           # what this server publishes at /_telium/v1/media/curators
name = "Example Curators"
feed_url = "https://curator.example.org/_telium/v1/media/registry/feed"
key = "BASE64-ED25519-PUBLIC-KEY"
description = "Hosts that answer takedowns within a day."
contact = "curators@example.org"

[[media_registry.curator_directories]] # directories this server reads
url = "https://friend.example.org/_telium/v1/media/curators"
key = "BASE64-ED25519-PUBLIC-KEY"
label = "friend.example.org"
```

Moderators see the merged list at `GET /_telium/v1/guilds/{id}/gates/curators`. A directory admits nothing by itself: pinning a key is still the moderator's act. A directory without a pinned key is not fetched, and an expired one stops listing anything.

## Remote cache

Guild servers fetch foreign Telium media through `GET /_telium/v1/media/remote/{origin}/{hash}?cap=…` and may cache it. The hash checks integrity, and the cache never becomes a new origin. Entries expire under `[federation] media_cache_ttl_secs` (default one day) and `media_cache_max_bytes` (default 2 GiB), and are purged when the origin broadcasts a signed deletion.

## Account migration

Moving an account carries its Telium-hosted media to the new home with the same hash and capability. Objects that did not land in the first transfer are pulled afterwards. Peers rewrite descriptors that name the old origin, and the old home redirects capability fetches for moved objects. Three limits apply:

- encrypted DM attachments sit inside MLS plaintext, so servers cannot rewrite them;
- archived history may rely on the redirect;
- tier-3 attachments are not owned by your home and do not move.

See [Migration](/federation/migration/).

## Link previews and camo

An HTTPS link in a message is not Telium media: nobody hashed it or issued a capability. To keep viewers from contacting arbitrary hosts, the guild server fetches previews and images for them:

```text
GET /_telium/v1/embed?url=…
GET /_telium/v1/camo/{hash}
```

The fetcher resolves the destination and refuses private and special addresses. Link cards never become iframes. Settings live under `[federation]`:

| Key | Default |
| --- | --- |
| `embed_enabled` | `true` |
| `embed_max_bytes` | 8 MiB |
| `embed_video_max_bytes` | 32 MiB (larger videos fall back to a still) |
| `embed_timeout_secs` | 8 |
| `embed_cache_secs` | 86400 |

## Discovery endpoints

| Endpoint | Answers |
| --- | --- |
| `GET /_telium/v1/capabilities` | media policy, scanning status, abuse contact |
| `GET /_telium/v1/media/preference` | this account's tier and tier-2 origin |
| `GET /_telium/v1/media/registry` | suggested origins, external providers, playback policy, watch-together, feed URL and key |
| `GET /_telium/v1/media/registry/feed` | this server's hosts as a signed feed |
| `GET /_telium/v1/media/registry/feeds` | hosts vouched for by your guilds' feeds |
| `GET /_telium/v1/media/curators` | this server's signed curator directory |

Read each fact from the endpoint that owns it. For the full route list see the [API reference](/reference/api/).
