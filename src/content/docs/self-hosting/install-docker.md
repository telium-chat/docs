---
title: Install with Docker Compose
description: Install a homeserver with the standalone Compose kit.
sidebar:
  order: 3
---

Use this installer if you already run Docker. It can add Caddy for HTTPS and an optional SFU for voice. For an **SFU without a homeserver**, use [standalone SFU with Docker](/self-hosting/sfu-docker/).

## Requirements

- Linux with systemd, Docker and Compose v2
- A domain pointed at the host
- An ordinary account with `sudo`
- If using the bundled Caddy, free inbound TCP ports 80 and 443
- If adding a local SFU, public media ports as shown in [SFU setup](/self-hosting/sfu/#requirements)

## 1. Install

```sh
git clone https://github.com/telium-chat/telium.git
cd telium
sudo bash deploy/standalone/install.sh
```

Or download the [standalone installer](https://github.com/telium-chat/telium/blob/main/deploy/standalone/install.sh) without cloning. It asks for your domain, whether to use the bundled Caddy or your existing proxy, and whether to add voice.

The Compose project lives in `/opt/telium`. It keeps editable configuration in `.env` and `telium.toml`. Automatic updates are enabled by default; [update policy](/self-hosting/updates/) is in `/opt/telium/update.conf`. Re-running the installer preserves your edited config.

## 2. Bring it online

Point DNS to your host. If you chose your **own** proxy, send HTTPS traffic to the local server at `127.0.0.1:8448`; see [Expose a homeserver](/self-hosting/exposing/). The web client stays at [telium.chat](https://telium.chat).

```sh
cd /opt/telium
sudo docker compose ps
curl -fsS https://chat.example.com/.well-known/telium/server
```

Sign up on your server. The standalone kit currently starts with open registration, and its default config allows the first account to become admin. **Register your operator account first**, then edit `/opt/telium/telium.toml`:

```toml
[registration]
open = false
```

Apply with `sudo docker compose up -d --force-recreate server`. Verify admin access in the client control plane.

## Using your website domain for accounts

For usernames like `@you:example.com` while the API lives at `chat.example.com`:

1. Answer **`chat.example.com`** in the installer, so the bundled proxy is configured for the correct hostname.
2. **Before creating accounts**, edit `/opt/telium/telium.toml`:

```toml
server_name = "example.com"
public_base_url = "https://${env:TELIUM_CHAT_DOMAIN}"
```

3. Keep `TELIUM_CHAT_DOMAIN=chat.example.com` in `/opt/telium/.env` and recreate the server container.
4. Publish `https://example.com/telium.txt` containing `chat.example.com` on your **existing website**. See [Account-domain setup](/self-hosting/domain-delegation/).

Don't send `example.com` to the VPS if it hosts your website elsewhere.

## Voice and files

If you chose the voice profile, point the two SFU DNS names at the host and open TCP 7881, UDP 3478 and UDP 50000–60000. Keep SFU hostnames DNS-only if using Cloudflare. See [SFU setup](/self-hosting/sfu/) for private/public relay options.

Uploads use local storage by default. [S3-compatible storage](/self-hosting/s3-media-storage/) is optional, but it does not replace backups.

## Troubleshooting

```sh
cd /opt/telium
sudo docker compose ps
sudo docker compose logs --tail=100 server
```

If the domain doesn't answer, check DNS and TLS. If 80/443 are already used, choose your **existing proxy** rather than the kit's Caddy. If calls have no media, check the SFU's publicly reachable UDP ports.

**Next:** [After setup](/self-hosting/after-setup/).