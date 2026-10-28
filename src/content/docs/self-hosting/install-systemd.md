---
title: Install natively
description: One static binary, one config file and a systemd unit — from nothing to a running homeserver.
sidebar:
  order: 2
---

The recommended install. Telium is a single static binary with a SQLite database, so there is nothing else to install and no container runtime to maintain. This page takes a fresh box to a server running on `127.0.0.1:8448` with automatic updates enabled; the public side is [Exposing your server](/self-hosting/exposing/).

## What you need

- A Linux box with systemd, `curl`, `tar` and `sha256sum` (a small VPS is plenty)
- A domain whose DNS will point at it
- sudo

## One command

```sh
git clone https://github.com/telium-chat/telium.git
cd telium
sudo ./deploy/install-native.sh chat.example.com
```

The script downloads the current release from the rolling `server-latest` tag, checks it against the sha256 the release publishes, creates the `telium` user and its directories, writes `/etc/telium/telium.toml` from your domain, installs the unit and the update timer, and starts the server. It prints the three things only a human can do: DNS, TLS, and registering your account.

It is safe to run again. What is ours — the binary, the units, the updater — is replaced each run, which is how it upgrades; what is yours — `telium.toml`, `update.conf`, the data — is created once and never touched.

## By hand

The script is the commands below, in order. Reading them is a fair way to check what it does.

```sh
# The release. Also published as server-v<version>; verify against the
# SHA256SUMS-server published beside it.
curl -fsSLO https://github.com/telium-chat/telium/releases/download/server-latest/telium-server-linux-x86_64.tar.gz
tar -xzf telium-server-linux-x86_64.tar.gz            # telium-server, telium.example.toml
install -Dm755 telium-server /usr/local/bin/telium-server

# User, paths, config
useradd --system --home-dir /var/lib/telium --shell /usr/sbin/nologin telium
install -d -o telium -g telium -m 750 /var/lib/telium
install -d -o telium -g telium -m 700 /var/backups/telium
install -d -m 755 /etc/telium
```

Write `/etc/telium/telium.toml` (mode 600, owned by `telium`) — every value is derived from your domain:

```toml
server_name = "chat.example.com"
public_base_url = "https://chat.example.com"
bind = "127.0.0.1:8448"
database_url = "sqlite:///var/lib/telium/telium.db?mode=rwc"
media_dir = "/var/lib/telium/media"

[rate_limit]
trusted_proxies = ["127.0.0.1"]

[backup]
dir = "/var/backups/telium/archives"
key_file = "/var/backups/telium/backup.key"
```

Everything not listed keeps its compiled-in default; `telium.example.toml` in the release annotates all of it.

```sh
# Units and the updater
install -Dm644 deploy/telium-server.service /etc/systemd/system/
install -Dm755 deploy/update-native.sh /usr/local/sbin/telium-update-native
install -Dm644 deploy/telium-update-native.service deploy/telium-update-native.timer /etc/systemd/system/
systemctl daemon-reload
systemctl enable --now telium-server.service telium-update-native.timer
```

The unit drops all capabilities, keeps the filesystem read-only apart from the data and backup directories, runs `telium-server check` as `ExecStartPre` and restarts on failure. The updater replaces the binary when the release channel moves; pins and maintenance windows are in [Updates](/self-hosting/updates/).

## Verify

```sh
curl -fsS http://127.0.0.1:8448/_telium/v1/health
```

Then put TLS in front ([Exposing your server](/self-hosting/exposing/)), and from another machine:

```sh
curl -fsS https://chat.example.com/.well-known/telium/server
curl -fsS https://chat.example.com/_telium/v1/capabilities
```

## Storage

| Path | Holds | Notes |
|---|---|---|
| `/var/lib/telium` | database, media, cold archive | The data. |
| `/var/backups/telium` | archives, backup key | On a different mount from the data if you can. |
| `/etc/telium/telium.toml` | config | Mode 600. |

See [Backups](/self-hosting/backups/) for what the archives protect against, and [Secrets](/self-hosting/secrets/) for `"${env:NAME}"` / `"${file:…}"` in the config.

## Troubleshooting

| Symptom | Check |
|---|---|
| The unit will not start | `journalctl -u telium-server -n 50`; `ExecStartPre` runs `check`, and a danger finding stops it |
| Clients cannot connect | `public_base_url`, HTTPS, and WebSocket forwarding — see [Exposing your server](/self-hosting/exposing/) |
| Every user shares one rate limit | the proxy is missing from `rate_limit.trusted_proxies` |
| The updater says "not in the release manifest" | the binary was not installed from a release build |
