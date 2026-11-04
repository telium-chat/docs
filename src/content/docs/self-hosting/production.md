---
title: Running in production
description: Choose an install, get your homeserver on HTTPS, then decide whether to host voice yourself.
sidebar:
  order: 1
---

**For most operators:** start with a homeserver only. You do not need to run a web client or an SFU. Telium's default voice routing can use available public relays; hosting a **private** SFU is optional.

## Pick an install

| Your setup | Use |
|---|---|
| **Linux with systemd** | [Native install](/self-hosting/install-systemd/) — recommended for a simple homeserver |
| **Already using Docker** | [Standalone Compose](/self-hosting/install-docker/) — interactive installer, optional Caddy and SFU |
| **Need a Cloudflare Tunnel** | [Compose with tunnel](/self-hosting/install-docker-tunnel/) — homeserver only; SFU media needs public UDP elsewhere |
| **Just developing locally** | [Quick start](/start/quick-start/) |

You need a Linux host, a domain name and DNS pointed at the host. The web client at [telium.chat](https://telium.chat) can connect to your homeserver; you don't have to deploy a client yourself.

## Launch checklist

1. **Install:** follow one of the guides above. The installers set your server's identity (`server_name`) and public URL.
2. **Expose HTTPS:** point your domain at your server and configure a reverse proxy or tunnel. See [Exposing your server](/self-hosting/exposing/).
3. **Verify:** check that `https://chat.example.com/.well-known/telium/server` answers (replace with your domain).
4. **Register your account:** the first account on a fresh server becomes an administrator. Then turn off open registration unless you're deliberately hosting public signups.
5. **Keep updates and backups working:** installers enable update timers; see [Updates](/self-hosting/updates/) and [Backups](/self-hosting/backups/).

**Voice is optional infrastructure:** calls can use the public SFU directory automatically if a relay is available, or mesh for small calls. If you have spare bandwidth and want dependable voice for your own users, see [Run a private SFU](/self-hosting/sfu/#run-a-private-sfu-for-your-community). You are **not** required to offer it to the public.

## How the parts fit

<img class="diagram diagram-light" src="/diagrams/production-light.svg" alt="Clients reach a reverse proxy over HTTPS on port 443. The proxy forwards HTTP to telium-server on 127.0.0.1:8448, which keeps its data in a SQLite data dir and signs join tokens for telium-sfu. Call media flows over UDP between clients and the SFU." />
<img class="diagram diagram-dark" src="/diagrams/production-dark.svg" alt="Clients reach a reverse proxy over HTTPS on port 443. The proxy forwards HTTP to telium-server on 127.0.0.1:8448, which keeps its data in a SQLite data dir and signs join tokens for telium-sfu. Call media flows over UDP between clients and the SFU." />

For manual configuration, see [Configuration](/self-hosting/configuration/). The server's startup audit (`telium-server check`) refuses unsafe production settings.
