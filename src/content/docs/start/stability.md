---
title: Stability and alpha status
description: What Telium's alpha stage means for updates, recovery and compatibility.
sidebar:
  order: 4
---

**Telium is alpha software.** The protocol is still provisional; releases can change the client, server configuration, database format or federation behavior.

## What this means for you

| If you… | Do this |
| --- | --- |
| Use Telium | Save your account recovery information. Don't store the only copy of important files here. |
| Run a private homeserver | Keep off-host backups, the backup key and server identity material. Verify that you can restore them. |
| Run a public homeserver | Publish a clear [media retention policy](/self-hosting/public-server/#set-media-limits), monitor upgrades and give users an operator contact. |

## What may break in alpha

- **Database:** upgrades can migrate it forward. An older binary may refuse the newer schema.
- **Configuration:** settings may change; check the current release notes and validate your config.
- **Federation and clients:** older servers or clients may need updating to communicate with newer ones.

Before any risky upgrade, follow [Upgrades](/self-hosting/upgrades/) and [Backups](/self-hosting/backups/). Downgrading the binary alone will not reverse a database migration.

## Stages

Alpha has no fixed wire-compatibility promise. Beta is aimed at documented operation and recovery procedures. A stable release will need a published compatibility and support policy; don't assume those guarantees exist today. See [Protocol compatibility](/reference/compatibility/).