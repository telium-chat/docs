---
title: Quick start
description: Run a Telium homeserver on your machine, then put the server on a public domain.
sidebar:
  order: 1
---

This page gets a homeserver running locally, then shows the minimum changes to serve it on your own domain. Running a web client is not part of it: people use the one hosted at [telium.chat](https://telium.chat), and hosting your own is optional. For a hardened deployment, continue with [Production](/self-hosting/production/).

## How it compares

Telium has Discord's guild model on servers you run, federated like Matrix, with DMs encrypted end to end.

<img class="diagram diagram-light" src="/diagrams/compare-light.svg" alt="Feature comparison of Telium, Discord, Element (Matrix), Signal, Telegram and Mattermost: self-hosting, federation, communities, end-to-end encrypted DMs and channels, calls, bots, account migration, phone-free sign-up, open source and maturity." />
<img class="diagram diagram-dark" src="/diagrams/compare-dark.svg" alt="Feature comparison of Telium, Discord, Element (Matrix), Signal, Telegram and Mattermost: self-hosting, federation, communities, end-to-end encrypted DMs and channels, calls, bots, account migration, phone-free sign-up, open source and maturity." />

Telium is alpha. The others have years of production use, audits and polished apps. If you need encrypted community channels today, use Matrix or Signal groups.

## Requirements

- Rust 1.85 or newer
- Git
- [Bun](https://bun.sh), only to run or build the web client yourself

The client needs no setup. [telium.chat](https://telium.chat) is a full Telium web client that works with every server, including one on your own machine.

## Run it locally

Start the homeserver:

```sh
git clone https://github.com/telium-chat/telium.git
cd telium/server
cargo run -- init     # writes telium.toml
cargo run -- serve    # listens on 127.0.0.1:8448
```

Open [telium.chat](https://telium.chat) and register an address on your server, such as `@alice:localhost:8448`. The first account on a fresh server becomes its administrator. To name administrators explicitly instead, list their localparts in `registration.admins`.

To keep the client on your machine too, run it from the repository in a second terminal:

```sh
cd telium/web
bun install
bun run dev           # http://localhost:5173
```

The Vite dev server proxies API, discovery and gateway paths to `http://localhost:8448`. Set `TELIUM_ORIGIN` to point it at another homeserver.

## Go public

You need a domain with DNS pointing at your host, and a TLS-terminating reverse proxy in front of the server.

### 1. Build

```sh
cd server && cargo build --release --bin telium-server
```

### 2. Configure

Edit `server/telium.toml`. These are the values to change for an internet-facing server:

```toml
# Appears in every account ID (@alice:chat.example.com). Pick it once.
server_name = "chat.example.com"

# The HTTPS URL clients and other servers use. Published at /.well-known/telium/server.
public_base_url = "https://chat.example.com"

# Stay on loopback behind the proxy.
bind = "127.0.0.1:8448"

# Persistent storage for the database and uploads.
database_url = "sqlite:///var/lib/telium/telium.db?mode=rwc"
media_dir = "/var/lib/telium/media"

[rate_limit]
# The proxy's address, so rate limits apply to the real client.
trusted_proxies = ["127.0.0.1"]
```

No web client is required. People open [telium.chat](https://telium.chat) and sign in with addresses on your server, or use the desktop and Android clients. If you want the server's discovery document to name a client page — the guided account-move flow sends people there — set one:

```toml
[web]
client_url = "https://telium.chat"    # or your own hosted build
```

To serve your own build from this server instead, run `bun run build` in `web/` and set `[web] dir` to the `dist` it writes, relative to the process's working directory. Leaving both keys out changes nothing for users on telium.chat or packaged clients; `telium-server check` notes it as a warning. See [Web client](/self-hosting/configuration/#web-client).

Any string value can be `"${env:NAME}"` or `"${file:/path}"`. Use that for secrets. See [Secrets](/self-hosting/secrets/).

[`server/telium.example.toml`](https://github.com/telium-chat/telium/blob/main/server/telium.example.toml) lists every option with its default. [Configuration](/self-hosting/configuration/) covers the important ones.

### 3. Put a proxy in front

The repository ships two proxy configs. Replace `telium.example.org` with your domain and keep the upstream at `127.0.0.1:8448`.

| File | Notes |
| --- | --- |
| `deploy/reverse-proxy/Caddyfile` | Caddy fetches certificates and proxies WebSockets with no extra config. |
| `deploy/reverse-proxy/nginx.conf` | Preserves WebSocket upgrades, turns off buffering for the gateway, allows 128 MB uploads, redirects HTTP to HTTPS. Pair it with Certbot. |

A Cloudflare Tunnel also works for the homeserver, since it carries HTTP and WebSocket traffic. It cannot carry SFU or TURN media, which need UDP.

### 4. Check and start

```sh
cd server
./target/release/telium-server check --config telium.toml
./target/release/telium-server serve --config telium.toml
```

`check` audits the config for settings that would expose a production server and exits non-zero if it finds any. It opens no database and binds no port, so it is safe to run against a live server. Add `--strict` to fail on warnings too.

For a persistent install, use the systemd unit in `deploy/telium-server.service`. It runs `check` as `ExecStartPre`.

Verify from another machine:

```sh
curl -fsS https://chat.example.com/.well-known/telium/server
curl -fsS https://chat.example.com/_telium/v1/capabilities
```

### 5. Close registration

Create your account first, then close sign-ups if the server is private:

```toml
[registration]
open = false
```

## Voice and video

Calls work without extra setup. With no SFU configured, the server uses peer-to-peer mesh for up to `voice.mesh_max_participants` people (default 4).

For larger calls, add an SFU and point a voice region at it:

```toml
[voice]
default_region = "local"

[[voice.regions]]
name = "local"
sfu = "https://sfu.example.com"
```

The SFU needs its own public address with UDP ports open. See [SFU](/self-hosting/sfu/).

Some network pairs (symmetric NAT, many corporate networks) need a TURN relay. Set both `voice.turn` (`host:port`, reachable on UDP) and `voice.turn_secret` (matching coturn's `static-auth-secret`). Setting only one does nothing, and the server warns at startup.

## Troubleshooting

| Symptom | Check |
| --- | --- |
| Client cannot connect | `public_base_url`, HTTPS, and WebSocket forwarding through the proxy or tunnel |
| Discovery fails | `server_name` matches what `/.well-known/telium/server` returns |
| All clients share one rate limit | Add the proxy's address to `rate_limit.trusted_proxies` |
| Calls stay on mesh | A `voice.regions` entry has a non-empty `sfu` URL and `default_region` names it |
