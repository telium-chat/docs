---
title: Make your homeserver reachable
description: Set up HTTPS with Caddy, nginx or Cloudflare Tunnel.
sidebar:
  order: 5
---

A Telium homeserver needs a public **HTTPS address**. The native installer listens on `127.0.0.1:8448`; your reverse proxy or tunnel makes it reachable to other people.

**Choose one front end:**

| You have | Use |
| --- | --- |
| A public Linux server with ports 80/443 available | [Caddy](#caddy) |
| Cloudflare Tunnel already configured | [Cloudflare Tunnel](#cloudflare-tunnel) |
| nginx already serving other sites | [nginx and Certbot](#nginx-and-certbot) |
| The standalone Compose kit with bundled Caddy | Follow [its installer](/self-hosting/install-docker/), not this manual setup |

If your website stays at `example.com` while the API runs at `chat.example.com`, finish [account-domain setup](/self-hosting/domain-delegation/) **before creating accounts**.

## Before you start

Point your API hostname's DNS to the server or configure its tunnel. Do not put the homeserver's raw HTTP port 8448 on the public internet.

Your front must forward all routes, including `/.well-known/telium/server` and `/_telium/v1/`, and support WebSockets. Set request-body limits high enough for your chosen upload policy, and allow long-lived gateway connections. Configure `rate_limit.trusted_proxies` for the actual proxy address; incorrect trust settings make different users share one rate limit.

## Caddy

Caddy obtains and renews HTTPS certificates for your hostname. On Debian/Ubuntu, install Caddy and add this **site block** to its Caddyfile:

```text
chat.example.com {
    reverse_proxy 127.0.0.1:8448
}
```

For example:

```sh
sudo apt install caddy
sudoedit /etc/caddy/Caddyfile
sudo systemctl reload caddy
```

If that file already serves other sites, **add the block rather than replacing the file**. Caddy forwards WebSockets automatically. Open inbound **TCP 80 and 443** at the VPS provider and on the host firewall.

The [shipped Caddyfile](https://github.com/telium-chat/telium/tree/main/deploy/reverse-proxy) has a more complete production example. For a proxy on the same host, `rate_limit.trusted_proxies = ["127.0.0.1"]` is appropriate.

## Cloudflare Tunnel

A tunnel lets the homeserver receive HTTPS and WebSocket requests without opening inbound HTTP ports.

1. Create a tunnel in the Cloudflare dashboard.
2. Map the public hostname `chat.example.com` to `http://127.0.0.1:8448` **if cloudflared runs on the same host as the native server**.
3. Make sure cloudflared is running and the tunnel hostname has a valid public HTTPS certificate.
4. Test the HTTPS discovery URL below.

**For the dedicated Docker tunnel kit**, the upstream is instead its fixed container address, `http://172.31.240.3:8448`. Follow [the Docker tunnel guide](/self-hosting/install-docker-tunnel/) for that setup.

Cloudflare Tunnel carries homeserver HTTP and WebSockets. It **cannot forward an SFU's UDP media**, and its upload-size limits may be lower than those configured in Telium.

## nginx and Certbot

If nginx is already installed, add a virtual host for the API name and issue an HTTPS certificate. This is an HTTP-only starting point for **Certbot's nginx integration**:

```nginx
server {
    listen 80;
    server_name chat.example.com;

    client_max_body_size 128m;
    location / {
        proxy_pass http://127.0.0.1:8448;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_read_timeout 600s;
    }
}
```

Enable the site, run `sudo nginx -t`, reload nginx and obtain a certificate with Certbot (or your existing ACME solution). **Do not leave the API HTTP-only**; client discovery and sign-in require a working public HTTPS endpoint. See the [shipped nginx config](https://github.com/telium-chat/telium/tree/main/deploy/reverse-proxy) for a more complete example.

If nginx is on the same host, add `127.0.0.1` to `rate_limit.trusted_proxies`.

## Verify

From another machine, run:

```sh
curl -fsS https://chat.example.com/.well-known/telium/server
curl -fsS https://chat.example.com/_telium/v1/capabilities
```

The first response should advertise your intended `server_name` and HTTPS API URL. If localhost health succeeds but these commands fail, debug **DNS, certificate issuance and reverse-proxy routing** first:

```sh
curl -fsS http://127.0.0.1:8448/_telium/v1/health
```

If uploads fail with HTTP 413, compare proxy and tunnel body limits with [your media policy](/self-hosting/common-settings/#file-limits-and-expiry). If connections drop, verify WebSocket forwarding and read timeouts.

**Next:** [After installation](/self-hosting/after-setup/).