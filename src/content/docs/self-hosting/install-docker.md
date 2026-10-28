---
title: Install with Compose
description: The container kit — the server, a Cloudflare tunnel and the update timer as one Compose project.
sidebar:
  order: 3
---

The container kit runs the same `telium-server` binary in Docker, next to a `cloudflared` tunnel container, with an updater that pulls the newest release on a timer. Pick it when the box already runs Docker, or when you want the no-open-ports setup it ships: nothing is published to the host at all — the tunnel is the only way in.

## What you need

- A Linux box with systemd, Docker and the compose plugin
- A domain on Cloudflare (the kit's front is a Cloudflare Tunnel)
- sudo, from an ordinary account — that account owns the deploy, and the script refuses to make it root

## One command

```sh
git clone https://github.com/telium-chat/telium.git
cd telium
sudo ./deploy/install.sh chat.example.com
```

The script installs the kit to `/opt/telium` — `compose.yml`, a `telium.toml` with the identity set to your domain, the update machinery — creates `/srv/telium-backups` owned by the container's uid, installs the systemd units and enables `telium-update.timer`. Run it again any time: it upgrades the scripts and units and leaves `compose.yml`, `telium.toml`, `update.conf` and `tunnel.env` alone. Without the domain argument it seeds the config with placeholder values to edit by hand.

## Two credentials

The tunnel token. Create a tunnel in the Cloudflare dashboard, map `chat.example.com` to `http://172.31.240.3:8448` — the server container's fixed address on the kit's private network — and give the token to the box:

```sh
printf 'TUNNEL_TOKEN=%s\n' "$TOKEN" > /opt/telium/tunnel.env
chmod 600 /opt/telium/tunnel.env
```

Compose refuses to start while `tunnel.env` is missing, and the token must never be committed.

The registry login, only if your image source needs one:

```sh
docker login ghcr.io -u <user> --password-stdin
```

`telium-update.service` runs as the account that ran `docker login`, so the pull finds that account's `~/.docker/config.json` — which is why the installer runs with sudo from an ordinary account rather than as root.

## Review the config

`/opt/telium/telium.toml` is mounted read-only into the container. Worth a look before the tunnel connects:

- `[voice]` names the SFU this deployment was staged against — remove or replace the region unless it is yours. With no region, calls mesh up to four participants.
- `[registration]` is open, and the first account becomes the administrator — register yours as soon as the server is reachable, then set `open = false`.
- `update.conf` says how the box updates itself; see [Updates](/self-hosting/updates/).

## Verify

```sh
cd /opt/telium && docker compose ps        # server and tunnel up
curl -fsS https://chat.example.com/.well-known/telium/server
```

The image tag is `ghcr.io/telium-chat/telium:server-latest`; the updater moves it on every release, and `update.conf` can pin it to a `server-v<version>` tag or digest. Storage is a named volume (`telium-data`) for the database and media, and the `/srv/telium-backups` bind mount for archives — deliberately not inside the data volume. See [Backups](/self-hosting/backups/).

## Troubleshooting

| Symptom | Check |
|---|---|
| Compose refuses to start | `tunnel.env` is missing or empty |
| Clients cannot connect | the dashboard maps your hostname to `http://172.31.240.3:8448`, and the tunnel container is up |
| Every user shares one rate limit | `trusted_proxies` in `telium.toml` must be exactly the tunnel's address, `172.31.240.2` |
| Pulls fail unauthenticated | `docker login` as the owning account, not root |
| Uploads fail with 413 | Cloudflare's upload limit — large media wants a plain proxy front, see [Exposing your server](/self-hosting/exposing/) |
