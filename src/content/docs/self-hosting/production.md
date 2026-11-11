---
title: Set up a homeserver
description: Choose an installer and bring a Telium homeserver online.
sidebar:
  order: 1
---

A homeserver holds accounts, communities, messages and attachments. You need a Linux host and an HTTPS domain. You do **not** need to host the Telium web client: use [telium.chat](https://telium.chat).

## Choose an installation method

| Method | Use it when | Guide |
| --- | --- | --- |
| **Native Linux (systemd)** | You want a single server binary and no Docker runtime. | [Native install](/self-hosting/install-systemd/) |
| **Docker Compose** | You already use Docker or want an optional bundled HTTPS proxy and SFU. | [Compose install](/self-hosting/install-docker/) |
| **Docker with Cloudflare Tunnel** | You cannot expose inbound HTTP ports and already use Cloudflare. | [Tunnel install](/self-hosting/install-docker-tunnel/) |

For an **SFU without accounts**, stop here and follow [SFU setup](/self-hosting/sfu/) instead.

## Before you install

1. **Choose your account name.** The `server_name` is the domain in `@name:example.com`. Don't casually change it after accounts exist.
2. **Choose your public API address.** Most installations use the same hostname for identity and the API. If your website stays at `example.com` but the API runs at `chat.example.com`, follow [Account domains](/self-hosting/domain-delegation/) **before registration**.
3. **Prepare DNS and HTTPS.** Your public API must be available over HTTPS. The native install needs a separate [reverse proxy or tunnel](/self-hosting/exposing/); the standalone Compose kit can supply Caddy.
4. **Decide who can sign up.** A private server is enough for you and invited friends. Public signup is optional; [read the public checklist](/self-hosting/public-server/) before enabling it.

## Finish

After your chosen installer reports a healthy local server:

1. Check `https://YOUR-API-HOST/.well-known/telium/server` from outside the host.
2. Register through [telium.chat](https://telium.chat). Native private installs issue a one-time registration code; keep it until you've used it.
3. **Grant administrator access.** Native installs require the local `admin recover` command; other installers may use first-account bootstrap. Follow your install guide rather than assuming the first user is an admin.
4. Go through [After setup](/self-hosting/after-setup/) for backups, updates, uploads and federation. For everyday changes, start with [Common settings](/self-hosting/common-settings/) instead of the full configuration reference.

Calls can use public SFUs; operating a homeserver does **not** require operating an SFU.