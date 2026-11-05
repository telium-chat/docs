---
title: After setting up your server
description: Your first account, signups, backups, updates, federation, media and public listings — in a practical post-install checklist.
sidebar:
  order: 6
---

Your Telium server is answering on its domain. **What should you do next?** This page is the short checklist for turning a successful install into a server you can actually use and maintain. You do not need to do everything today.

If you have not installed a server yet, start with [Running in production](/self-hosting/production/).

## First 10 minutes

- [ ] **Create your administrator account.** Open [telium.chat](https://telium.chat), select your server, and register an address such as `@you:chat.example.com`. **The first account on a fresh server becomes an administrator**, so register it before inviting anyone else.
- [ ] **Find the control plane.** In the client, open **User Settings → Control plane**. This is where server administrators can inspect the server, review accounts and moderation, and check storage and backups. A guild owner is not automatically a server administrator.
- [ ] **Decide who may sign up.** The default is open registration. If the server is just for you or a few invited people, close it after making your account:

  ```toml
  [registration]
  open = false
  ```

  Save `telium.toml` and restart the server. Native installations use `/etc/telium/telium.toml`; the Compose kits use `/opt/telium/telium.toml`. Leave registration open only if you intend to accept new accounts. Closing it does **not** remove existing accounts.

- [ ] **Try the client.** Sign in, create a guild (a community with text and voice channels), post a message, and invite a second test account. You can use the hosted client; you do **not** need to host a web app.

:::tip[Private server or public community server?]
For a personal or friends-only home server, it is fine to stop after the essentials below. Running a public account home adds responsibilities: abuse reports, storage, reliable contact information, and capacity for new users.
:::

## Protect the server before relying on it

### Backups you can actually recover

Telium has scheduled encrypted backups, but **a backup on the same disk is not disaster recovery**.

1. Find your backup encryption key and save a copy **off the server** (for example, in your password manager). Without it, archives cannot be opened.
2. Keep copies of the archives off the machine, ideally with an [S3-compatible remote backup](/self-hosting/backups/#buckets) or a separately maintained backup destination.
3. Inspect the backup state in the control plane. Run `telium-server backup list` and `telium-server backup drill` when you have shell access, and make sure the drill passes.
4. Know where your configuration and any secrets stored outside the database live: the [backup archive does not include them](/self-hosting/backups/#what-an-archive-holds).

See [Backups](/self-hosting/backups/) for the key, schedules, verification and restore commands, and [Disaster recovery](/self-hosting/disaster-recovery/) for emergency runbooks.

### Make sure updates are working

Both supported production installs enable an updater by default. **Do not assume it is healthy just because the server starts.**

| Install | Check it |
| --- | --- |
| Native systemd | `systemctl status telium-update-native.timer` and `update-native.sh --status` |
| Compose | `systemctl status telium-update.timer` and `/opt/telium/update.sh --status` |

Your update policy, pins and maintenance windows are in [Updates](/self-hosting/updates/). Since Telium is [alpha](/start/stability/), protocol changes can require coordinated updates. Investigate anything held for manual intervention instead of letting the installation drift.

### Give yourself a way back in

Consider adding a second trusted server administrator, securing recovery email for each admin, and removing any unclaimed names from `registration.admins`. An unclaimed name on that list grants administrator status **to whoever registers it first**.

See [Server administrators](/self-hosting/server-ownership/) and [Account security](/security/account-security/).

## Check the parts your users will notice

| Test | What success looks like | If it fails |
| --- | --- | --- |
| Public address | A different machine can fetch `https://chat.example.com/.well-known/telium/server` | [DNS, TLS and your reverse proxy](/self-hosting/exposing/) |
| Sign-in | Your own account can sign in from [telium.chat](https://telium.chat) | [Client connection problems](/start/clients/#connection-problems) |
| Guilds | You can create a guild and send a message | [Guilds](/features/guilds/) |
| Federation | An account on a different home server can reach an invited guild on yours | [Federation overview](/federation/overview/) |
| Calls | Two people can join a voice channel | [Voice and video](/features/voice-and-video/) |
| Files | You can attach and retrieve a small file, and the storage limit is what you intended | [Media](/features/media/) |

A small voice call works in peer-to-peer **mesh** mode without a media server. For larger calls, or to run your own relay, see [SFU](/self-hosting/sfu/). Cloudflare Tunnel can carry homeserver HTTP and WebSockets, **not** SFU media over UDP.

## Before you welcome strangers

### Choose your registration policy

A public server needs an explicit decision about who can create an account. Start closed while testing, open registration when you have the capacity and moderation process, and close it again if you are overwhelmed. The relevant switch is `registration.open` in [Configuration](/self-hosting/configuration/#registration).

### Decide what files you can afford to host

Messages and attachments have different storage costs. Before opening registration, review the [media policy and quota settings](/features/media/#media-policy): maximum upload size, per-user quota, accepted media types, upload expiry, and retention. These are operator decisions; don't assume the defaults fit a public server.

If you use a tunnel, remember that its provider may enforce a smaller upload limit than Telium itself. Monitor disk space and use the [storage and metrics tools](/self-hosting/observability/) as the server grows.

### Get ready to moderate

Learn the difference between **server administration** (accounts, storage, server-wide policy) and **guild moderation** (channels, roles, bans and community rules). Check the control plane's moderation and audit log panes, and give people a way to contact you about abuse or outages.

Start with [Guild permissions and moderation](/features/guilds/) and [Server administrators](/self-hosting/server-ownership/).

## Want to help grow the network?

There are **two separate ways** to contribute. Neither happens automatically when your server goes online.

| You want to… | What to do | Important distinction |
| --- | --- | --- |
| **Host accounts for other people** | Keep registration available when you are ready, and apply for the [public homeserver directory](/federation/onboarding/#directory-and-recommended-pool). | Being listed does **not** automatically place you in the recommended signup pool. The recommendation pool has extra opt-in, age, uptime and health requirements. |
| **Host voice calls** | [Install an SFU](/self-hosting/sfu/) and add your homeserver to its trusted list. | An SFU can stay **private**, serving only homeservers you trust. Set public mode only if you want other operators to use its capacity. |

For an account-home listing, the directory is backed by [`site/registry/servers.json`](https://github.com/telium-chat/telium/blob/main/site/registry/servers.json). Follow the [onboarding checklist and eligibility rules](/federation/onboarding/#opting-in) before opting into recommendations. You can be listed without accepting automatic beginner referrals.

If you want to offer shared SFU capacity, plan limits and monitoring before you enable public trust. Publishing a public URL is not the same as committing to serve everyone.

## A simple ongoing routine

- **After changes:** Test sign-in, public discovery and a guild message.
- **Regularly:** Check the control plane, backup freshness, successful restore drills, updater status, disk usage and reports.
- **Before planned downtime:** Read [Updates](/self-hosting/updates/) and [Upgrades](/self-hosting/upgrades/); announce interruptions if people rely on your server.
- **If anything breaks:** Use [Disaster recovery](/self-hosting/disaster-recovery/) instead of guessing at database repairs.

You can start small. A healthy, private Telium home is useful on its own — it does not need to accept public signups or operate a public SFU.
