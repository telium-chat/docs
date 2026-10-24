---
title: Stability
description: Telium is alpha. What that means for your data, config and federation, and what the later stages promise.
sidebar:
  order: 4
---

Telium is at release stage **alpha**, protocol version **1 (provisional)**. The protocol is not frozen.

:::caution
Expect breaking changes. Keep backups, and test that you can restore them. See [Backups](/docs/self-hosting/backups/).
:::

## What may break in alpha

- **Data:** the database schema changes between releases. Migrations run forward only.
- **Config:** keys may be renamed or removed. Run `telium-server check` after each upgrade.
- **Wire format:** server-to-server, gateway and signed-document formats may change between releases.
- **Clients:** an older client may be told to update when it meets a newer server. The client shows the server's reason and an update banner.

## Upgrades and downgrades

Schema changes are forward-only. A server binary refuses to open a database written by a newer release, so you cannot downgrade across a migration. The way back is the backup you took before upgrading. See [Upgrades](/docs/self-hosting/upgrades/).

Keys and MLS state have no other copy. The project treats losing them as unacceptable at every stage, alpha included.

## Stages

| Stage | Promise |
| --- | --- |
| Alpha | It runs. Data, config and wire format may change without notice. |
| Beta | Following the documented procedures, you can run, upgrade and recover your data. |
| Stable | Breaking changes come with notice, security fixes on a timetable, and a published support window. |
| Protocol v1 stable | Version 1 wire bytes are frozen. Later changes follow the compatible-change rules. |

Compatible and incompatible wire changes are defined in [Compatibility](/docs/reference/compatibility/).
