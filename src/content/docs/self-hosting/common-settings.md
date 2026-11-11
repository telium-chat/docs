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
max_expiry_secs = "30d"
default_expiry_secs = "30d"
attachment_max_age_days = "30d"
```

This is **an example**, not Telium's default. It allows a stored-file quota of 1 GiB per account, single files up to 50 MiB, and 30-day attachment expiry. Users must know that old attachments may disappear even while their messages remain.

Your proxy or tunnel may impose a **smaller** upload limit. See [Store files in S3](/self-hosting/s3-media-storage/) if VPS disk space is the issue, or [Media policy reference](/self-hosting/configuration/#media-policy/) for all options.

## Backups

Your installer configures the local backup paths, but **you still need to save the backup key and actual archives off the host**. Decryption isn't possible without the key, and a second folder on the same VPS isn't disaster recovery.

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