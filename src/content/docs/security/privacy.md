---
title: Privacy
description: What your homeserver, guild servers, peers, call infrastructure, push providers and third parties can see.
sidebar:
  order: 6
---

This page lists what each component can observe from the data it handles, whether or not it chooses to look. For who learns your IP address, see [Network privacy](/security/network-privacy/).

Message content in DMs and group DMs is end-to-end encrypted. Who is in a conversation, who sent each frame from which device, when, how large, and who is typing is visible to at least one server.

:::caution
Guild channels are not end-to-end encrypted. The guild's server reads every guild message, and the SFU handles guild voice and video in the clear.
:::

## Your account homeserver

| Sees | Details |
| --- | --- |
| Account | Identity, devices and their public keys, sessions, login times and IPs |
| Conversations | Full membership of every conversation you are in |
| DM frames | Conversation, sequence, epoch, kind, sender account and device, ciphertext length, timestamp. Membership changes name their targets. |
| Receipts | Read receipts and delivery acknowledgements are encrypted MLS frames the server cannot tell from messages. |
| Typing | **Plaintext.** Sent as a gateway event and forwarded to every participant's homeserver. Turning off **Show when I am typing** stops your client sending it. |
| Social graph | Friends, requests, blocks, mutual guild memberships |
| Presence | Whether you are connected, on how many devices and when, **including while Invisible**. Invisible shows you as offline to others. |
| Media and links | Your uploads, remote media fetched through it, and URLs it unfurls or proxies for you, including links in encrypted DMs |

It cannot see message, reaction, edit, pin or receipt content in DMs, DM call media, your password (OPAQUE) or your [sealed sync store](/security/sync-encryption/).

**A block does not stop a DM.** A blocked account can still start a conversation with you, and your homeserver still routes it. Message requests keep it out of your list with no unread count or notification, and your typing and call signalling are not sent before you accept. The sender cannot tell whether you declined, blocked or never looked.

## A guild's server

- Sees every guild message in plaintext, plus your account id, profile, roles, join time, read state, reactions, typing, voice state and IP.
- From your identity assertion: device id, device public key and profile version. Not your password, friends, other guilds or DMs.
- **Protect my IP** (desktop only, off by default) replaces your IP with the relay's. Nothing else changes.

## Federation peers

- A peer hosting someone you talk to sees the conversation id, the sender and device of each frame it relays, timestamps, sizes and typing.
- A peer hosting a friend sees your presence changes.
- **Profile lookups.** Viewing a profile makes your homeserver ask one peer per domain in your friend list whether they share mutual friends with that person. Each peer learns that you looked at that account, and together they reveal which domains your friends are on (not the ids). **Settings > Profile lookups** sets when this happens: on hover, on opening a profile (default), or never.

## Public profile

Anyone can fetch your display name, avatar, pronouns, bio and creation date (`/_telium/v1/users/{id}/profile`), and whether the account exists, moved or was deactivated (`/_telium/v1/users/{id}/status`).

- **Enable public profile link** is on by default.
- **Show status** (presence and custom status) and **Show activity** (Rich Presence) are off by default. Anyone with the link can poll them once enabled. Guild voice activity is never on the public page. Migrated accounts arrive with both off.
- Your homeserver enforces the switches by omitting fields. A disabled page looks like a nonexistent one, but `/status` still reports the account as active.
- The page is `no-store` and `noindex, nofollow, noarchive`. That does not stop copying or crawlers that ignore it.
- Readers connect to your homeserver directly, so its operator logs each reader's IP, time and user agent. No third party is contacted, and **Protect my IP** does not apply.
- On a server running the identity role without the guild role, presence is unavailable and **Show status** has no effect.

## Calls

- **SFU, DM calls.** Media is end-to-end encrypted with a per-epoch key from the MLS exporter. The SFU sees the room name (which contains the conversation id), account ids, IPs, join and leave times, who speaks when, packet sizes and timing, and unencrypted frame headers (the Opus TOC byte, 3 to 10 VP8 header bytes).
- **SFU, guild calls.** The SFU sees media in the clear.
- **TURN** sees your account id (the credential username is `{expiry}:{user_id}`), your IP, your peer's relayed address and media volume and timing. Credentials are per user with a TTL.
- **STUN.** The STUN list (`voice.stun_servers`, default `stun:stun.l.google.com:19302`) is contacted unless the ICE policy is `relay`.

| Call mode | Who learns your IP |
| --- | --- |
| Direct (default; guild calls) | Every other participant, and the STUN server |
| Relay | Your homeserver's TURN operator |
| SFU | The SFU operator, TURN if used, and STUN unless the SFU offered a relay |

A mesh call uses relay if your posture is `relay` or stricter, or if another participant is stricter and your home has TURN. An SFU call uses relay only if your posture is `relay` or stricter and the SFU offered one. Your posture travels sealed in the call hello; only a derived `wants_sfu` bit reaches the server. Guild calls have no posture control. See [DM calls](/features/dm-calls/).

## Push

- **Web Push.** The provider sees your endpoint URL (a stable per-browser id), the timing and size of each push, urgency, TTL and, through VAPID, which homeserver sent it. The payload is encrypted to your browser (RFC 8291).
- **UnifiedPush and native relays** receive `{"type":"wake"}` with no content.
- **Your homeserver**, relaying a guild notification, sees the guild id, message id, kind (mention or reply), your account, which devices to wake, the origin server and timing. The title, preview and guild and channel names are sealed per device.
- **A guild server** sending a notification gets your device ids and public keys (so your device count), not your push endpoints.

## Deployment counter

With `usage.report = true` (the default), a homeserver sends one report a day to `usage.count_url` (default `https://count.telium.chat/ping`). The body has two fields: a random per-server id and the number of accounts that are not deactivated. It has no version, server name, user, guild or message data. The id is not derived from the server's name or key. The collector sees the server's IP and the request time. Set `usage.report = false` to stop it.

## Third parties and other members

- **GIFs are not proxied.** Your client fetches GIF search and GIF media from the provider (Klipy) directly, so the provider sees your IP, your searches and each GIF as it renders, including in encrypted DMs. No setting turns this off.
- **Link previews and images** are fetched by the server through `camo`, so the linked site sees the server. Camo URLs are public and unauthenticated, protected only by an unguessable hash.
- **External upload hosts** see your IP. In the browser, playback goes through your homeserver when `media_registry.gofile_playback_proxy` is on (the default); native apps fetch directly.
- **Guild members** see your profile, roles, messages, reactions and presence. They see a guild voice call as profile activity only if they can view that channel. DM and group DM calls never appear as profile activity. In a direct-mode call, other participants see your IP.
- **Your operator.** Admin dashboards show counts, but membership and sender data is in the database, and an operator with shell access can query it.
