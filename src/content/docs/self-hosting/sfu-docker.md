---
title: Standalone SFU with Docker
description: Install a dedicated Telium voice and video relay with Docker, for private communities or the public network.
sidebar:
  order: 8
---

This guide installs a **Telium voice and video relay** in Docker. An SFU carries the media for calls; it does not host accounts, messages or communities. You can run it on its own, even if you do not operate a Telium homeserver.

You decide who can use it: keep it **private** for homeservers you trust, or make it **public** so other Telium communities can use it. The steps below show how to make it public, but that is optional. For a plain-language explanation of how relays work, see [Voice relays (SFU)](/self-hosting/sfu/).

## Run one SFU with Docker

The installer puts the SFU and its LiveKit media engine in **one container**. The installer manages one SFU on the host and includes an update timer.

### 1. Prepare the host

You need a Linux host with Docker, Docker Compose v2, systemd, a public IP address and two DNS names, for example:

- `sfu.example.com` — Telium's HTTPS API (`/health` and `/session`).
- `livekit.example.com` — LiveKit signalling over HTTPS/WebSocket.

Point both DNS names at the host. If using Cloudflare, set **DNS only** (not proxied). Standard HTTP tunnels and reverse proxies cannot carry the UDP media.

Allow inbound TCP **80/443**, TCP **7881**, UDP **3478**, and UDP **50000–60000** in both the host firewall and cloud firewall. Keep the internal API (7890), LiveKit signalling (7880) and administration (7891) off the public internet; the supplied Compose file binds them to host loopback.

### 2. Install the dedicated SFU stack

```sh
git clone https://github.com/telium-chat/telium.git
cd telium
sudo bash deploy/install-sfu.sh
```

This installs **only the relay**, not a homeserver. The SFU installer creates `/opt/telium-sfu/compose.yml`, `/opt/telium-sfu/sfu.toml`, and the `telium-sfu-update.timer` update service. It **does not start an unconfigured container** and it does not install/configure the host's TLS proxy.

Run it with `sudo` from an ordinary login account. It needs Docker, the Compose plugin, and systemd already installed. For a root-only environment, create an ordinary operator account and pass it as `TELIUM_RUN_AS`.

### 3. Configure the relay

Edit `/opt/telium-sfu/sfu.toml`. This example allows **public use** of your SFU. If you want to serve only chosen homeservers, keep `public = false` instead and [configure trusted servers](/self-hosting/sfu/#private-and-public-relays).

```toml
[livekit]
# Keep spawn mode and the internal LiveKit URL from the generated file.
public_url = "https://livekit.example.com"

[trust]
discovery = true
public = true
allow_insecure_discovery = false
```

**Edit the existing sections; do not append duplicate TOML tables.** Keep the generated `bind = "0.0.0.0:7890"` and `[admin] bind = "0.0.0.0:7891"` *inside the container*; the Compose port mappings expose them to the host only on loopback. Keep `livekit.rtc.use_external_ip = true` behind Docker NAT. Keep the generated LiveKit configuration and admin state in the persistent data volume; the SFU writes LiveKit credentials at startup.

In public mode, any Telium homeserver with valid published signing keys can request sessions. In private mode, only homeservers you explicitly trust can do so. Never set `allow_insecure_discovery` to `true` on a public relay.

Before listing it, set suitable `[limits]` values in that same file. In particular, review `max_rooms`, `max_participants`, `transfer_budget_bytes` and `transfer_period_days`. A value of `0` means no ceiling/budget; it is **not** a safe bandwidth budget for a metered host. See [SFU configuration](/self-hosting/sfu/#configuration) and the [full reference](https://github.com/telium-chat/telium/blob/main/sfu/sfu.example.toml).

### 4. Provide HTTPS for both names

Install and configure a **host** reverse proxy such as nginx. The two upstreams are different:

| Public hostname | Host upstream | Role |
| --- | --- | --- |
| `sfu.example.com` | `http://127.0.0.1:7890` | SFU control API |
| `livekit.example.com` | `http://127.0.0.1:7880` | LiveKit signalling / WebSockets |

For example, these nginx HTTP virtual hosts can be used before issuing certificates:

```nginx
server {
    listen 80;
    server_name sfu.example.com;
    location / {
        proxy_pass http://127.0.0.1:7890;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-Proto $scheme;
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
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

Enable the host configuration, verify it with `sudo nginx -t`, and issue certificates for **both** names with your ACME client (for example Certbot's nginx plugin). HTTPS protects signalling, but clients reach LiveKit media directly through the public TCP/UDP ports—not through nginx or Cloudflare Tunnel. Do **not** publicly proxy the admin dashboard on port 7891.

### 5. Start and check it

```sh
cd /opt/telium-sfu
sudo docker compose up -d
sudo docker compose ps
sudo docker compose logs --tail=100 sfu
curl -fsS https://sfu.example.com/health
sudo /opt/telium-sfu/update-sfu.sh --status
```

Expect a healthy `/health` response with `"ok":true`. Check that the LiveKit hostname supports secure WebSockets and test a real call from two accounts: a working API alone does not prove the UDP media ports are reachable.

The SFU's admin first-run link appears in the container logs. Access the host-loopback dashboard over an SSH tunnel, for example `ssh -L 7891:127.0.0.1:7891 operator@your-host`, then open the local URL shown by the logs. Unlike the **native** SFU, the Compose dashboard cannot rewrite host nginx or request certificates for you.

### 6. List it for other communities (public relays only)

Skip this step if you are running a private relay. For a public relay, open [telium.chat/list](https://telium.chat/list), choose **A relay (SFU)**, and submit the public HTTPS URL `https://sfu.example.com`. The directory probes `/health` and asks for contact/region/capacity details.

Being in the public directory and **opting into automatic selection** are separate choices. If you want it considered for the automatic SFU feed, opt in there as well; eligibility still depends on observed health and age. See the [directory rules](https://github.com/telium-chat/telium/blob/main/site/registry/README.md#relays-sfus-are-a-separate-directory-with-the-same-rules).

## Quick troubleshooting

| Symptom | Check |
| --- | --- |
| Installer wants a Telium account domain | You used the homeserver Compose installer. Use `deploy/install-sfu.sh`. |
| `/health` works, but calls have no media | Check UDP RTC and TURN ranges in both Docker mappings **and** `sfu.toml`, plus provider firewalls; verify public DNS is not proxied. |
| Docker reports a port already allocated | Another service is already using a required host port. |
| Public calls get `403` | Set `[trust] public = true` (keeping secure discovery) and confirm the requesting guild server publishes valid keys. |
| Dashboard says it cannot configure nginx | That wizard is native-only. Configure host TLS/proxy yourself. |
