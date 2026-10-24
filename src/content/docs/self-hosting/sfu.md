---
title: SFU
description: Run telium-sfu, the LiveKit-backed media relay for guild voice, video and screen sharing, and point your homeserver at it.
sidebar:
  order: 3
---

This page sets up `telium-sfu` and connects it to your homeserver. Without an SFU, guild calls fall back to peer-to-peer mesh, capped at `voice.mesh_max_participants` (4).

| Piece | Role |
|---|---|
| `telium-server` | Authorises calls and signs short-lived join tokens. |
| `telium-sfu` | Verifies those tokens and mints LiveKit access. One SFU can serve many homeservers. |
| `livekit-server` | The WebRTC engine. `telium-sfu` launches it for you. |

The homeserver stays the authority. The SFU verifies the homeserver's signature on each token and never decides membership or moderation. It fetches the homeserver's signing key over HTTPS, so you copy no keys by hand.

## Requirements

- A host with its own public address, separate from any HTTP-only ingress. Media is UDP and cannot pass through a Cloudflare Tunnel or an HTTP proxy.
- A hostname such as `sfu.example.com`. If it is on Cloudflare, make the record DNS-only.
- These ports open on the SFU host:

| Port | Protocol | Purpose |
|---|---|---|
| 443 | TCP | SFU control API and LiveKit signalling over HTTPS |
| 7881 | TCP | LiveKit TCP media fallback |
| 3478 | UDP | Embedded TURN |
| 50000-60000 | UDP | LiveKit media |

## Install with the script

From a Telium checkout on a Debian or Ubuntu host:

```sh
sudo bash sfu/install.sh
```

It installs nginx, Certbot, Rust if needed, `livekit-server` and `telium-sfu`, creates a `telium-sfu` system user and service, and opens the ports above when UFW is active. It then prints a one-time setup URL. In the browser you set the admin password, enter the SFU and LiveKit signalling hostnames, choose public or private mode, and the dashboard configures nginx and Let's Encrypt.

The dashboard then lives at `https://sfu.example.com/admin`. Under **Trusted servers** (`/admin/trust`) you add a homeserver by its `server_name`. The SFU discovers it, verifies its key and starts accepting its tokens without a restart. Removing one stops new sessions from it; calls already connected are left alone.

## Install by hand

Build from the repository. `telium-protocol/` must stay beside `sfu/`.

```sh
cd sfu
cargo build --release --bin telium-sfu
./target/release/telium-sfu init --config sfu.toml
```

Install `livekit-server` from the [LiveKit releases](https://github.com/livekit/livekit/releases). The SFU finds it on `PATH`, next to the `telium-sfu` binary, or at `livekit.binary`.

### Minimum `sfu.toml`

```toml
bind = "127.0.0.1:7890"

[livekit]
public_url = "https://sfu.example.com"

[trust]
discovery = true
public = false

[[trust.origins]]
server_name = "chat.example.com"
discovery_url = "https://chat.example.com"
```

`server_name` must equal the homeserver's `server_name`. The SFU fetches `{discovery_url}/_telium/v1/keys` and follows key rotation on its own. Add one `[[trust.origins]]` block per homeserver. To pin a key instead of discovering it, drop `discovery_url` and set `key_id` and `public_key_b64` from `telium-server keys`.

Put the control API behind TLS (for example nginx and Certbot proxying `https://sfu.example.com` to `http://127.0.0.1:7890`), then run it:

```sh
./target/release/telium-sfu serve --config sfu.toml
curl -fsS https://sfu.example.com/health
# {"ok":true}
```

### Endpoints

| Method and path | Auth | Purpose |
|---|---|---|
| `GET /health` | none | `{"ok": …}`, a probe of LiveKit. Homeservers and clients poll it. |
| `POST /session` | homeserver-signed join token | Returns `{url, token, room, max_bitrate}` for LiveKit. |
| `POST /control` | homeserver-signed command | `mute`, `deafen`, `disconnect`, `subscribe` and `unsubscribe`, translated to LiveKit. |

## Point the homeserver at it

```toml
[voice]
enabled = true
default_region = "local"

[[voice.regions]]
name = "local"
sfu = "https://sfu.example.com"
```

`default_region` must name a region in the list. Restart the homeserver, create a voice channel, join from two accounts, and confirm the voice join response reports `mode: "sfu"`. If every region is unreachable, small calls fall back to mesh.

Guild SFU calls are end-to-end encrypted. The join answer says `e2ee: "required"`, and the web client refuses an SFU call that does not.

## Regions

A voice channel stores a region name, usually `auto`. The homeserver resolves it from two pools: `[voice].regions` and the guild's own custom regions. For `auto` it picks, in order: the guild's healthy default, the server's healthy default, the first healthy region, then the first region if none is healthy.

A client on `auto` measures `GET /health` round-trip time to up to four healthy regions and asks for the nearest. It only states a preference when the winner beats the server default by more than 25 ms. The homeserver still decides.

Guild owners and members with *Manage Server* can add their own SFU in **Guild Settings → Voice / SFU**, set it as the guild default, or pin a channel to a region at creation. That SFU must trust the guild's homeserver, or run in public mode.

## Configuration

| Key | Default | Notes |
|---|---|---|
| `bind` | `127.0.0.1:7890` | Control API listener. |
| `livekit.mode` | `spawn` | `spawn` writes `livekit.yaml` and launches LiveKit; `external` uses one you run. |
| `livekit.url` | `http://127.0.0.1:7880` | LiveKit API. |
| `livekit.public_url` | empty | Browser-facing signalling URL. Set it in production. |
| `livekit.api_key`, `api_secret` | empty | Generated in spawn mode when empty. |
| `livekit.rtc.port_range_start`, `port_range_end` | 50000, 60000 | UDP media range. |
| `livekit.rtc.tcp_port` | 7881 | TCP fallback. |
| `livekit.rtc.use_external_ip` | `false` | `true` on cloud hosts behind NAT. |
| `livekit.turn.enabled`, `udp_port` | `true`, 3478 | Embedded TURN. |
| `livekit.room.empty_timeout` | 300 | Seconds before an empty room is removed. |
| `trust.discovery` | `true` | Fetch each origin's key from `/_telium/v1/keys`. |
| `trust.cache_ttl_secs` | 86400 | Key cache lifetime. |
| `trust.public` | `false` | Trust any homeserver that publishes keys. |
| `trust.allow_insecure_discovery` | `false` | Development only. |
| `limits.max_bitrate` | 8000000 | Per-participant ceiling; join tokens are clamped to it. |
| `limits.enforce`, `poll_interval_secs` | `true`, 15 | Mute video tracks whose declared layers exceed the ceiling. |
| `admin.enabled`, `admin.bind` | `false`, `127.0.0.1:7891` | Dashboard; the installer turns it on. |

The full annotated file is [`sfu/sfu.example.toml`](https://github.com/telium-chat/telium/blob/main/sfu/sfu.example.toml).

### External LiveKit

```toml
[livekit]
mode = "external"
url = "http://livekit.internal:7880"
public_url = "https://sfu.example.com"
api_key = "<your LiveKit API key>"
api_secret = "<your LiveKit API secret>"
```

`sfu.toml` does not support `${file:…}` or `${env:…}` references, so keep the file readable only by the SFU's user.

### TURN over TLS

For networks that block UDP, give the embedded TURN a TLS port and a certificate covering its hostname:

```toml
[livekit.turn]
enabled = true
tls_port = 5349
domain = "turn.example.com"
cert_file = "/etc/letsencrypt/live/turn.example.com/fullchain.pem"
key_file = "/etc/letsencrypt/live/turn.example.com/privkey.pem"
```

### Public SFU

```toml
[trust]
discovery = true
public = true
```

Any homeserver that publishes keys can then use the SFU by pasting its URL into a guild. Rooms are namespaced by the verified origin, so guilds stay isolated. Turn this on only if you mean to run a shared public SFU.

:::caution
Keep `trust.allow_insecure_discovery = false` on any SFU reachable from the internet. In public mode the origin comes from an unauthenticated request body, and this flag lets a stranger make the SFU connect to loopback, your LAN or cloud metadata addresses.
:::

## Troubleshooting

| Symptom | Cause |
|---|---|
| `/health` is `{"ok":false}` | LiveKit is not running. Check the binary is findable and ports 7880 and 7881 are free. The SFU logs `generated livekit.yaml` before launching it. |
| `/session` returns 403 | The SFU does not trust the homeserver: `server_name` or `discovery_url` is wrong, or the origin is missing. |
| `/session` returns 400 about `max_bitrate` | The join token carries no positive bitrate; update the homeserver. |
| Health is fine but there is no audio | UDP 50000-60000, TCP 7881 or UDP 3478 is blocked, or the browser has no microphone permission. |
| Calls use mesh | No `voice.regions` entry has an `sfu` URL, or `default_region` does not name one. |
| Build cannot find `telium-protocol` | Keep `telium-protocol/` next to `sfu/`. |

Calls themselves are described in [Voice and video](/features/voice-and-video/).
