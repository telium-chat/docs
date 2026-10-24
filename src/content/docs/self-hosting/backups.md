---
title: Backups
description: Configure Telium's encrypted scheduled backups, copy them off the box, verify them and restore from them.
sidebar:
  order: 5
---

The server takes encrypted backups on a schedule, can copy them to an S3-compatible bucket, rehearses a restore daily, and restores with one command. This page covers configuration, checking, restoring and the restore drill.

:::danger
Copy the backup key somewhere other than the server today: a password manager, another machine, or paper. Every archive is unreadable without it. The server logs an `ERROR` once, the first time it generates a key, and does not remind you again.
:::

## What an archive holds

One run writes one file, `telium-<unix-ms>.tbk`, to `backup.dir`, sealed with AES-256-GCM.

| Part | Source | Notes |
|---|---|---|
| `database` | `VACUUM INTO` snapshot of `database_url` | One consistent instant, taken while the server keeps serving. Includes database-held secrets such as the federation signing keys, the OPAQUE setup and the VAPID key. |
| `cold` | `[archive] dir` | Archived history segments, if present. |
| `media` | `media_dir` | Attachments, avatars, emoji, stickers. `include_media = false` leaves it out. `cache/` and `camo/` are never included; they are re-fetched on demand. |

Not included: the config file, TLS certificates, the backup key itself, and media or cold segments stored in S3 (`[media_store]` or `[archive] store = "s3"`). The archive manifest lists S3-held parts under `excluded`, and `verify` and the drill report them.

:::caution
Do not back up by copying `telium.db` out of a running server. The database runs in WAL mode, so the `.db` file alone misses recent writes and copying `.db`, `-wal` and `-shm` separately captures three different moments. Use the built-in backup.
:::

## Configuration

```toml
[backup]
enabled = true
dir = "/var/backups/telium/archives"
key_file = "/var/backups/telium/backup.key"
interval_secs = 21600          # every six hours
keep = 8                       # local archives kept
stale_after_secs = 172800      # warn when the newest copy is two days old
include_media = true
drill = true
drill_interval_secs = 86400
drill_stale_after_secs = 259200
pre_migration_backup = true
require_backup_before_migration = false

[backup.remote]
enabled = true
endpoint = "https://s3.eu-west-1.amazonaws.com"
bucket = "chat-example-backups"
region = "eu-west-1"
prefix = ""                    # empty means telium/<server_name>/
access_key_id = "${file:/run/secrets/s3-id}"
secret_access_key = "${file:/run/secrets/s3-secret}"
path_style = true
keep = 8                       # archives kept in the bucket
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

`backup.previous_key_files` lists old keys that still open older archives. See [Secrets](/docs/self-hosting/secrets/#backup-key) for rotation.

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
5. Moves the existing database, media and cold directories aside as `<name>.pre-restore-<stamp>` and moves the restored parts into place.

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

See [Upgrades](/docs/self-hosting/upgrades/) and [Disaster recovery](/docs/self-hosting/disaster-recovery/).
