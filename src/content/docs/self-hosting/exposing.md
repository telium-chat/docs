---
title: Exposing your server
description: DNS, TLS and the reverse proxy or tunnel that put a homeserver on a public domain.
sidebar:
  order: 5
---

The server binds loopback; whatever sits in front of it is the public side. Pick one front and follow its section — Caddy if the box has open ports and you want the least moving parts, a Cloudflare Tunnel if you want none at all, nginx if you already run it. The tunnel kit includes the tunnel, and the standalone kit can run this page's Caddy as a container (its `proxy` profile), so this page is mostly for the native install and for fronts the box already runs.

Whatever you use, the front must:

- pass WebSocket upgrades on all paths;
- allow a read timeout above 90 seconds (the gateway heartbeat is 45 s; the shipped examples use 600 s);
- send `X-Forwarded-For`, with its own address listed in `rate_limit.trusted_proxies`;
- accept request bodies of at least 128 MB;
- leave out its own Content-Security-Policy, since the server sends one.

The shipped configs in [`deploy/reverse-proxy/`](https://github.com/telium-chat/telium/blob/main/deploy/reverse-proxy/) — a Caddyfile and an nginx.conf — already do all of this. Replace `telium.example.org` with your hostname and keep the upstream at `http://127.0.0.1:8448`.

## Caddy

The least config for a plain VPS. Caddy fetches and renews certificates by itself, forwards WebSocket upgrades without being told, streams rather than buffers, and has no read timeout to trip over.

```sh
sudo apt install caddy                     # or your distro's package
sudo cp deploy/reverse-proxy/Caddyfile /etc/caddy/Caddyfile
sudo $EDITOR /etc/caddy/Caddyfile          # set your hostname
sudo systemctl reload caddy
```

`rate_limit.trusted_proxies` stays `["127.0.0.1"]` — Caddy is on the same box.

## Cloudflare Tunnel

No open ports: `cloudflared` makes outbound connections only, and Cloudflare terminates TLS. The tunnel carries HTTP and WebSockets, which is all the homeserver needs. In the dashboard, map your hostname to `http://127.0.0.1:8448`, and list the tunnel's local address — `127.0.0.1` when `cloudflared` runs on the box — in `rate_limit.trusted_proxies`.

The Compose kit runs `cloudflared` as a container on a fixed address instead; its page has the details.

:::caution
A tunnel cannot carry SFU or TURN media, which is UDP. An SFU needs its own public address with its DNS record unproxied. See [SFU](/self-hosting/sfu/).
:::

Cloudflare's proxy caps upload sizes below what the server allows, so very large media uploads fail with 413 behind a tunnel — another reason big-media servers pick a plain proxy.

## nginx and Certbot

If nginx is already what the box runs:

```sh
sudo apt install certbot python3-certbot-nginx
sudo certbot --nginx -d chat.example.com
```

Copy `deploy/reverse-proxy/nginx.conf` into a site, set your hostname, keep the upstream at `http://127.0.0.1:8448`, then:

```sh
sudo nginx -t && sudo systemctl reload nginx
```

The example redirects HTTP to HTTPS, disables response buffering for the gateway, allows 128 MB bodies and adds per-IP request limits with a tighter zone for `/_telium/v1/auth/`. Keep `rate_limit.trusted_proxies` at `["127.0.0.1"]`.

## Verify

From another machine — not the server itself, so you are testing DNS and TLS too:

```sh
curl -fsS https://chat.example.com/.well-known/telium/server
curl -fsS https://chat.example.com/_telium/v1/capabilities
```

Then open [telium.chat](https://telium.chat) (or any other Telium client), register on your server, and create a guild. Caddy and Cloudflare renew certificates on their own; behind any other front, expiry is yours to watch.
