---
title: Standalone SFU with Docker
description: Run a Telium voice relay without installing a homeserver.
sidebar:
  order: 8
---

This guide installs **only** `telium-sfu` and its LiveKit media engine. No homeserver, account service or web client is installed. The relay can be **private** (trusted homeservers only) or **public** (other Telium servers can use it).

For concepts and the native installer, see [SFU setup](/self-hosting/sfu/).

## Run one SFU with Docker

### 1. Prepare the host

You need Linux, Docker, Compose v2, systemd, an ordinary sudo-capable account and two DNS names pointed at the host:

- `sfu.example.com`: HTTPS API and health checks
- `livekit.example.com`: HTTPS/WebSocket signalling

Allow **TCP 80/443 and 7881**, plus **UDP 3478 and 50000–60000**. If using Cloudflare, set the SFU DNS records to **DNS only**. HTTP tunnels do not forward media.

### 2. Install the dedicated SFU stack

```sh
git clone https://github.com/telium-chat/telium.git
cd telium
sudo bash deploy/install-sfu.sh
```

This creates `/opt/telium-sfu/` with `compose.yml`, `sfu.toml` and an update timer. It does **not** configure nginx, obtain certificates or start an unconfigured service. It installs some host-level systemd/update files; Docker is not a fully portable single-directory installation.

### 3. Configure the relay

Edit the existing sections in `/opt/telium-sfu/sfu.toml`, without duplicating TOML tables:

```toml
[livekit]
public_url = "https://livekit.example.com"

[trust]
discovery = true
public = false
allow_insecure_discovery = false
```

Keep `public = false` for trusted homeservers only; add them as `[[trust.origins]]` entries or through the dashboard. Set `public = true` **only** if you intend to share capacity with any verified Telium homeserver. Keep the generated internal binds and LiveKit spawn configuration.

Before going public, set appropriate `[limits]` values for `max_rooms`, `max_participants`, `max_bitrate`, `transfer_budget_bytes` and `transfer_period_days`. **Zero means unlimited**, so don't leave it at zero if your provider meters traffic. See [SFU configuration](/self-hosting/sfu/#configuration).

### 4. Provide HTTPS for both names

Use your existing **host** reverse proxy. Send:

| Public URL | Internal upstream |
| --- | --- |
| `https://sfu.example.com` | `http://127.0.0.1:7890` |
| `https://livekit.example.com` | `http://127.0.0.1:7880` (WebSocket upgrades) |

Here's a minimal nginx starting point; enable HTTPS certificates for **both** names with your ACME client:

```nginx
server {
    listen 80;
    server_name sfu.example.com;
    location / {
        proxy_pass http://127.0.0.1:7890;
        proxy_set_header Host $host;
    }
}
server {
    listen 80;
    server_name livekit.example.com;
    location / {
        proxy_pass http://127.0.0.1:7880;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
    }
}
```

The example only shows **HTTP routing**; do not stop there. Issue certificates and redirect public traffic to HTTPS. Keep the admin dashboard on host loopback `127.0.0.1:7891`, not publicly exposed.

### 5. Start and check it

```sh
cd /opt/telium-sfu
sudo docker compose up -d
sudo docker compose ps
sudo docker compose logs --tail=100 sfu
curl -fsS https://sfu.example.com/health
sudo /opt/telium-sfu/update-sfu.sh --status
```

Expect `{"ok":true}`. Then make a real call: a healthy API does not mean UDP media reaches the host. The first-run admin link appears in container logs. To reach the loopback dashboard from your machine, use `ssh -L 7891:127.0.0.1:7891 operator@host` and open the local URL shown by the setup output.

### 6. List it for other communities (public relays only)

Only for public relays: visit [telium.chat/list](https://telium.chat/list), choose **A relay (SFU)** and submit `https://sfu.example.com`. A directory listing and opting into automatic selection are separate decisions, subject to the [directory rules](https://github.com/telium-chat/telium/blob/main/site/registry/README.md).

## Quick troubleshooting

| Problem | Check |
| --- | --- |
| Wrong installer asks for an account domain | Use `deploy/install-sfu.sh`, not the homeserver installer |
| Healthy API but no media | UDP mapping in Docker, port range in config and cloud firewall |
| `/session` returns 403 | `trust.public` and `trust.origins` |
| First-run admin setup unreachable | SSH tunnel to 7891 and setup URL in logs |
| Public calls exceed the budget | Transfer limit, accounting window and the host's actual bandwidth allocation |

For private relays, there is no need to list anything publicly.