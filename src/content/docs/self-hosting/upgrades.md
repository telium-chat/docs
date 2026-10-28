---
title: Upgrades
description: Upgrade a Telium homeserver, what the downgrade guard refuses, and when you can roll back.
sidebar:
  order: 9
---

This page covers moving a homeserver to a new release and back. A newer binary migrates an older database forward at startup. An older binary refuses to open a newer database, names the release that wrote it, and exits.

## Versions

| Number | Tracks |
|---|---|
| Migration version | Table shape (`server/migrations/`) |
| State format version | The meaning of stored values |
| Protocol version | The wire format. See [Compatibility](/reference/compatibility/). |

The `schema_provenance` table records the highest migration and state format versions seen, plus the last release to open the database. The guard checks it before running migrations, on primaries and replicas alike, and refuses with one of two reasons:

| Reason | Meaning |
|---|---|
| `database_schema_is_newer` | A newer release applied migrations this binary does not have. |
| `database_state_format_is_newer` | A newer release changed how stored values are encoded. |

Releases can be skipped. Each upgrade path from a set of older schema versions to the current one is tested.

## Procedure

1. Take and check a backup. See [Backups](/self-hosting/backups/).

   ```sh
   telium-server backup now
   telium-server backup drill
   ```

2. Stop the server and start the new binary. Migrations run at startup. With `backup.pre_migration_backup = true` (the default) the server also takes an archive at the old schema first.
3. Check `GET /_telium/v1/admin/status`: `protocol` shows the supported protocol window and `incompatible_peers` counts peers outside it.

Peers upgrade on their own schedule. A peer still on the previous release shows as `ok` with no capabilities.

The container and native updaters run these steps for you. See [Updates](/self-hosting/updates/).

## Rollback

There are no down-migrations.

- If the release added no migrations and kept the state format, stop the server and start the old binary.
- Otherwise the old binary refuses to start. Restore the backup from step 1 with `telium-server restore <archive> --yes`. Anything written since the upgrade is lost.

## Config changes

New config keys default to the previous behaviour. Changed defaults and newly required keys are listed in the release notes, so read them before you upgrade. Run `telium-server check` against your config with the new binary before you restart.
