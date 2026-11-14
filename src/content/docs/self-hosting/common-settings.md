---
title: Common homeserver settings
description: Copyable examples for accounts, uploads, backups and voice.
---

You can run a homeserver with the installer-generated configuration. Change the settings below only when you need them. For the exhaustive list and compiled defaults, see [Configuration reference](/self-hosting/configuration/).

## Find your configuration file

| Install | Config | Apply edits |
| --- | --- | --- |
| Native Linux | `/etc/telium/telium.toml` | `sudo systemctl restart telium-server` |
| Standalone or tunnel Compose | `/opt/telium/telium.toml` | `cd /opt/telium && sudo docker compose up -d --force-recreate server` |

Edit an **existing** TOML section instead of appending a duplicate. Take a copy before making changes. If an edit prevents startup, restore the previous configuration and inspect the service logs.

## Server name and public address

```toml
server_name = "chat.example.com"
public_base_url = "https://chat.example.com"
```

- `server_name` is the permanent account identity—the part after `:` in usernames. **Don't change it after registration** without a [relocation procedure](/self-hosting/relocation/).
- `public_base_url` is the externally reachable HTTPS API.
- To keep your website on `example.com` and run the API at `chat.example.com`, follow [Account-domain setup](/self-hosting/domain-delegation/) **before creating accounts**.

## Private or public signup

In your existing `[registration]` section:

```toml
[registration]
open = false
first_account_is_admin = false
admins = []
```

With `open = false`, a user needs a valid registration code; **a code never grants admin access**. Create and revoke invitation codes using the server CLI or admin control plane. On native installs, the first code comes from the installer, and you promote your administrator account **locally** with `admin recover`.

To let anyone create an account, set `open = true`. Leave `first_account_is_admin = false`, especially on a public service. The older Compose kits still use a legacy first-account bootstrap; claim your administrator account before advertising the service. Learn how to [prepare a public homeserver](/self-hosting/public-server/).

## File limits and expiry

For a public server, consider a starting policy such as:

```toml
[media_policy]
default = "quota"
quota_bytes = "1GiB"
max_file_bytes = "50MiB"
max_total_bytes = "150GiB"    # example for a disk with ~200 GiB free
min_free_bytes = "20GiB"      # reserve on the media filesystem
attachment_max_age_days = "30d"
```

This is **an example**, not Telium's default. It allows 1 GiB per account, files up to 50 MiB, and 30-day attachment expiry. The 150 GiB server-wide cap and 20 GiB free-space reserve assume a media disk with about 200 GiB available: **size them for your actual disk**. User quotas alone do not protect the whole host. Old attachments may disappear while their messages remain. See [server-wide limits](/self-hosting/public-server/#size-the-server-wide-limits).

Your proxy or tunnel may impose a **smaller** upload limit. See [Store files in S3](/self-hosting/s3-media-storage/) if VPS disk space is the issue, or [Media policy reference](/self-hosting/configuration/#media-policy) for all options.

## Backups

Your installer configures the local backup paths, but **you still need to save the backup key and actual archives off the host**. Decryption isn't possible without the key, and a second folder on the same VPS isn't disaster recovery.

Set `backup.media_mode` to `all` (every local media file), `profile_assets` (avatars, guild icons, banners, emoji and stickers, but **no attachments**), or `none`. `profile_assets` saves space but **attachments cannot be restored** from that backup. Set `backup.min_free_bytes` to keep a reserve on the backup filesystem. See [choosing what to back up](/self-hosting/backups/#choosing-what-media-to-back-up).

Follow [Backups](/self-hosting/backups/) to check the schedule, verify an archive and perform a restore drill. Don't edit key paths casually on a populated server.

## Voice relays

An SFU is optional for suitable small calls. If you run a trusted SFU, point your homeserver at it in an existing voice section:

```toml
[voice]
enabled = true
default_region = "local"

[[voice.regions]]
name = "local"
sfu = "https://sfu.example.com"
```

The SFU must trust the homeserver or run publicly. See [SFU setup](/self-hosting/sfu/) for trust, HTTPS, media ports and transfer limits.

## After changing settings

Restart or recreate the server using the table above. Check public discovery, sign-in, uploads and one sample call.

- Native logs: `journalctl -u telium-server -n 100`
- Compose logs: `cd /opt/telium && sudo docker compose logs --tail=100 server`

If you need settings not covered here, use [Configuration reference](/self-hosting/configuration/).