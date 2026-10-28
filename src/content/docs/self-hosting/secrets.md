---
title: Secrets
description: Every long-lived secret a Telium deployment holds, where it lives, and how to rotate it.
sidebar:
  order: 8
---

This page lists the secrets a Telium deployment holds, where each one lives, and the rotation steps. It ends with what to do after a compromise.

:::danger
Two secrets cannot be recovered if lost. The **OPAQUE server setup** (in the database) protects every password, and the **backup encryption key** opens every archive. Keep a copy of both off the box, and keep the backup key apart from the archives.
:::

## Handling secrets

- Any string in `telium.toml` can be `"${file:/run/secrets/name}"` (preferred) or `"${env:NAME}"`. The reference must be the whole value. An unknown scheme or an unresolvable reference is fatal at startup.
- These environment variables override their config keys: `TELIUM_BACKUP_KEY`, `TELIUM_S3_ACCESS_KEY_ID`, `TELIUM_S3_SECRET_ACCESS_KEY`, `TELIUM_TURN_SECRET`, `TELIUM_METRICS_SCRAPE_TOKEN`, `TELIUM_METRICS_SCRAPE_TOKEN_PREVIOUS`.
- Startup refuses group- or world-writable config, database and key files, and warns with the `chmod` to run for readable ones.
- Startup refuses any value still equal to an example placeholder such as `change-me`, checked after substitution.
- The systemd unit can hand secrets over as files with `LoadCredential=`; Docker secrets work the same way.

The database holds the federation signing key, the OPAQUE setup, the VAPID key and sealed MFA secrets. Every backup, replica and standby carries them, so treat anyone who can decrypt a backup as holding them too.

## Inventory

### Server identity

| Secret | Location | Rotation |
|---|---|---|
| Federation signing key | `server_keys` (database) | `keys rotate`, restart, later `keys forget-expired`. After theft: `keys rotate --compromised`. |
| Relocation successor keys | `server_keys` rows with a domain | Re-run relocation. `forget-expired` leaves them alone. |
| Media curator key | `media_curator_key` | Built-in staged rotation (`POST /_telium/v1/admin/media/curator-key/rotate`). |
| Hosting publisher key | `hosting_catalog_key` | Not rotatable. |
| VAPID push identity | `vapid_key` | Delete the row and restart. Clients re-subscribe. |

### Authentication

| Secret | Location | Rotation |
|---|---|---|
| OPAQUE server setup | `opaque_server_state` | **Cannot be rotated.** Losing it breaks every password. |
| MFA encryption key | `mfa.key_file` | See [MFA key](#mfa-key). Keep it out of the backup archive. |
| Per-user MFA secrets | `accounts.mfa_sealed` | `mfa reset-all --reason "…" --yes` forces re-enrolment. |
| Bot credentials | `bot_credentials` (hash only) | Issue a new credential, then revoke the old one. |

### Data at rest

| Secret | Location | Rotation |
|---|---|---|
| Backup encryption key | `backup.key_file` or `TELIUM_BACKUP_KEY` | See [Backup key](#backup-key). |
| Per-user escrow keys | `key_vault` | Not operator-rotatable. |
| Cross-signing sealed secrets | `cross_signing` | Sealed to the user; the server cannot open them. The user re-enrols from a device. |

### Third-party and peer credentials

| Secret | Location | Rotation |
|---|---|---|
| TURN shared secret | `voice.turn_secret` / `TELIUM_TURN_SECRET` | Must match coturn's `static-auth-secret`. Change both, restart both. |
| Object-store credentials | `backup.remote`, `archive.s3`, `media_store.s3` or `TELIUM_S3_*` | New pair at the provider, update, restart, `backup now`, delete the old pair. |
| Metrics scrape token | `metrics.scrape_token` | See [Metrics scrape token](#metrics-scrape-token). |
| Mail webhook token | `mail.webhook_token` | Change here and at the receiver. |
| FCM service account | `push.fcm.service_account_file` | New key in Google Cloud, replace the file, restart, delete the old key. |
| APNs signing key | `push.apns.key_file`, `push.apns.key_id` | New `.p8` at Apple, replace, restart, revoke the old one. Apple does not let you download it again. |
| Klipy API key | `klipy.api_key` | Public by design; clients receive it. Not a secret. |
| Release signing key | never on a homeserver | `updates.manifest_public_key` pins the public half. Repin when the project publishes a new key. See [Supply chain](/self-hosting/supply-chain/). |
| SFU LiveKit key and secret | `livekit.api_key`, `livekit.api_secret` in `sfu.toml` | In spawn mode, clear both and restart the SFU to regenerate. |

## Rotating

Do not rotate the OPAQUE setup, and do not delete an old backup key while archives sealed under it are still within `backup.keep`. Take and check a backup first:

```sh
telium-server backup now
telium-server backup drill
```

### Federation signing key

```sh
telium-server keys rotate     # new key; the old one stays published for its window
# restart the server
telium-server keys list
telium-server keys forget-expired   # after sessions.signing_key_validity_secs (90 days)
```

`keys rotate --compromised` closes the old key's window at once and invalidates every in-flight assertion signed with it. Use it only when you believe someone else has a copy.

### Backup key

Rotation is additive. Old archives are not re-sealed.

```sh
telium-server backup keygen /var/backups/telium/backup.key.new   # mode 0600, refuses to overwrite
```

```toml
[backup]
key_file = "/var/backups/telium/backup.key.new"
previous_key_files = ["/var/backups/telium/backup.key"]
```

Restart, then run `backup list` and `backup drill`. Copy the new key off the box. Remove the old one from `previous_key_files` once no archive within `backup.keep` (local and remote) uses it.

### MFA key

```sh
telium-server mfa keygen /etc/telium/mfa.key.2
# telium.toml: mfa.key_file = the new path, mfa.previous_key_files = [the old path]
systemctl restart telium-server
telium-server mfa rekey
# then empty mfa.previous_key_files and restart
```

`telium-server mfa status` shows how many accounts are enrolled and how many the current keys cannot open. If the key is gone, `mfa reset-all --reason "…" --yes` clears every enrolment and mails affected users who have a verified recovery address.

### Metrics scrape token

1. Put the old token in `scrape_token_previous` and the new one in `scrape_token`. Restart.
2. Point the scraper at the new token.
3. Clear `scrape_token_previous`. Restart.

A `previous` token with no current token is refused.

### Afterwards

```sh
telium-server check
telium-server rotations          # newest first; add a fragment such as `backup` to filter
```

Commands that rotate a secret write a record. Pass `--operator "<name>"` to say who did it; otherwise the record holds the uid and login name.

## After a database or disk compromise

```sh
telium-server keys rotate --compromised
telium-server admin list
telium-server admin claims
```

Then rotate the object-store credentials, the TURN secret and the mail webhook token, and start a new backup key (keep the old one for old archives). Run `mfa reset-all` if the MFA key was exposed too, or if the database was written by a build that stored second factors in the clear.
