---
title: Running in production
description: Pick how to install a Telium homeserver, then take it from nothing to a public HTTPS domain.
sidebar:
  order: 1
---

A production homeserver is one `telium-server` process behind TLS on a public domain. Everything below is in service of that sentence: install the binary, tell it its own name, put something public in front of it, and keep it updated.

<img class="diagram diagram-light" src="/diagrams/production-light.svg" alt="Clients reach a reverse proxy over HTTPS on port 443. The proxy forwards HTTP to telium-server on 127.0.0.1:8448, which keeps its data in a SQLite data dir and signs join tokens for telium-sfu. Call media flows over UDP between clients and the SFU." />
<img class="diagram diagram-dark" src="/diagrams/production-dark.svg" alt="Clients reach a reverse proxy over HTTPS on port 443. The proxy forwards HTTP to telium-server on 127.0.0.1:8448, which keeps its data in a SQLite data dir and signs join tokens for telium-sfu. Call media flows over UDP between clients and the SFU." />

## What you need

- A Linux machine with systemd — a small VPS is plenty — with Docker installed only if you pick the container path
- A domain name
- Its DNS record pointed at the machine

No client to host: [telium.chat](https://telium.chat) and the packaged desktop and Android clients work with every server. And if you would rather not run a server at all, there is [managed hosting](/self-hosting/managed-hosting/).

## Pick an install

| Install | Recommended when | Guide |
|---|---|---|
| **Native (systemd)** | Default. Telium is one static binary with a SQLite database; there is nothing else to install. | [Install natively](/self-hosting/install-systemd/) |
| **Docker Compose** | The box already runs Docker. One installer, three questions; the kit's Caddy or your own front, voice calls optional, updates on by default. A tunnel-only variant needs no open ports. | [Install with Compose](/self-hosting/install-docker/) · [(tunnel)](/self-hosting/install-docker-tunnel/) |
| **From source** | You are developing the server, not hosting it. | [Development](/reference/development/#homeserver) |

Both install guides are one command with your domain as the argument; everything the config needs is derived from it.

## What every install shares

- **Two settings that matter.** `server_name` and `public_base_url` are both your domain; everything else keeps its default. See [Configuration](/self-hosting/configuration/).
- **Something public in front.** Caddy on the box, or a Cloudflare Tunnel with no open ports. See [Exposing your server](/self-hosting/exposing/).
- **The startup audit.** `telium-server check` runs before every start and refuses configs that would expose a production server. See [Checking a config](/self-hosting/configuration/#checking-a-config).
- **Updates, on by default.** Both installs ship an updater and timer; see [Updates](/self-hosting/updates/).

## Finish

Once your server answers on its domain, register your account — the first one on a fresh server becomes its administrator — then set `[registration] open = false` and restart. Voice and video mesh up to four participants with no extra setup; a bigger server wants an [SFU](/self-hosting/sfu/).
