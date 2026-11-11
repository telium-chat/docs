---
title: Expose a homeserver over HTTPS
description: Configure DNS and a reverse proxy or Cloudflare Tunnel for Telium.
sidebar:
  order: 5
---

The native Telium server listens at `127.0.0.1:8448`. Clients need an externally reachable HTTPS address. **Choose one** of the following methods. The standalone Compose installer can configure its own Caddy, so use this page only if you supply the public front.

If your website lives at `example.com` and Telium's API at `chat.example.com`, see [account-domain setup](/self-hosting/domain-delegation/) before creating accounts.

Whichever front you use, forward **all API paths**, including `/.well-known/telium/server`, preserve WebSocket upgrades, and allow upload sizes consistent with your [media policy](/self-hosting/configuration/#media-policy).

## Caddy

Point the API hostname's DNS to your host and allow inbound TCP 80/443. In a Caddyfile:

```caddyfile
chat.example.com {
    reverse_proxy 127.0.0.1:8448
}
```

Caddy handles HTTPS certificates. If you already have a proxy, use it rather than running two services on port 443.

## Cloudflare Tunnel

Create a public hostname in your tunnel dashboard and direct it to `http://127.0.0.1:8448` on the machine running the native server. Keep HTTPS active at the public hostname. For the dedicated Compose tunnel kit, use [its internal container address](/self-hosting/install-docker-tunnel/) instead.

A tunnel forwards homeserver HTTP/WebSockets, **not UDP media for an SFU**. A proxy or tunnel may also enforce its own upload limit.

## nginx and Certbot

With DNS pointed at the host, proxy to the loopback listener:

```nginx
server {
    listen 80;
    server_name chat.example.com;
    location / {
        proxy_pass http://127.0.0.1:8448;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
    }
}
```

Run `nginx -t`, reload nginx, then issue a certificate with Certbot or your ACME tool and enable HTTPS. Check any default body-size cap (`client_max_body_size`) before advertising large uploads.

## Verify

From another network:

```sh
curl -fsS https://chat.example.com/.well-known/telium/server
curl -fsS https://chat.example.com/_telium/v1/capabilities
```

If local `/_telium/v1/health` works but HTTPS doesn't, debug DNS, certificates and proxy routing before changing Telium itself. Set `rate_limit.trusted_proxies` to the actual front address so client rate limits work correctly.

**Next:** [Post-install checks](/self-hosting/after-setup/).