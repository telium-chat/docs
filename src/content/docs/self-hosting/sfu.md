---
title: Host a voice relay (SFU)
description: Run a Telium voice relay privately or for the public network.
sidebar:
  order: 7
---

An **SFU** forwards voice, video and screen-share traffic during calls. It does **not** store accounts or messages. You can host an SFU without running a Telium homeserver.

You don't have to host one to use Telium: a homeserver can use available public SFUs. Smaller calls may fall back to direct connections (mesh).

## Which guide should I use?

| Your setup | Guide |
| --- | --- |
| Linux, without Docker | [Native installer](#install-with-the-script) |
| Docker, SFU only | [Standalone SFU with Docker](/self-hosting/sfu-docker/) |
| Already installing a homeserver in Compose | [Homeserver Compose installer](/self-hosting/install-docker/) offers an optional SFU |
| Have an existing homeserver and SFU | [Connect them](#point-the-homeserver-at-it) |

## Private and public relays

| Mode | Who can use it? | Setting |
| --- | --- | --- |
| **Private** | Only trusted homeservers you choose | `trust.public = false` |
| **Public** | Other Telium homeservers that pass key verification | `trust.public = true` |

Private is a good place to start. In the native dashboard, add homeservers under **Trusted servers**. A public relay needs bandwidth, capacity limits, monitoring and a way to handle abuse. Directory listing is a **separate opt-in**, not a consequence of enabling public trust.

## What runs where

- **`telium-server`:** owns accounts and communities, and signs call permissions.
- **`telium-sfu`:** checks join tokens and controls a LiveKit process.
- **`livekit-server`:** handles actual WebRTC media traffic.

SFU operators do not need to copy homeserver signing keys. The SFU discovers them from the homeserver over HTTPS.

## Requirements

You need a host with a public IP, two DNS names such as `sfu.example.com` (SFU API) and `livekit.example.com` (media signalling), and these reachable ports:

| Port | Protocol | Use |
| --- | --- | --- |
| 443 | TCP | HTTPS for the SFU API and LiveKit signalling |
| 7881 | TCP | Media fallback |
| 3478 | UDP | TURN |
| 50000–60000 | UDP | WebRTC media |

A Cloudflare **HTTP Tunnel cannot carry the UDP media**. If you're using Cloudflare DNS, turn off the orange-cloud proxy for SFU hostnames.

## Install with the script

On Debian/Ubuntu, the native installer installs the SFU, LiveKit, nginx, Certbot and a systemd service:

```sh
git clone https://github.com/telium-chat/telium.git
cd telium
sudo bash sfu/install.sh
```

This is a host-level installation: it installs packages, services and proxy configuration. **It is not a self-contained folder-only install.** On a shared machine where changes to the host must be minimal, consider [Docker](/self-hosting/sfu-docker/) instead.

The installer prints a **one-time setup URL**. Open it to set the admin password, SFU hostname, LiveKit hostname and private/public mode. The admin dashboard is at `https://sfu.example.com/admin`.

For a private relay, add the server's `server_name` under **Trusted servers**. No restart is needed when changing the trust list; already-connected calls are not forcibly ended.

## Install with Docker Compose

[Standalone SFU with Docker](/self-hosting/sfu-docker/) installs just the relay, with an update timer. Unlike the native installer, you supply the host HTTPS proxy. Use this if you don't want the installer to configure nginx and Certbot for you.

## Install by hand

The reference SFU binary can also be built from source:

```sh
cd sfu
cargo build --release --bin telium-sfu
./target/release/telium-sfu init --config sfu.toml
```

Keep `telium-protocol/` alongside `sfu/` in the checkout. Install [LiveKit](https://github.com/livekit/livekit/releases) separately and make `livekit-server` available on `PATH` or via `livekit.binary`.

### Minimum `sfu.toml`

```toml
bind = "127.0.0.1:7890"

[livekit]
mode = "Spawn"
url = "http://127.0.0.1:7880"
public_url = "https://livekit.example.com"

[trust]
discovery = true
public = false

[[trust.origins]]
server_name = "chat.example.com"
discovery_url = "https://chat.example.com"
```

The `discovery_url` must lead to the trusted homeserver; its `server_name` must match the server's advertised name. Use HTTPS to proxy `sfu.example.com` to `127.0.0.1:7890` and `livekit.example.com` to `127.0.0.1:7880`, preserving WebSockets.

```sh
./target/release/telium-sfu serve --config sfu.toml
curl -fsS https://sfu.example.com/health
```

Expect `{"ok":true}`. This checks LiveKit, **not** whether your clients can send UDP media. Test a real call too.

## Point the homeserver at it

Skip this section if you're operating a standalone public relay. Otherwise add a voice region to the **homeserver's** `telium.toml`:

```toml
[voice]
enabled = true
default_region = "local"

[[voice.regions]]
name = "local"
sfu = "https://sfu.example.com"
```

Restart the homeserver. The SFU must trust that homeserver (or be public). Test a voice call and check that it selects `mode: "sfu"`. Telium encrypts guild SFU media end to end; the relay still learns IP addresses and call metadata.

## Regions

A server can advertise several regions, while individual guilds can select or add one. Clients can measure region latency and request a nearer relay; the homeserver makes the final selection. See [Voice and video](/features/voice-and-video/#regions).

## Configuration

The authoritative keys, defaults and descriptions are in [`sfu/sfu.example.toml`](https://github.com/telium-chat/telium/blob/main/sfu/sfu.example.toml). The important groups are:

| Group | What to set |
| --- | --- |
| `[livekit]` | Public signalling URL, spawn/external mode and credentials |
| `[livekit.rtc]` and `[livekit.turn]` | Public media ports and NAT behavior |
| `[trust]` | Public or private mode and origin discovery |
| `[limits]` | Per-call bitrate, rooms, participants and **transfer budget** |
| `[admin]` | Admin dashboard and local bind |

**For public relays, do not leave limits at zero by accident.** In settings such as `transfer_budget_bytes`, zero means **unlimited**. Review the transfer period and stop threshold against your provider's actual allocation.

### External LiveKit

Set `[livekit] mode = "External"`, provide its internal `url`, public HTTPS `public_url`, and the matching API key and secret. Keep credentials out of public logs and repositories.

### TURN over TLS

For networks that block UDP, LiveKit's `[livekit.turn]` supports a TLS port (commonly 5349) with a configured certificate and hostname. Open that port only if you enable the option.

### Public SFU

```toml
[trust]
discovery = true
public = true
allow_insecure_discovery = false
```

Do **not** turn on `allow_insecure_discovery` on any internet-facing relay; it can make discovery probe unsafe addresses. To list a public relay, use [telium.chat/list](https://telium.chat/list) and choose **A relay (SFU)**.

## Troubleshooting

| Problem | Check |
| --- | --- |
| `/health` says `ok: false` | LiveKit process, config and internal port 7880 |
| `/session` returns 403 | Trusted origin, discovery URL and matching server name |
| Call joins but no sound or video | Public UDP ports, firewall, NAT settings and microphone permissions |
| Calls stay in mesh mode | Voice regions, region health and SFU availability |
| Docker relay works locally, not externally | Host firewall, Docker UDP mappings and DNS-only records |

**Next:** [Set transfer limits](/self-hosting/sfu-docker/#3-configure-the-relay) before offering public capacity.