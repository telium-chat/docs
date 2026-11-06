---
title: Stability
description: Telium is alpha. What that means for your data, config and federation, and what the later stages promise.
sidebar:
  order: 4
---

Telium is at release stage **alpha**, protocol version **1 (provisional)**. The protocol is not frozen.

## What this means for you

**Just using Telium?** Expect the client to change, and understand that an operator may need to update the server before older clients can connect. Keep your account recovery material safe. Don't treat an experimental service as your only copy of important files.

**Running a private home?** Preserve the database, server keys, media and a working backup-decryption key. A server update can include a one-way database migration.

**Hosting strangers?** Do not promise uninterrupted service or permanent attachment storage while the software is still alpha. Publish your [media retention policy](/self-hosting/public-server/#2-set-file-sizes-quotas-and-retention), verify offsite restores and give users a way to reach you about outages.

:::caution
Expect breaking changes. Keep backups, and test that you can restore them. See [Backups](/self-hosting/backups/).
:::

## What may break in alpha

- **Data:** the database schema changes between releases. Migrations run forward only.
- **Config:** keys may be renamed or removed. Run `telium-server check` after each upgrade.
- **Wire format:** server-to-server, gateway and signed-document formats may change between releases.
- **Clients:** an older client may be told to update when it meets a newer server. The client shows the server's reason and an update banner.

## Upgrades and downgrades

Schema changes are forward-only. A server binary refuses to open a database written by a newer release, so you cannot downgrade across a migration. The way back is the backup you took before upgrading. See [Upgrades](/self-hosting/upgrades/).

Keys and MLS state have no other copy. The project treats losing them as unacceptable at every stage, alpha included.

## Stages

| Stage | Promise |
| --- | --- |
| Alpha | It runs. Data, config and wire format may change without notice. |
| Beta | Following the documented procedures, you can run, upgrade and recover your data. |
| Stable | Breaking changes come with notice, security fixes on a timetable, and a published support window. |
| Protocol v1 stable | Version 1 wire bytes are frozen. Later changes follow the compatible-change rules. |

Compatible and incompatible wire changes are defined in [Compatibility](/reference/compatibility/).
