---
title: Install on Linux (systemd)
description: Install a Telium homeserver without Docker, then publish it over HTTPS.
sidebar:
  order: 2
---

**Use this for a Linux server with systemd.** The installer downloads a release, configures the service and its automatic updater, and starts the server on `127.0.0.1:8448`. You provide DNS and HTTPS afterward.

## Requirements

- Linux with systemd and root or sudo access
- A domain you control
- `curl` or `wget` to download the bootstrap

You do **not** need Git or a locally hosted web client.

## 1. Install

Run from any directory, replacing the domain:

```sh
curl -fsSLo /tmp/telium-native-setup.sh https://raw.githubusercontent.com/telium-chat/telium/main/deploy/bootstrap-native.sh
bash /tmp/telium-native-setup.sh chat.example.com
```

If you lack `curl`, use `wget -qO /tmp/telium-native-setup.sh URL` with the same URL, then run the script. You can review the saved script before executing it. The bootstrap installs missing packages on supported Debian/Ubuntu hosts.

**When prompted about registration**, choose **No** to require one-time codes, or **Yes** to allow anyone to register. A private install prints an initial registration code **once**. Save it.

The installer runs the server as the `telium` system user, installs the update timer, and leaves your config and data intact if rerun. It does not set up a public HTTPS proxy.

## 2. Set up DNS and HTTPS

Point the API hostname at the host. Follow [Expose a homeserver](/self-hosting/exposing/) to use Caddy, nginx or a tunnel. Then check:

```sh
curl -fsS http://127.0.0.1:8448/_telium/v1/health
curl -fsS https://chat.example.com/.well-known/telium/server
```

The second command must work **from another machine** before you try to sign in.

## 3. Register and become administrator

1. Open [telium.chat](https://telium.chat), select your server and register.
2. On a private install, enter the one-time code from the terminal.
3. **The native installer does not automatically make the first signup an administrator.** Run the recovery command printed by the installer, substituting your username:

```sh
cd /var/lib/telium
sudo -u telium /usr/local/bin/telium-server --config /etc/telium/telium.toml admin recover USERNAME --reason "Initial server owner"
```

If private registration's bootstrap code was lost or already used, generate a new code as the `telium` user:

```sh
cd /var/lib/telium
sudo -u telium /usr/local/bin/telium-server --config /etc/telium/telium.toml registration-code create
```

On a root-only machine without `sudo`, use `runuser -u telium --` instead. Don't enable public signups just to create an administrator.

## Using your website domain for accounts

To keep `example.com` as your website and use `@you:example.com` while serving the API from `chat.example.com`, **install with `example.com` as the identity**. Before creating accounts, edit:

```toml
server_name = "example.com"
public_base_url = "https://chat.example.com"
```

The file is `/etc/telium/telium.toml`. Restart with `sudo systemctl restart telium-server`, publish a [`telium.txt` pointer](/self-hosting/domain-delegation/) at your website, and point only `chat.example.com` at the Telium host. Don't change `server_name` after users register.

## Paths and troubleshooting

| Item | Location |
| --- | --- |
| Config | `/etc/telium/telium.toml` |
| Database and media | `/var/lib/telium` |
| Backup archives and key | `/var/backups/telium` |
| Server logs | `journalctl -u telium-server -n 100` |
| Update timer | `systemctl status telium-update-native.timer` |

If the service won't start, inspect its journal and run `telium-server check` with your config. If local health works but the public URL fails, start with [DNS, TLS and proxy forwarding](/self-hosting/exposing/). For manual installation, service templates and release verification, see [the deploy source](https://github.com/telium-chat/telium/tree/main/deploy).

**Next:** [After setup](/self-hosting/after-setup/).