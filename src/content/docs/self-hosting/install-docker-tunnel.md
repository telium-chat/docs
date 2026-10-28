---
title: Install with Compose (tunnel)
description: The no-open-ports container kit — one installer command, one tunnel token, a homeserver that updates itself.
sidebar:
  order: 4
---

```sh
git clone https://github.com/telium-chat/telium.git
cd telium
sudo ./deploy/install.sh chat.example.com
```

The domain is the argument. The installer puts the kit in `/opt/telium` — `compose.yml`, a `telium.toml` with your identity set, the update timer — and leaves exactly one thing only you can do: create the tunnel. Run it again any time; it upgrades the machinery and never overwrites `compose.yml`, `telium.toml`, `update.conf` or `tunnel.env`.

## What you need

- A Linux box with systemd, Docker and the compose plugin
- A domain on Cloudflare — the front is a Cloudflare Tunnel, so **no ports are open at all**; the tunnel is the only way in
- sudo, from an ordinary account: that account owns the deploy, and the updater runs as it

## The tunnel token

1. In the Cloudflare dashboard, create a tunnel and map `chat.example.com` to `http://172.31.240.3:8448` — the server container's fixed address on the kit's private network.
2. Give the token to the box:

```sh
printf 'TUNNEL_TOKEN=%s\n' "$TOKEN" > /opt/telium/tunnel.env
chmod 600 /opt/telium/tunnel.env
```

Compose refuses to start while `tunnel.env` is missing, and the token must never be committed. That is the whole install. Updates need nothing from you: the timer checks the registry every minute and moves the image inside whatever window `update.conf` names — the same fields as every other kit, documented in [Updates](/self-hosting/updates/).

## After it finishes

```sh
cd /opt/telium && docker compose ps        # server and tunnel up
curl -fsS https://chat.example.com/.well-known/telium/server
```

Register your account — the first one becomes the administrator — then set `[registration] open = false` in `/opt/telium/telium.toml` and `docker compose up -d`. One line worth checking first: `[voice]` names the SFU this deployment was staged against; remove it unless it is yours, and calls mesh up to four people without it. Data is a named volume (`telium-data`) plus `/srv/telium-backups` for archives — see [Backups](/self-hosting/backups/).

## Troubleshooting

| Symptom | Check |
|---|---|
| Compose refuses to start | `tunnel.env` is missing or empty |
| Clients cannot connect | the dashboard maps your hostname to `http://172.31.240.3:8448`, and the tunnel container is up |
| Every user shares one rate limit | `trusted_proxies` in `telium.toml` must be exactly the tunnel's address, `172.31.240.2` |
| Pulls fail unauthenticated | `docker login` as the owning account, not root |
| Uploads fail with 413 | Cloudflare's upload limit — large media wants the [standalone kit](/self-hosting/install-docker/)'s plain front |
| Calls never use an SFU | a tunnel carries HTTP only; an SFU on this box wants the standalone kit and its open ports |
