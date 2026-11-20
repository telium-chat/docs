---
title: Voice relays (SFU)
description: Understand Telium voice relays, decide whether to run one, and choose a native or Docker installation.
sidebar:
  order: 7
---

An **SFU** (Selective Forwarding Unit) is a voice and video relay. Instead of everyone in a call sending a separate stream to everyone else, participants send their media to an SFU, which forwards it to the other people in the call.

An SFU is **not** a Telium homeserver. A homeserver handles accounts, communities and call permissions; an SFU handles the audio, video and screen-share traffic. You can run either one without running the other.

## Which guide should I use?

| What you want to do | Where to start |
| --- | --- |
| **Run a Telium homeserver** so people can create accounts and join communities | [Install with Compose](/self-hosting/install-docker/) or [install natively](/self-hosting/install-systemd/). Running your own SFU is optional. |
| **Run a separate SFU with Docker**, whether for your own communities or as a public relay | [Standalone SFU with Docker](/self-hosting/sfu-docker/). It installs only the relay, not a homeserver. |
| **Run an SFU directly on Linux** without Docker | Use [the native SFU installer](#install-with-the-script) below. |
| **Connect an existing homeserver to your own SFU** | Install the SFU using either method, then [configure your homeserver to use it](#point-the-homeserver-at-it). |

## Do you need to run your own SFU?

**Not necessarily.** Telium homeservers can use available SFUs from the public relay directory. Hosting your own makes sense if you want to control relay capacity, serve specific communities or contribute more relay capacity to the network.

If no usable SFU is available, smaller calls can fall back to direct peer-to-peer connections (mesh), subject to the homeserver's `voice.mesh_max_participants` limit (4 by default). Mesh is a fallback, not a reason to assume every small call avoids SFUs.

A homeserver can operate behind Cloudflare Tunnel, but an SFU needs publicly reachable media ports. You can run the SFU on a different machine or VPS.

### Private and public relays

You choose who may use your SFU. Hosting one for your community does **not** automatically make it available to everyone:

| Mode | Who can use it? | What to configure |
| --- | --- | --- |
| **Private (recommended to start)** | Only the homeservers you add to the trust list | Keep `trust.public = false`; add your homeserver with `telium-sfu trust add` or `[[trust.origins]]`. |
| **Public (optional)** | Any homeserver that publishes keys and can reach the SFU | Set `trust.public = true` **only** when you want to share your relay capacity. |

An SFU can also serve several specific trusted homeservers without being public. If you are inviting other operators to use it, consider bandwidth and participant limits before making it available. [Post-installation checklist](/self-hosting/after-setup/#want-to-help-grow-the-network).

## What runs where

| Piece | Role |
|---|---|
| `telium-server` | Authorises calls and signs short-lived join tokens. |
| `telium-sfu` | Verifies those tokens and mints LiveKit access. One SFU can serve many homeservers. |
| `livekit-server` | The WebRTC engine. `telium-sfu` launches it for you. |

The homeserver stays the authority. The SFU verifies the homeserver's signature on each token and never decides membership or moderation. It fetches the homeserver's signing key over HTTPS, so you copy no keys by hand.

## Requirements

- A host with its own public address, separate from any HTTP-only ingress. Media is UDP and cannot pass through a Cloudflare Tunnel or an HTTP proxy.
- Two DNS names such as `sfu.example.com` (the relay API) and `livekit.example.com` (LiveKit signalling). If you use Cloudflare, set both records to DNS-only.
- These ports open on the SFU host:

| Port | Protocol | Purpose |
|---|---|---|
| 443 | TCP | SFU control API and LiveKit signalling over HTTPS |
| 7881 | TCP | LiveKit TCP media fallback |
| 3478 | UDP | Embedded TURN |
| 50000-60000 | UDP | LiveKit media |

## Install with the script

On a Debian or Ubuntu host, download the SFU bootstrap script and run it (not the homeserver installer). No git checkout is needed:

```sh
curl -fsSLo /tmp/telium-sfu-setup.sh https://raw.githubusercontent.com/telium-chat/telium/main/deploy/bootstrap-sfu.sh
sudo bash /tmp/telium-sfu-setup.sh
```

The installer is a conversation in your terminal, and nothing is installed until you confirm. It asks:

1. **Full** or **Portable**. Full lets Telium set up HTTPS; portable uses a reverse proxy you already manage and keeps everything in one folder under `/opt` or `/srv`.
2. For a full installation, **which HTTPS front end** to use. The installer looks at what is already on the machine and offers only what fits:

| Found on the host | What Telium does |
| --- | --- |
| Nothing on ports 80/443 | Installs Caddy, which gets the certificates itself (the same as the homeserver installer). |
| Caddy | Leaves your Caddy configuration alone and adds one file, `/etc/caddy/telium-sfu.caddy`. Adding a single `import` line to your Caddyfile needs a separate confirmation; a backup is saved first and the change is undone if Caddy rejects it. |
| nginx | Leaves nginx and all your sites alone, including the default site. Adds one server file for the two SFU hostnames and uses Certbot for certificates for those two names only. |
| Another program on 80/443 | Full installation is not offered. Use the portable installation with your own reverse proxy. |

3. For a portable installation, **which directory**.

It then lists the system changes and asks you to confirm. Either way it downloads the checksum-verified `telium-sfu` release binary and `livekit-server` (nothing is compiled), creates a `telium-sfu` system user and service, and enables automatic updates. A full installation also opens the ports above when UFW is active. A portable one touches no packages, proxy, certificates or firewall.

When the install finishes it runs `telium-sfu configure`, which asks for:

- the **SFU** and **LiveKit signalling** hostnames,
- (full installs) an email address for Let's Encrypt,
- who can use the relay:
  - **Public relay**: guilds on any Telium homeserver can run calls through it. Choose this if you will list the relay at [telium.chat/list](https://telium.chat/list). A private relay in the directory turns every caller away.
  - **Private relay**: only the homeservers you trust. Give yours; add more later.

On a full installation it then adds the two sites to your proxy and gets the certificates. On a portable one it only saves the config: route the SFU name to `http://127.0.0.1:7890` and the LiveKit name (with WebSocket upgrades) to `http://127.0.0.1:7880` yourself, and open the media ports in your own firewall.

Every question is also a flag, so the installer can run unattended. `sudo bash sfu/install.sh --help` lists them, and `--dry-run` prints the plan without changing anything:

```sh
sudo bash sfu/install.sh --mode portable --dir /opt/telium-sfu --yes \
  --sfu-domain sfu.example.com --livekit-domain livekit.example.com \
  --private --homeserver chat.example.com
```

There is no web interface: nothing listens except the relay API and LiveKit, both behind your proxy.

### Manage it with `telium-sfu`

After installing, the same binary is the control panel. It finds the relay's config by itself and, because that file belongs to the `telium-sfu` account, re-runs itself under `sudo` when you are not root. A full installation puts it on your `PATH`; a portable one runs it as `<directory>/bin/telium-sfu`.

| Command | What it does |
| --- | --- |
| `telium-sfu status` | LiveKit health, whether new calls are accepted, rooms and participants, your domains, public or private, trusted and blocked servers, limits, estimated transfer against your budget (per guild too) and whether the relay is up to date. `--json` for scripts. |
| `telium-sfu trust` | List the whitelist. |
| `telium-sfu trust add chat.example.com` | Whitelist a homeserver by its `server_name`. |
| `telium-sfu trust remove chat.example.com` | Remove one. |
| `telium-sfu block add guild.example` | Refuse a guild server, whatever the mode. Also `block` (list) and `block remove`. |
| `telium-sfu configure` | Change the domains or who can use the relay; sets up HTTPS on a full installation. |
| `telium-sfu restart` | Restart the service. |
| `telium-sfu discover chat.example.com` | Look a server's keys up the way the relay would for a join and say which step fails. |
| `telium-sfu manage` | An interactive menu over all of the above. |

`trust add` discovers the homeserver, verifies its key and saves it. The running relay follows its config file, so trust and block changes take effect within a couple of seconds with no restart. Removing a server stops new sessions from it; calls already connected are left alone. Compose deployments keep their config on the host: edit `sfu.toml` there and restart. `status` still works inside the container.

**Upgrading from the web dashboard.** Earlier releases had a browser installer and a dashboard on port 7891. Both are gone. Your whitelist, blocks and limits stay in `sfu.toml`; the old `[admin]` settings are ignored and the `admin-password` file can be deleted. If you proxied `/admin` publicly, remove that location.

## Install with Docker Compose

To run a relay **without installing a Telium homeserver**, follow [Standalone SFU with Docker](/self-hosting/sfu-docker/). It runs `telium-sfu` and LiveKit in one container.

If you are **also setting up a Telium homeserver**, the [homeserver Compose file](/self-hosting/install-docker/#voice-calls-on-your-own-sfu) can run an SFU alongside it through its `voice` profile. This is a different setup from the standalone relay, because a homeserver and an SFU do different jobs.

For either Docker deployment, `livekit.rtc.use_external_ip` must be `true` behind Docker NAT, and the corresponding media ports must be open on the host. In public mode the SFU discovers guild-server keys as needed; private relays use configured trust origins.

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
public_url = "https://livekit.example.com"

[trust]
discovery = true
public = false

[[trust.origins]]
server_name = "chat.example.com"
discovery_url = "https://chat.example.com"
```

`server_name` must equal the homeserver's `server_name`. The SFU fetches `{discovery_url}/_telium/v1/keys` and follows key rotation on its own. Add one `[[trust.origins]]` block per homeserver. To pin a key instead of discovering it, drop `discovery_url` and set `key_id` and `public_key_b64` from `telium-server keys`.

Provide HTTPS for both public names: proxy `https://sfu.example.com` to the SFU control API at `http://127.0.0.1:7890`, and proxy `https://livekit.example.com` to LiveKit signalling at `http://127.0.0.1:7880` with WebSocket upgrade support. For an nginx example, see [the Docker guide's HTTPS section](/self-hosting/sfu-docker/#4-provide-https-for-both-names). Then run the SFU:

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

**Only if you operate a homeserver that should use this SFU:** add the relay as a voice region in that homeserver's configuration. Running a public SFU for other operators does not require you to install or configure a homeserver of your own.

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
| `install.mode`, `install.sfu_domain` | empty | How `telium-sfu` manages this machine (`full`, `portable`, `compose`); the installer sets both. |

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
