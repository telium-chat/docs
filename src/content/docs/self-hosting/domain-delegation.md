---
title: Use a different domain for your server
description: Keep account addresses on your own domain while hosting the Telium API on another hostname with .well-known discovery.
---

Your Telium usernames do **not** have to contain the hostname that runs your server. You can keep a public website at `example.com`, run the Telium API at `chat.example.com` (or a completely different host), and have usernames like `@alice:example.com`.

Telium calls this **domain delegation**. Other servers and clients look up a small JSON document at a fixed `.well-known` URL on the **identity domain**. That document tells them where to connect.

## How the two names work

| Name | Example | What it does |
| --- | --- | --- |
| **Account/identity domain** | `example.com` | Permanent name in `@alice:example.com` and some guild addresses |
| **Telium API address** | `https://chat.example.com` | Where clients and federating servers send requests |
| **Discovery URL** | `https://example.com/.well-known/telium/server` | Connects the identity domain to the API |

For example, someone adding `@alice:example.com` discovers `example.com`, reads the `api` value, and then connects to `chat.example.com`. Nothing about Alice's account address needs to change if the API later moves.

:::caution[Choose the identity before creating accounts]
Changing `public_base_url` moves the **network endpoint**. Changing `server_name` changes the identity itself and is **not** a simple rename. If you already have users, do not switch `server_name` just to make the address prettier; see [Relocation](/self-hosting/relocation/) and [Migration](/federation/migration/).
:::

## 1. Set the two values in `telium.toml`

The key is to give the server its **identity domain** and its **API URL**, rather than using the same name twice:

```toml
server_name = "example.com"
public_base_url = "https://chat.example.com"
bind = "127.0.0.1:8448"
```

The API must be reachable via HTTPS from the public internet. Do not put `http://127.0.0.1:8448` in `public_base_url` on a production server. Keep the local `bind` behind a proxy or tunnel.

If an installer first created both values as `chat.example.com`, adjust them **before the first account is registered**. Native configurations are usually at `/etc/telium/telium.toml`; production Compose configurations at `/opt/telium/telium.toml`.

Your API endpoint needs to handle normal REST requests and WebSocket upgrades, not only discovery. See [Exposing your server](/self-hosting/exposing/).

## 2. Publish discovery at the identity domain

A request to:

```text
GET https://example.com/.well-known/telium/server
```

must respond with Telium's discovery JSON, including values like:

```json
{
  "server_name": "example.com",
  "api": "https://chat.example.com",
  "gateway": "wss://chat.example.com/gateway/v1"
}
```

**This is a simplified illustration, not the full document to copy into production.** The actual Telium endpoint also supplies protocol compatibility, federation keys and optional features such as failover and relocation. The easiest and safest implementation is to **proxy only this path** on your website domain to the running Telium server, so those values stay current.

You do **not** need to point all of `example.com` at Telium. Its homepage, existing website, email and other paths can remain unchanged.

### Option A: a path-specific reverse proxy (recommended)

For example, when your website and Telium API live on the same host behind Caddy:

```caddyfile
example.com {
    handle /.well-known/telium/server {
        reverse_proxy 127.0.0.1:8448
    }

    handle {
        reverse_proxy 127.0.0.1:3000
    }
}

chat.example.com {
    reverse_proxy 127.0.0.1:8448
}
```

Here `127.0.0.1:3000` stands for **your existing website** — change it to the website's actual upstream. The path stays exactly `/.well-known/telium/server`; do not strip `/.well-known` when proxying. Caddy must have valid HTTPS certificates for both names.

If the Telium API lives on another host, point only the discovery route at that HTTPS origin and keep the rest of your website served as before. Configure upstream TLS/Host headers appropriately for your proxy.

You can use nginx, another path-aware proxy, or your hosting provider's supported URL-routing feature to do the same thing. The important result is a **200 OK with JSON** at the identity domain's discovery path.

### Option B: a separate website host, Pages or a tunnel

You can host `example.com` on one service (including static site hosting) while `chat.example.com` reaches Telium through an HTTPS proxy or a Cloudflare Tunnel. The **identity domain still must serve `/.well-known/telium/server`**.

Choose a hosting feature that can proxy that exact URL to the live Telium discovery endpoint without sending the rest of your site to Telium. Not every static host supports external reverse-proxy rewrites: **a 301/302 redirect is not the same as serving discovery JSON**, and some federation-related clients intentionally reject redirected discovery requests. Test the final response without following redirects.

If your static site cannot proxy one path, a possible fallback is to **mirror the complete JSON returned by the running server** as a static file at that path. However, this needs a reliable refresh process whenever the server's keys, version, URL or relocation/availability fields change; a stale snapshot can break federation or advertise wrong information. A live path proxy is strongly preferred for a public homeserver. A three-field sample is **not** a drop-in replacement for the full document.

:::note[Cloudflare Tunnel and voice]
An HTTPS tunnel can serve the homeserver's API and WebSockets, including `chat.example.com`. It **cannot** carry SFU media's UDP traffic. An SFU needs its own public transport and networking setup. See [SFU](/self-hosting/sfu/).
:::

## 3. Verify both hostnames

Run these from a different computer, replacing the examples:

```sh
# The identity domain must answer directly with JSON.
curl -i --max-redirs 0 https://example.com/.well-known/telium/server

# The same server's own discovery response should agree.
curl -fsS https://chat.example.com/.well-known/telium/server

# The published API must actually work.
curl -fsS https://chat.example.com/_telium/v1/capabilities
```

Check that:

1. The first request returns `200`, not a website HTML page or a redirect.
2. `server_name` is `example.com` in both responses.
3. `api` is `https://chat.example.com` and the `gateway` is a reachable secure WebSocket URL.
4. Your TLS certificates are valid for both hostnames and the API is publicly reachable.
5. A fresh client can select `example.com` and register/sign in; federation to an account on another home works.

For a private test install, you can inspect the local endpoint at `http://127.0.0.1:8448/.well-known/telium/server`. The public identity-domain URL is what other peers will fetch, so the local test by itself is not enough.

## Frequently asked questions

**Can I use the root domain for usernames but keep my normal website?** Yes. Only `/.well-known/telium/server` needs to answer Telium discovery. Other website paths remain yours.

**Can `chat.example.com` be a Cloudflare Tunnel?** Yes for homeserver HTTPS and WebSocket requests. Set `public_base_url` to its public HTTPS URL. Keep the identity-domain discovery path available independently.

**What domain do I enter in the public directory?** `example.com` — the `server_name` in user IDs — **not** `chat.example.com`. The directory discovers the API URL from `.well-known`. See [Run a public homeserver](/self-hosting/public-server/#get-onto-the-public-server-list).

**Can I change the API host in the future?** Yes, provided the discovery document and the running `public_base_url` are updated together and the old API is handled appropriately during the change. Retain the same `server_name`.

**Is this the Matrix `/.well-known/matrix/server` format?** No. Telium uses its own `/.well-known/telium/server` endpoint and JSON fields.

**Next:** [Test the public-server checklist](/self-hosting/public-server/#4-test-like-a-new-user) and [apply for the public directory](https://telium.chat/list) when your server is ready.
