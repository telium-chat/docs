---
title: After installing a homeserver
description: Verify your account, access, backups and updates before inviting people.
sidebar:
  order: 6
---

Your installer has started Telium. Do these checks before depending on it.

## First 10 minutes

1. **Check public discovery.** From another machine run `curl -fsS https://YOUR-API-HOST/.well-known/telium/server`. It must return your intended account domain and API URL. See [DNS and HTTPS](/self-hosting/exposing/).
2. **Create an account** through [telium.chat](https://telium.chat), choosing your server. If registration is private, enter the one-time code from the installer.
3. **Confirm you're an administrator.** The **native** installer deliberately does *not* grant the first signup admin access. On that machine, run the `admin recover` command printed by the installer. Don't assume registration makes you an admin.
4. Open **User Settings → Control plane** in the client to check server administration.
5. **Check registration policy** in [Common settings](/self-hosting/common-settings/) and `telium.toml`: `[registration] open = false` allows new accounts with valid codes; `true` allows open signup. Keep it closed unless you intend to accept strangers.

## Protect the data

| Check | Where to go |
| --- | --- |
| Save the backup encryption key **off the server**, along with a usable copy of your archives | [Backups and restore drill](/self-hosting/backups/) |
| Verify the updater timer and recent results; don't rely only on a healthy server process | [Updates](/self-hosting/updates/) |
| Secure your account recovery key and add a second administrator if appropriate | [Server administrators](/self-hosting/server-ownership/) |
| Choose upload size, quota, expiry and backup storage you can afford | [Configuration](/self-hosting/configuration/#media-policy) and [S3 uploads](/self-hosting/s3-media-storage/) |

On native Linux, check `systemctl status telium-update-native.timer`. On Compose, check `systemctl status telium-update.timer`. Use the status commands in [Updates](/self-hosting/updates/) if anything is unclear.

## Test it like a user

From another device, sign in, create a community, send a message, upload and download a file, and try a call. If possible, invite a user from a **different** homeserver to verify federation. [Troubleshooting](/start/getting-help/) explains what to include in a report.

Voice works without a locally installed SFU for suitable small calls; larger calls need an available relay. [SFU setup](/self-hosting/sfu/) explains private and public relay options.

## Before you welcome strangers

Read [Run a public homeserver](/self-hosting/public-server/). In particular, configure storage limits, publish a working abuse contact, plan moderation and test registration as a new user.

## Want to help grow the network?

The [public homeserver directory](/federation/onboarding/) and the [public SFU directory](/self-hosting/sfu-docker/#6-list-it-for-other-communities-public-relays-only) are separate. Listing your homeserver does **not** enroll you in automatic signup recommendations.

## Ongoing checks

Review backups, restore tests, updates, disk usage, reports, public discovery and sign-in after upgrades. When something breaks, start with [Disaster recovery](/self-hosting/disaster-recovery/).