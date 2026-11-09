---
title: Standalone SFU with Docker
description: Run a public Telium voice relay without a homeserver, and learn how to isolate multiple relay containers.
sidebar:
  order: 8
---

**You do not need a Telium homeserver to run an SFU.** A standalone SFU is one container that runs `telium-sfu` **and** its own LiveKit process. It can carry calls for many different Telium homeservers.

This guide is for people donating public voice capacity. To run a homeserver *with* an optional SFU, use [Install with Compose](/self-hosting/install-docker/) instead. To understand private versus public relays, see [SFU](/self-hosting/sfu/).

## Run one standalone public SFU

The supported installer sets up **one Docker SFU per machine**, including its own update timer. Start here even if you plan to run more instances later.

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

This is **not** `deploy/standalone/install.sh` (the homeserver kit). The SFU installer creates `/opt/telium-sfu/compose.yml`, `/opt/telium-sfu/sfu.toml`, and the `telium-sfu-update.timer` update service. It **does not start an unconfigured container** and it does not install/configure the host's TLS proxy.

Run it with `sudo` from an ordinary login account. It needs Docker, the Compose plugin, and systemd already installed. For a root-only environment, create an ordinary operator account and pass it as `TELIUM_RUN_AS`.

### 3. Configure the public relay

Edit `/opt/telium-sfu/sfu.toml`:

```toml
[livekit]
# Keep spawn mode and the internal LiveKit URL from the generated file.
public_url = "https://livekit.example.com"

[trust]
discovery = true
public = true
allow_insecure_discovery = false
```

**Edit the existing sections; do not append duplicate TOML tables.** Keep the generated `bind = "0.0.0.0:7890"` and `[admin] bind = "0.0.0.0:7891"` *inside the container*; the Compose port mappings expose them to the host only on loopback. Keep `livekit.rtc.use_external_ip = true` behind Docker NAT. Keep the generated LiveKit configuration and admin state isolated in each instance's data volume; the SFU writes LiveKit credentials at startup. Do not copy its generated `livekit.yaml` between instances.

Public trust means any real Telium guild server with valid published keys may request sessions. Do not set `allow_insecure_discovery` to `true` on a public relay.

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

### 6. List it for other communities

Open [telium.chat/list](https://telium.chat/list), choose **A relay (SFU)**, and submit the public HTTPS URL `https://sfu.example.com`. The directory probes `/health` and asks for contact/region/capacity details.

Being in the public directory and **opting into automatic selection** are separate choices. If you want it considered for the automatic SFU feed, opt in there as well; eligibility still depends on observed health and age. See the [directory rules](https://github.com/telium-chat/telium/blob/main/site/registry/README.md#relays-sfus-are-a-separate-directory-with-the-same-rules).

## Run multiple SFU containers on one host

**The installer itself is single-instance.** It hardcodes `/opt/telium-sfu` and one systemd updater, and the stock Compose file has a fixed project name and published ports. **Do not rerun the installer or use `docker compose up --scale sfu=N` to create a fleet.** Those containers would contend for ports/state.

You can operate additional instances as **separate Compose projects**, but this is a *manual* deployment path. Each must have its own:

- Compose project name, working directory, `sfu.toml`, and persistent `sfu-data` volume.
- Public SFU hostname and LiveKit signalling hostname; separate reverse-proxy upstreams.
- Published TCP fallback port, TURN UDP port, and **non-overlapping UDP RTC port range**. Media ports must match the ports configured *inside* LiveKit, not merely be remapped on the Docker host.
- Join/transfer ceilings, health monitoring, drain and update procedure.

### Example: a second instance

First adjust **the original** relay's RTC range in both `/opt/telium-sfu/sfu.toml` and `/opt/telium-sfu/compose.yml` from `50000–60000` to `50000–50999`, then recreate the original relay during a maintenance window. These illustrative 1,000-port ranges are **not a capacity recommendation**; choose ranges large enough for your real simultaneous peer load.

Create a second working directory using the *configuration files*, not the first instance's generated runtime state:

```sh
sudo mkdir -p /opt/telium-sfu-b
sudo cp /opt/telium-sfu/compose.yml /opt/telium-sfu-b/compose.yml
sudo cp /opt/telium-sfu/sfu.toml /opt/telium-sfu-b/sfu.toml
```

In `/opt/telium-sfu-b/compose.yml` change `name: telium-sfu` to `name: telium-sfu-b` and replace the `ports:` block for service `sfu` with:

```yaml
ports:
  - "127.0.0.1:7990:7890"
  - "127.0.0.1:7991:7891"
  - "127.0.0.1:7980:7880"
  - "7981:7981"
  - "3479:3479/udp"
  - "51000-51999:51000-51999/udp"
```

In `/opt/telium-sfu-b/sfu.toml` retain the existing config and edit its *existing* fields:

```toml
[livekit]
public_url = "https://livekit-b.example.com"

[livekit.rtc]
port_range_start = 51000
port_range_end = 51999
tcp_port = 7981
use_external_ip = true

[livekit.turn]
enabled = true
udp_port = 3479
```

Keep `bind` and `admin.bind` on their container ports (`0.0.0.0:7890` and `0.0.0.0:7891`). The second instance's private LiveKit API URL stays `http://127.0.0.1:7880` because it is inside **its own** container. Set the second public SFU hostname (for example `sfu-b.example.com`) on the host's reverse proxy to `127.0.0.1:7990`, and `livekit-b.example.com` to `127.0.0.1:7980` with WebSocket support and TLS. Open its TCP `7981`, UDP `3479`, and UDP `51000–51999` to the internet. Repeat with **new non-overlapping ports and names** for further instances.

```sh
cd /opt/telium-sfu-b
sudo docker compose config           # inspect the final mapped ports/project
sudo docker compose up -d
sudo docker compose logs --tail=100 sfu
curl -fsS https://sfu-b.example.com/health
```

Each project owns its own `sfu-data` named volume, so runtime configuration, admin state and usage records remain independent. Never share those volumes, copy `livekit.yaml` or expose their admin ports publicly. Give each public relay its own directory listing.

### Updates for a multi-instance host

The **installed** `telium-sfu-update.timer` only manages `/opt/telium-sfu`. It does **not** update extra projects such as `/opt/telium-sfu-b`. Do not point two updaters at the same path or assume the single-instance script supports a configurable prefix.

For additional instances, schedule and supervise **separate manual** image updates: pull the new release, signal that relay to drain (`SIGUSR1`), check its own loopback `/health` until `accepting:false` and `rooms:0`, and only then recreate that project's container. For example, for the second relay:

```sh
cd /opt/telium-sfu-b
sudo docker compose pull sfu
cid="$(sudo docker compose ps -q sfu)"
sudo docker kill --signal=USR1 "$cid"
# Check http://127.0.0.1:7990/health until accepting=false and rooms=0.
# If the drain times out, active calls can be interrupted; postpone if possible.
sudo docker compose up -d sfu
```

The drain expires automatically after its configured timeout; don't let an unattended update wait forever or restart a busy relay unexpectedly. Review release notes and inspect the shipped Compose changes yourself: extra projects are not covered by the default installer's three-way Compose reconciliation.

:::caution[One host is still one failure domain]
Several containers on one machine **do not add bandwidth, create geographic redundancy, or protect against that machine going offline**. They all share its uplink and CPU. For a large public fleet, consider **one SFU per host/region** first: it uses the tested single-instance installer, separate update timers and real failure isolation.
:::

## Quick troubleshooting

| Symptom | Check |
| --- | --- |
| Installer wants a Telium account domain | You used the homeserver Compose installer. Use `deploy/install-sfu.sh`. |
| `/health` works, but calls have no media | Check UDP RTC and TURN ranges in both Docker mappings **and** `sfu.toml`, plus provider firewalls; verify public DNS is not proxied. |
| Docker reports a port already allocated | Two projects published an overlapping host port or RTC range. |
| A second stack replaces the first | Both Compose files use the same `name:` or you reused its data volume. |
| Public calls get `403` | Set `[trust] public = true` (keeping secure discovery) and confirm the requesting guild server publishes valid keys. |
| Dashboard says it cannot configure nginx | That wizard is native-only. Configure host TLS/proxy yourself. |
| An extra container is not auto-updating | Only the single installer-managed project has the default systemd timer. |
