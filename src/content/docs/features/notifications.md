---
title: Notifications
description: How Telium wakes devices, what each push transport supports, and what servers and push providers can see.
sidebar:
  order: 3
---

This page covers push transports, what triggers a notification, the per-device encrypted inbox, and what each party learns.

## Push support today

| Transport | Status |
| --- | --- |
| Browser Web Push (RFC 8291 / 8292) | Works. Needs no configuration: the server generates its VAPID key on first start. |
| Android, through UnifiedPush | Works. The Android app ships with UnifiedPush's embedded FCM distributor, so Play Services devices need no setup and your server needs no Firebase credentials. Google-free devices can use any external UnifiedPush distributor. |
| Direct FCM (`[push.fcm]`) | Server-side sender only. Off by default, Telium ships no credentials, and no Telium client registers with it. |
| Direct APNs (`[push.apns]`) | Server-side sender only. Off by default, and there is no iOS client yet. |

:::note
Telium has no native iOS app or native APNs/FCM push path in a shipped client today. Browser Web Push and Android through UnifiedPush are the working paths. With `[push.fcm]` or `[push.apns]` disabled, the server refuses `fcm` and `apns` device registrations.
:::

The push payload is a content-free doorbell:

```json
{ "type": "wake" }
```

On wake, the device pulls its encrypted inbox from your home server. A lost wake loses nothing, because the next wake or app resume pulls every row after the device's last acknowledged cursor.

## Configuring direct FCM or APNs

Only an app publisher with its own Firebase project or Apple developer key needs these.

```toml
[push.fcm]
enabled = true
project_id = "your-firebase-project"
service_account_file = "/etc/telium/fcm-service-account.json"

[push.apns]
enabled = true
team_id = "ABCDE12345"
key_id = "FGHIJ67890"
bundle_id = "com.example.telium"
key_file = "/etc/telium/apns-key.p8"
environment = "production"   # or "sandbox"
```

`base_url` (and `token_url` for FCM) override the provider endpoints for testing. They must be `https://` unless `federation.allow_http = true`. A mismatched APNs `environment` shows up as `BadDeviceToken`. When a provider reports a token as unregistered, the server deletes that registration. A device is not woken twice within four seconds.

## What triggers a notification

| Event | Notification |
| --- | --- |
| Direct `@user` mention, or a role mention | `mention` |
| Reply to someone's message in the same channel | `reply` (a mention in the same message takes priority, and only one is sent) |
| `@everyone` | Every offline, unmuted member who can view the channel. Sending `@everyone` or `@here` needs `MENTION_EVERYONE`. |
| `@here` | Online members only, through the live gateway. Offline devices are not woken. |
| DM or group message | A generic "Encrypted message" notification (see below) |
| Incoming DM call | Call notification with Answer and Decline |

Every candidate is checked for channel visibility, channel mute and presence first. You never get a notification for your own message.

`@everyone` in a large guild does not slow the send. The guild server writes one broadcast job and a worker expands it in pages of 256 members, keeping at most 2048 deliveries in flight.

## Preview privacy

The synced `notificationPreview` setting controls what a notification shows:

| Mode | Shows |
| --- | --- |
| `full` | Sender and message text |
| `sender` | Sender and a generic label |
| `hidden` | "Telium" and a generic label |

The setting is applied on your device after decryption, so neither your home server nor the push provider learns which mode you chose.

## DM and group notifications

DM content is MLS-encrypted, and the notification path never gets an MLS key. When the app is not running, a DM notification reads **Encrypted message** in every preview mode (with the sender in `full` and `sender` modes). The running client can show decrypted text.

The sender's client marks a frame with `notify: true` for a human message. Reactions, receipts and edits use `notify: false`. Both cases produce an identical-length encrypted hint, so servers cannot tell them apart. Mute a conversation with `PUT /_telium/v1/conversations/{id}/notifications`. Mute is stored on your home server and is not federated.

## Remote guild notifications

When a guild on another server needs to notify you:

1. The guild server asks your home server for your devices' notification public keys. Your home checks that you are a member of that guild first.
2. The guild server encrypts a small descriptor (title, preview, where a tap should go) to each device key.
3. Your home stores the envelopes and wakes each device.
4. The device pulls, decrypts and displays them.

Your home server routes the notification without seeing its text. The guild server never learns your push endpoint. Notification keys are separate from MLS keys, signing keys and Web Push keys.

## Inbox and device registration

| Method and path | Auth | Purpose |
| --- | --- | --- |
| `PUT` / `DELETE /_telium/v1/notifications/device` | Normal session | Register or remove this device's notification key. Returns a notification-only credential. |
| `GET /_telium/v1/notifications` | Notification credential | Pull rows `after` a cursor (up to 100 per page). |
| `POST /_telium/v1/notifications/ack` | Notification credential | Acknowledge rows `through` a cursor. |
| `POST /_telium/v1/notifications/test-wake` | Normal session | Send a test wake to confirm background delivery. |
| `GET` / `POST /_telium/v1/push`, `DELETE /_telium/v1/push/{id}` | Normal session | Manage push endpoints. |
| `GET /_telium/v1/push/vapid` | | The server's VAPID public key. |

The notification-only credential can pull and acknowledge this device's inbox and nothing else. Your home stores only its hash. Revoking the device removes the key, the credential and the push endpoint. Inbox rows expire after seven days by default.

Account migration does not move notification registrations. After a move, each device enrolls again on the new home. See [Migration](/docs/federation/migration/).

## Android notification channels

| Class | Channel id | Default importance |
| --- | --- | --- |
| Messages and unknown kinds | `telium_messages` | default |
| Mentions and replies | `telium_mentions` | high |
| Incoming calls | `telium_calls` | high |
| Account, migration and security | `telium_account_security` | high |

Change sound, vibration and importance in Android system settings. Telium keeps your choices when it updates the channels.

## Limits for federated senders

Your home server rate-limits notifications from other servers:

| Bucket | Burst | Refill |
| --- | --- | --- |
| Per recipient | 32 | 4 source events per second |
| Per sending server | 256 | 32 distinct source events per second |

Batch requests carry at most 128 recipients and 256 envelopes. A retry of an already-accepted event is deduplicated and costs nothing.

## Failure behavior

| Situation | Result |
| --- | --- |
| Push lost | The row waits in the inbox for the next wake or app resume. |
| Duplicate push | The device pulls the same cursor; acknowledged rows are not shown again. |
| Duplicate federated delivery | Deduplicated on `(origin, source_id, device_id)`. |
| Your home server is down | The guild server retries. Sending the message does not fail. |
| Notification key rotated | Rows encrypted to the old key can no longer be decrypted. |

## Who sees what

| Party | Learns |
| --- | --- |
| Guild server | The message, the decision to notify, your user id, device ids and notification public keys |
| Your home server | Source server, target device, guild id, timing, ciphertext |
| Push provider | Your device's endpoint, timing, the opaque wake |
| Your device | The decrypted notification |
