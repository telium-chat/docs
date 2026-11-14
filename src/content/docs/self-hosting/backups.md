---
title: Backups
description: Configure Telium's encrypted scheduled backups, copy them off the box, verify them and restore from them.
sidebar:
  order: 9
---

**Do this first:** copy your backup encryption key off the server, then copy at least one backup off the server and test a restore. An archive without its key cannot be recovered.

1. Check the configured backup directory and key location.
2. Confirm scheduled backups are succeeding.
3. Run a verification and a restore drill before trusting the archive.

This page is the detailed backup and restore reference. If you just installed Telium, start with [After setup](/self-hosting/after-setup/).

## What an archive holds

One run writes one file, `telium-<unix-ms>.tbk`, to `backup.dir`, sealed with AES-256-GCM.

| Part | Source | Notes |
|---|---|---|
| `database` | `VACUUM INTO` snapshot of `database_url` | One consistent instant, taken while the server keeps serving. Includes database-held secrets such as the federation signing keys, the OPAQUE setup and the VAPID key. |
| `cold` | `[archive] dir` | Archived history segments, if present. |
| `media` | `media_dir` | Attachments, avatars, emoji, stickers, as chosen by [`media_mode`](#choosing-what-media-to-back-up). `cache/` and `camo/` are never included; they are re-fetched on demand. |

Not included: the config file, TLS certificates, the backup key itself, and media or cold segments stored in S3 (`[media_store]` or `[archive] store = "s3"`). The archive manifest lists S3-held parts under `excluded`, and `verify` and the drill report them.

:::caution
Do not back up by copying `telium.db` out of a running server. The database runs in WAL mode, so the `.db` file alone misses recent writes and copying `.db`, `-wal` and `-shm` separately captures three different moments. Use the built-in backup.
:::

## Choosing what media to back up

`media_mode` decides how much of `media_dir` goes into each archive:

| Mode | Adds to the database and cold history |
|---|---|
| `all` (default) | Every local media file: attachments, videos, avatars, banners, guild icons, emoji and stickers. |
| `profile_assets` | Only avatars, banners, guild icons, emoji and stickers that are still in use. Attachments are left out. |
| `none` | No media. |

Every run copies the selected media in full; archives are not incremental. With `all`, each archive you keep is roughly the size of your media directory again, so a server with a lot of uploads can spend more disk on backups than on live files.

`profile_assets` keeps what people would notice missing after a restore (who they are and how their guilds look) at a fraction of the size. The cost is that **attachments cannot be restored**: messages come back, but their files return 404. If you choose it, say so wherever you describe your retention policy, or back up attachments some other way. The manifest records the exclusion, and `verify` and the drill report it.

The older `include_media = true` / `false` still works and means `all` / `none`, with a deprecation warning at startup. Setting both `include_media` and `media_mode` is an error.

### Disk space while a backup runs

An archive is built on local disk before anything is uploaded, so turning on `[backup.remote]` does not remove the need for local space. During a run the database snapshot, the compressed payload and the encrypted archive can all exist at once, on top of the archives you already keep.

`min_free_bytes` sets a floor of free space on the backup filesystem. The server checks it before starting and while writing, and stops the run with an error instead of eating into the floor. Earlier archives are not pruned when a run fails. This is best-effort: other processes can still fill the disk, so keep monitoring free space.

## Configuration

Local backups work on their own, with no bucket or S3 account. A small starting point:

```toml
[backup]
enabled = true
dir = "/var/backups/telium/archives"
key_file = "/var/backups/telium/backup.key"
interval_secs = "1d"           # once a day
keep = 2                       # local archives kept
stale_after_secs = "2d"        # warn when the newest copy is two days old
media_mode = "all"             # or "profile_assets" / "none"; see above
min_free_bytes = 0             # optional free-space floor, e.g. "10GiB"
drill = true
drill_interval_secs = "1d"
drill_stale_after_secs = "3d"
pre_migration_backup = true
require_backup_before_migration = false
```

Local archives live on the same machine as the server. They cover a bad upgrade, an accidental deletion or a corrupt database, but not losing the machine, so a long local history mostly costs disk. Two is a sensible minimum: with only one, a backup taken after something has gone wrong replaces your last good copy. The compiled-in defaults (every six hours, eight archives) are in [the configuration reference](/self-hosting/configuration/#backup).

### Copying archives off the machine

To survive losing the server or its disk, add an S3-compatible destination. Local and remote retention are set separately; keep at least two remote archives for the same reason as above.

```toml
[backup.remote]
enabled = true
endpoint = "https://s3.eu-west-1.amazonaws.com"
bucket = "chat-example-backups"
region = "eu-west-1"
prefix = ""                    # empty means telium/<server_name>/
access_key_id = "${file:/run/secrets/s3-id}"
secret_access_key = "${file:/run/secrets/s3-secret}"
path_style = true
keep = 7                       # archives kept in the bucket
timeout_secs = 60
```

`dir` and `key_file` default to paths next to the config. Point both at storage the data directory does not contain, and keep them together: archives that survive a lost volume are useless if the key went with it.

| Where | Survives |
|---|---|
| Inside the data volume | a corrupt file, nothing more |
| A separate mount or disk | losing the volume or disk |
| `[backup.remote]` | losing the machine |

### The key

`backup.key_file` holds 32 random bytes, base64. You get one in one of three ways:

- `telium-server backup keygen [path]` writes it with mode 0600 and refuses to overwrite an existing file.
- The server generates one at startup if backups are on and no key exists, and logs it at `ERROR`.
- `TELIUM_BACKUP_KEY` (base64 of 32 bytes) overrides the file.

`backup.previous_key_files` lists old keys that still open older archives. See [Secrets](/self-hosting/secrets/#backup-key) for rotation.

### Buckets

The credentials need `s3:PutObject`, `s3:GetObject`, `s3:DeleteObject` and `s3:ListBucket`. The server creates the bucket if a `HEAD` returns 404. Without delete permission, pruning fails and is logged, and you can use a bucket lifecycle rule instead.

| Provider | `endpoint` | `region` |
|---|---|---|
| AWS S3 | `https://s3.<region>.amazonaws.com` | the bucket's region |
| Cloudflare R2 | `https://<account-id>.r2.cloudflarestorage.com` | `auto` |
| MinIO | `http://minio.internal:9000` | `us-east-1`, with `path_style = true` |

Backblaze B2, Wasabi, DigitalOcean Spaces and other S3-compatible stores take their documented endpoint and region.

## Schedule

The server takes a backup every `interval_secs`. At startup it waits until the newest local archive is one interval old, or runs at once if there is none. Each run:

1. writes the archive to `dir` and prunes local archives beyond `keep`;
2. uploads it if the remote is on (multipart above 5 GiB), and prunes the bucket beyond `remote.keep`;
3. records the result in `dir/status.json`.

A failed upload keeps the local archive. Bucket requests make up to four attempts on 5xx, 429, timeouts and connection errors. Other errors fail at once.

A backup is **stale** when there is no local archive, when the newest is older than `stale_after_secs`, or when the remote is on and the newest successful upload is that old. Stale backups are logged at `ERROR` and shown in the admin console.

To take one by hand or from cron:

```sh
telium-server backup now     # exits non-zero if the upload failed
```

## Checking

```sh
telium-server backup list                  # local and remote archives with manifests
telium-server backup verify s3://latest    # decrypt and authenticate every byte, write nothing
```

`GET /_telium/v1/admin/status` reports the backup state:

```json
"backup": {
  "enabled": true,
  "age_ms": 1200000,
  "stale": false,
  "encrypted": true,
  "placement": "separate",
  "offsite": true,
  "key_stranded": false,
  "last_error": null,
  "remote": { "enabled": true, "age_ms": 1200400, "stale": false, "last_error": null }
}
```

- `placement` compares `backup.dir` with the database directory, `media_dir` and `[archive] dir`: `inside` (one contains the other), `same-device` (separate trees on one filesystem) or `separate`. The server logs `inside` with no remote at `ERROR`.
- `key_stranded` is true when the key is inside the data and the archives are not, so the archives would outlive a key nobody holds.

## Restore drill

`telium-server backup drill`, and the scheduler when `drill = true`, fetches the newest archive (remote first), decrypts it, opens the database in a scratch directory, runs `integrity_check`, and checks the schema version and the signing-key, push-key and auth rows. It deletes the scratch directory and exits non-zero on failure. The result is under `backup.drill` in `/admin/status`.

| Verdicts | `passed`, `failed`, `never-run`, `stale` (older than `drill_stale_after_secs`) |
|---|---|
| Failure stages | `no-key`, `fetch`, `cannot-decrypt` (wrong key), `corrupt` (try an older archive), `unpack`, `no-database`, `database-unopenable`, `integrity-failed`, `schema-too-new`, `migrations-incomplete`, `missing-signing-key`, `missing-push-key`, `missing-auth-secret` |

A pass does not prove the key exists off the box, that media restores correctly, or that you can rebuild the config, TLS and DNS.

## Restore

Stop the server first. You need the config, the key, and for `s3://` sources the bucket credentials.

```sh
telium-server restore s3://latest --yes
```

| Source | Meaning |
|---|---|
| `path/to/telium-….tbk` | That file |
| `latest` | Newest archive in `backup.dir` |
| `s3://latest` | Newest archive under the bucket prefix |
| `s3://telium-1789330805279.tbk` | That object under the prefix |
| `s3://telium/chat.example.com/telium-1789330805279.tbk` | That object by full key |

The restore:

1. Refuses if `<database>-wal` or `-shm` exists. The server is running or did not shut down cleanly; if it is stopped, those files belong to the old database and you can remove them.
2. Refuses if the database, media or cold directory has content, unless you pass `--yes`.
3. Refuses an archive whose schema is newer than the binary. Upgrade first. Older archives are migrated at next start.
4. Decrypts and authenticates everything into a staging directory beside the database. A failure here changes nothing.
5. Moves the existing database, media and cold directories aside as `<name>.pre-restore-<stamp>` and moves the restored parts into place Media and cold directories are only touched when the archive contains them, so restoring a `media_mode = "none"` archive leaves the existing media directory where it is.

Restoring a `profile_assets` archive replaces the whole media directory with the profile assets it holds. If the old directory still has attachments you want, copy them back from the `pre-restore` copy before deleting it.

Delete the `pre-restore` copies once the restored server checks out. `--key <file>` uses a key other than the configured one.

### With the container

```sh
docker compose -f /opt/telium/compose.yml stop server
docker compose -f /opt/telium/compose.yml run --rm --no-deps server restore latest --yes
docker compose -f /opt/telium/compose.yml start server
```

The entrypoint already passes `--config`. `--no-deps` keeps the tunnel container down.

### Onto a new machine

1. Install `telium-server` and write a config with the same `server_name`.
2. Put the saved key at `backup.key_file` (or in `TELIUM_BACKUP_KEY`) **before the first start**. A server that starts without a key generates a new one, and you then need `--key` to restore.
3. `telium-server restore s3://latest`.
4. Start the server. It applies any newer migrations.

The restored database carries the federation signing-key history. Do not create a new server identity because the hardware changed. Provision TLS certificates and other secrets kept outside the database separately.

## Before a migration

With `pre_migration_backup = true`, a start with pending migrations reuses a recent archive at the old schema or takes one first. If that fails, the server logs an `ERROR` and continues, or refuses to start when `require_backup_before_migration = true`. The result is recorded in `status.json` under `pre_migration`.

See [Upgrades](/self-hosting/upgrades/) and [Disaster recovery](/self-hosting/disaster-recovery/).
