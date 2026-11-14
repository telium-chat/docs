---
title: Install natively
description: One static binary, one config file and a systemd unit — from nothing to a running homeserver.
sidebar:
  order: 2
---

The recommended install. Telium is a single static binary with a SQLite database, so there is nothing else to install and no container runtime to maintain. This page takes a fresh box to a server running on `127.0.0.1:8448` with automatic updates enabled; the public side is [Exposing your server](/self-hosting/exposing/).

:::tip[Already have a website on your domain?]
You can keep your existing website at `example.com` (on any hosting provider), run Telium at `chat.example.com`, and have user IDs like `@you:example.com`. Before anyone registers, follow [Using your website domain for accounts](#using-your-website-domain-for-accounts).
:::

## What you need

- A Linux box running systemd (a small VPS is plenty)
- A public hostname for the Telium HTTPS endpoint (for example, `chat.example.com`). Your account domain may stay on a separate website host.
- Root access, either through a root login or `sudo`. The installer works on root-only VPS images with no `sudo`.
- `curl` or `wget` to download the bootstrap; Git is **not** needed. On Debian/Ubuntu, the bootstrap installs missing server-side packages.

## Quick install (no Git needed)

From **any directory**, download the small bootstrap script and launch it with the domain:

```sh
curl -fsSLo /tmp/telium-native-setup.sh https://raw.githubusercontent.com/telium-chat/telium/main/deploy/bootstrap-native.sh
bash /tmp/telium-native-setup.sh chat.example.com
```

If you don't have `curl`, use `wget` for the download instead:

```sh
wget -qO /tmp/telium-native-setup.sh https://raw.githubusercontent.com/telium-chat/telium/main/deploy/bootstrap-native.sh
bash /tmp/telium-native-setup.sh chat.example.com
```

The bootstrap automatically uses `sudo` for ordinary users when available; if you're already root, no `sudo` command is needed. When neither `sudo` nor root privileges are available, ask the machine's administrator for access. If both `curl` and `wget` are missing on Debian/Ubuntu, run `apt-get update && apt-get install -y curl ca-certificates` **as root**, then use the first command above. Missing packages like `tar` and `sha256sum` are installed by the bootstrap on Debian/Ubuntu.

:::note[Checking the script before running it]
The bootstrap is [open-source shell code](https://github.com/telium-chat/telium/blob/main/deploy/bootstrap-native.sh). You can read the saved `/tmp/telium-native-setup.sh` file before executing it.
:::

The script downloads the current release from the rolling `server-latest` tag, checks it against the sha256 the release publishes, creates the `telium` user and its directories, writes `/etc/telium/telium.toml` from your domain, installs the unit and the update timer, and starts the server. It prints the three things only a human can do: DNS, TLS, and registering your account.

It is safe to run again. The installer preserves your server identity, configuration, data, and backup settings. It installs the updater and lets that updater manage binary upgrades and safe restarts.

### Storage and backup questions

On a first install, the script asks whether registration is open or closed, then walks through storage limits and backups. Press Enter to accept each suggestion or type your own value. It asks for:

- the upload policy (`quota`, `enabled` or `disabled`), the per-account allowance and the largest single file;
- a server-wide media limit and a free-space reserve for the media disk;
- how many days to keep attachments before deleting them;
- whether backups include attachments, how often they run, how many to keep, and a free-space reserve for the backup disk.

The size suggestions come from the free space it measures: a server-wide limit of about three quarters of the media disk, and a reserve of about a tenth of each disk. Per-account defaults are 1 GiB per account and 50 MiB per file.

Open and closed registration start from different suggestions:

| | Open registration | Closed registration |
|---|---|---|
| Attachment retention | 30 days, even if a message still uses the file | No forced deletion |
| Backups | Profile assets only (avatars, banners, guild icons, emoji, stickers); no attachments | All media |

If backups leave attachments out, they cannot be restored after a disk failure. The installer says so before you confirm; read [choosing what media to back up](/self-hosting/backups/#choosing-what-media-to-back-up) for the details. Either way, local archives are not an off-site copy: save the backup key elsewhere and set up [an off-site destination](/self-hosting/backups/#copying-archives-off-the-machine).

To run unattended, set `TELIUM_REGISTRATION=open` or `closed` (required when there is no terminal). Any question can be answered in advance with its variable: `TELIUM_MEDIA_POLICY`, `TELIUM_MEDIA_QUOTA`, `TELIUM_MEDIA_FILE_MAX`, `TELIUM_MEDIA_TOTAL`, `TELIUM_MEDIA_FREE_RESERVE`, `TELIUM_MEDIA_RETENTION_DAYS`, `TELIUM_BACKUP_MEDIA` (`yes`/`no`), `TELIUM_BACKUP_INTERVAL`, `TELIUM_BACKUP_KEEP` and `TELIUM_BACKUP_FREE_RESERVE`. Invalid values stop the install.

Re-running the installer on an existing server skips these questions and leaves `telium.toml` as it is.

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

Everything not listed keeps its compiled-in default; `telium.example.toml` in the release annotates all of it. The compiled-in defaults allow unlimited uploads, so if you install by hand, set the [media limits](/self-hosting/public-server/#2-set-file-sizes-quotas-and-retention) the installer would have asked about before inviting anyone.

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

## Using your website domain for accounts

Want your website at `example.com` (on any hosting provider), but your Telium server at `chat.example.com`? Your account addresses can still be `@you:example.com`.

1. **Run the installer with the account domain** so it creates the right long-term identity. Replace `example.com` with the real domain you own — the installer deliberately refuses example domains:

   ```sh
   bash /tmp/telium-native-setup.sh example.com
   ```

2. **Before registering any accounts**, edit `/etc/telium/telium.toml`:

   ```toml
   server_name = "example.com"
   public_base_url = "https://chat.example.com"
   ```

   Keep the database, `bind`, backups and other installed values as they were.

3. Set up DNS and HTTPS for **`chat.example.com`** to reach your Telium server. Keep **`example.com`** pointed at your website host, not at your Telium VPS. Apply the edit with `sudo systemctl restart telium-server`.
4. Put a one-line **`telium.txt`** file on your website with `chat.example.com` inside it, so clients entering `example.com` can find the server. Follow the [website-domain setup guide](/self-hosting/domain-delegation/) for file managers, manual uploads, Git and browser compatibility.

If you use this split setup, the installer's generic instruction to point the supplied domain at this box **does not apply to the website domain**. Your website keeps `example.com`; only the API hostname points to the Telium ingress. Both names must answer over HTTPS.

**Do not change `server_name` on an established server.** [Why the account domain matters](/self-hosting/domain-delegation/#how-it-works).

## Storage

| Path | Holds | Notes |
|---|---|---|
| `/var/lib/telium` | database, media, cold archive | The data. |
| `/var/backups/telium` | archives, backup key | On a different mount from the data if you can. |
| `/etc/telium/telium.toml` | config | Mode 600. |

**Optional: want attachments on remote storage instead of the VPS disk?** Follow [Store uploads in S3-compatible storage](/self-hosting/s3-media-storage/) after installing; this is separate from storing encrypted [backups](/self-hosting/backups/) off-box.

See [Backups](/self-hosting/backups/) for what the archives protect against, and [Secrets](/self-hosting/secrets/) for `"${env:NAME}"` / `"${file:…}"` in the config.

## Troubleshooting

| Symptom | Check |
|---|---|
| The unit will not start | `journalctl -u telium-server -n 50`; `ExecStartPre` runs `check`, and a danger finding stops it |
| Clients cannot connect | `public_base_url`, HTTPS, and WebSocket forwarding — see [Exposing your server](/self-hosting/exposing/) |
| Every user shares one rate limit | the proxy is missing from `rate_limit.trusted_proxies` |
| The updater says "not in the release manifest" | the binary was not installed from a release build |
