---
title: Install with Compose
description: The standalone container kit — one interactive installer, three questions, a homeserver that updates itself.
sidebar:
  order: 3
---

```sh
git clone https://github.com/telium-chat/telium.git
cd telium
sudo bash deploy/standalone/install.sh
```

Answer three questions — your domain, who fronts it (the kit's Caddy with automatic certificates, or whatever already runs on the box), and whether it carries voice calls — and the installer writes the config, starts the stack, and turns on a timer that keeps every container current. Updates are on by default; `TELIUM_UPDATES=manual` in `/opt/telium/update.conf` is how you decline. Re-run the installer any time to upgrade the machinery; it never overwrites a file you could have edited.

No clone wanted? Fetch the installer on its own:

```sh
curl -fsSL https://raw.githubusercontent.com/telium-chat/telium/main/deploy/standalone/install.sh -o install.sh
sudo bash install.sh
```

## What you need

- A Linux box with Docker and the compose plugin
- A domain whose DNS record points at the box
- Ports 80 and 443 free (or an existing front). Voice adds TCP 7881, UDP 3478 and UDP 50000–60000.

## What it asks

| Question | Answers |
|---|---|
| Your domain | `chat.example.com` — the identity in every user id, so get it right first |
| Who fronts it | **1** the kit's Caddy (default) · **2** your own proxy or tunnel, pointed at `127.0.0.1:8448` |
| Voice calls? | Adds the [SFU](/self-hosting/sfu/) container and asks for two more domain names, suggested for you |

The whole stack is one Compose project in `/opt/telium`. The server publishes nothing but `127.0.0.1:8448`; what is public is the front's decision. Your answers live in one file, `/opt/telium/.env` — switch the front or add voice later by editing `COMPOSE_PROFILES` there and running `docker compose up -d` again.

## After it finishes

```sh
# 1. DNS: your domain (and the SFU names, if you took voice) -> the box.
#    On Cloudflare, DNS-only for the SFU names -- media cannot ride the proxy.
curl -fsS https://chat.example.com/.well-known/telium/server

# 2. Register your account. The first one becomes the administrator.

# 3. Close the door: set [registration] open = false in /opt/telium/telium.toml, then
cd /opt/telium && docker compose up -d
```

With voice, calls bigger than four people now run through your SFU; its dashboard is at `https://sfu.example.com/admin`. Everything about regions, public mode and TURN works exactly as on a native install — see [SFU](/self-hosting/sfu/).

## The manual route

The installer only does what you can: put [these five files](https://github.com/telium-chat/telium/tree/main/deploy/standalone) in a directory, write your domains into `.env`, and `docker compose up -d`. `telium.toml` reads its identity from `.env`, so there is one place to edit; `sfu.toml` has three marked lines for the voice profile. The kit's README explains what each file is for.

## Troubleshooting

| Symptom | Check |
|---|---|
| Nothing answers on your domain | DNS first, then `docker compose ps` in `/opt/telium`; Caddy's certificate needs DNS to resolve before it can be issued |
| Port 80 or 443 already in use | You picked the kit's Caddy while the box already runs a front — re-run the installer and answer 2, or retire the old one |
| Every user shares one rate limit | `trusted_proxies` in `telium.toml` must name your front: `172.31.241.2` for the kit's Caddy, `172.31.241.1` for a front on the host — the installer sets the right one |
| Calls mesh instead of using the SFU | `COMPOSE_PROFILES` lacks `voice`, or the `[voice]` block in `telium.toml` is still commented |
| Calls connect but carry no audio | The SFU's media ports — TCP 7881, UDP 3478, UDP 50000–60000 — are firewalled, or the SFU names are Cloudflare-proxied instead of DNS-only |
| The server refuses to start, logs an unresolvable `${env:…}` | `.env` is missing a variable |
