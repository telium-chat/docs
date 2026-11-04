---
title: Install with Compose
description: Run a Telium homeserver in Docker; add a private SFU only if you want to carry your own calls.
sidebar:
  order: 3
---

## Install

On a Linux host with Docker and the Compose plugin:

```sh
git clone https://github.com/telium-chat/telium.git
cd telium
sudo bash deploy/standalone/install.sh
```

Answer three prompts: your domain, whether to use the kit's Caddy or your own reverse proxy, and whether **this machine should carry voice calls**.

:::tip
**Unsure about the voice question? Answer No.** Telium can use available public SFUs automatically, or mesh for small calls. Answer Yes only if you want to run an SFU for your own community. **Yes does not list your SFU publicly:** the generated `sfu.toml` defaults to `trust.public = false` and trusts only your homeserver.
:::

The installer writes the config, starts the stack and enables automatic updates. Re-running it updates the installer machinery without overwriting your edited config files.

## Finish the setup

1. Point `chat.example.com` (your actual domain) at the box and check `https://chat.example.com/.well-known/telium/server`.
2. Register your account. The first user becomes the administrator.
3. If you do not want public signups, set `[registration] open = false` in `/opt/telium/telium.toml` and restart the stack:

```sh
cd /opt/telium
docker compose up -d
```

If you answered **Yes** to voice, the installer also prompts for the **SFU API** and **LiveKit signaling** hostnames. Point both DNS records at the box and open the media ports: TCP `7881`, UDP `3478` and UDP `50000–60000`.

A Cloudflare Tunnel or HTTP proxy alone cannot carry those UDP media ports. Keep media DNS records **DNS-only** if using Cloudflare, and use a public-IP host for the relay. If you selected your own reverse proxy, configure HTTPS and WebSockets for both media hostnames yourself. [SFU networking steps](/self-hosting/sfu/#network-requirements).

## Change your mind later

The install lives at `/opt/telium`. The `COMPOSE_PROFILES` setting in `/opt/telium/.env` decides whether Caddy (`proxy`) and the SFU (`voice`) run. Re-run the installer to have it configure voice domains and wiring, rather than enabling `voice` without an `sfu.toml`.

- **No SFU:** the homeserver can still use healthy public directory relays when available.
- **Private SFU:** calls for this homeserver use your own relay. Other Telium homeservers cannot use it unless you approve them.
- **Public volunteer:** a separate, intentional choice. [How public SFUs work](/self-hosting/sfu/#volunteer-a-public-relay).

Updates are on by default. Use `TELIUM_UPDATES=manual` in `/opt/telium/update.conf` to disable automatic application of updates; see [Updates](/self-hosting/updates/).

## Requirements and internals

| Piece | Notes |
|---|---|
| Docker + Compose | On a Linux host; requires sudo to install |
| DNS and HTTPS | Ports 80/443 for bundled Caddy, or use your existing front |
| Server listener | Host loopback `127.0.0.1:8448` only |
| Config | `/opt/telium/.env` and `/opt/telium/telium.toml` |
| Optional private voice | `sfu.toml`, additional DNS and public media ports |

For a manual installation, see the [standalone Compose kit](https://github.com/telium-chat/telium/tree/main/deploy/standalone).

## Troubleshooting

| Symptom | Check |
|---|---|
| Domain not reachable | DNS, Caddy certificate, and `docker compose ps` in `/opt/telium` |
| 80/443 already in use | Choose your existing front instead of the included Caddy |
| Every user shares a rate limit | Configure `rate_limit.trusted_proxies` for the front |
| Calls use mesh unexpectedly | Check the [public directory or private SFU selection](/self-hosting/sfu/#if-you-dont-want-to-host-a-relay) |
| SFU connects but carries no audio | UDP media ports, NAT, public DNS-only records and mic permissions |
| Config reports a missing `${env:…}` | A required value is missing in `/opt/telium/.env` |
