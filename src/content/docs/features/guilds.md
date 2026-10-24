---
title: Guilds and moderation
description: Channels, roles, permission evaluation, invites, moderation tools, AutoMod and the audit log in a Telium guild.
sidebar:
  order: 1
---

A guild is a community with channels, roles and members. This page covers how permissions resolve, how invites and addresses work, and the moderation tools a guild has.

## Where a guild lives

Each guild has one authoritative guild server. That server owns the channels, members, messages, roles, bans and voice state, and it makes every permission decision. Your account home only proves who you are: the client asks your home for a signed identity assertion for the guild server, then trades it for a guild-local session (`POST /_telium/v1/sessions`).

Guild messages are not end-to-end encrypted. The guild server can read them. See [DM encryption](/security/dm-encryption/) for what is encrypted.

## Channels

| Type | Notes |
| --- | --- |
| `text` | Default type. Supports `slowmode` (seconds between messages). |
| `voice` | `voice_region`, `bitrate` (8000 up to the server's `voice.max_bitrate`), `user_limit`, and a voice status of up to 140 characters. |
| `forum` | Posts are threads. Up to 20 tags (1 to 20 characters each, optionally moderator-only). `default_sort` is `activity` or `creation`; `default_layout` is `list` or `gallery`. |
| `announcement` | Other channels can follow it. |
| `category` | Groups channels through their `parent_id`. A category cannot sit inside another. |

Channel names are 1 to 100 characters. Creating, editing, reordering and deleting channels needs `MANAGE_CHANNELS`. Slowmode does not apply to members with `MANAGE_MESSAGES`.

A member who cannot view a channel gets `404 channel not found` from every channel route, so a hidden channel's existence is not confirmed.

## Permissions

Permissions are a 64-bit bitfield. In JSON they travel as decimal strings, because a JavaScript `Number` cannot hold every `u64` value. Role create and patch bodies also accept a list of permission names.

| Bit | Name | Bit | Name |
| --- | --- | --- | --- |
| 0 | `VIEW_CHANNEL` | 14 | `USE_EXTERNAL_EMOJI` |
| 1 | `SEND_MESSAGES` | 15 | `CONNECT` |
| 2 | `MANAGE_MESSAGES` | 16 | `SPEAK` |
| 3 | `MANAGE_CHANNELS` | 17 | `VIDEO` |
| 4 | `MANAGE_ROLES` | 18 | `STREAM` |
| 5 | `KICK_MEMBERS` | 19 | `VIEW_AUDIT_LOG` |
| 6 | `BAN_MEMBERS` | 20 | `ADD_REACTIONS` |
| 7 | `MANAGE_GUILD` | 21 | `READ_MESSAGE_HISTORY` |
| 8 | `MANAGE_EXPRESSIONS` | 22 | `PRIORITY_SPEAKER` |
| 9 | `CREATE_INVITE` | 23 | `MUTE_MEMBERS` |
| 10 | `ATTACH_FILES` | 24 | `DEAFEN_MEMBERS` |
| 11 | `EMBED_LINKS` | 25 | `MOVE_MEMBERS` |
| 12 | `MENTION_EVERYONE` | 40 | `ADMINISTRATOR` |
| 13 | `MODERATE_MEMBERS` | | |

The `@everyone` role (its id is the guild id) starts with `VIEW_CHANNEL`, `SEND_MESSAGES`, `CREATE_INVITE`, `ATTACH_FILES`, `EMBED_LINKS`, `ADD_REACTIONS`, `READ_MESSAGE_HISTORY`, `USE_EXTERNAL_EMOJI`, `CONNECT`, `SPEAK`, `VIDEO` and `STREAM`.

:::note
The owner and any `ADMINISTRATOR` holder get every bit (`u64::MAX`), including bits that have no name yet. Do not assume the effective mask fits in 53 bits.
:::

### Evaluation order

The server computes a member's permissions in a channel like this:

1. Start from the union of all the member's role permissions, including `@everyone`.
2. If the member is the owner or holds `ADMINISTRATOR`, stop: every permission applies (channel overwrites are skipped).
3. Apply the channel's `@everyone` overwrite: remove its `deny`, then add its `allow`.
4. Combine all overwrites for roles the member holds. Remove the combined `deny`, then add the combined `allow`. A role allow beats an `@everyone` deny.
5. Apply the member-specific overwrite last. It beats any role overwrite.
6. Bots are capped at the permission ceiling they were installed with (see [Bots](/features/bots/)).
7. A timed-out member keeps only `VIEW_CHANNEL` and `READ_MESSAGE_HISTORY`, in every channel and at guild level, even if they are an administrator.

Channel overwrites are set with `PUT /_telium/v1/channels/{channel_id}/overwrites/{role|member}/{target_id}` and a body of `{"allow": "<u64>", "deny": "<u64>"}`. This needs `MANAGE_ROLES`.

The client hides actions you cannot take, but the server enforces every check.

### Role hierarchy

Roles have a position. `@everyone` stays at the bottom and cannot be moved or deleted. With `MANAGE_ROLES` you can:

- create roles and grant only permissions you hold yourself;
- edit, move or assign roles below your highest role, never at or above it.

Kick, ban, timeout and changing someone else's nickname need you to outrank the target: the owner outranks everyone, otherwise your top role must be strictly higher than theirs. Nobody outranks the owner.

## Members

| Action | Permission | Notes |
| --- | --- | --- |
| Set your own nickname | none | 32 characters max. |
| Set another member's nickname | `MODERATE_MEMBERS` | Must outrank them. |
| Add or remove roles | `MANAGE_ROLES` | Roles must be below your top role. |
| Time out (`timeout_until`, ms epoch) | `MODERATE_MEMBERS` | A time in the past clears the timeout. |
| Kick | `KICK_MEMBERS` | |
| Ban, unban, list bans | `BAN_MEMBERS` | A ban takes an optional `reason`, strips roles and disconnects voice. |
| Transfer ownership | owner only | `POST /_telium/v1/guilds/{guild_id}/transfer-ownership` to a current member. |

Bot members are managed through their installation, so kick, ban and role changes on a bot return a conflict. Voice moderation (server mute, deafen, move) is covered in [Voice and video](/features/voice-and-video/).

## Invites

Anyone with `CREATE_INVITE` can make an invite link with these optional fields:

| Field | Range |
| --- | --- |
| `channel_id` | Channel the invite lands on. |
| `max_uses` | 1 to 100000 |
| `expires_in_secs` | 60 to 31536000 (one year) |

Generated codes start with `~`. A guild holds at most 1000 live invites, and one member at most 100. Listing all invites and revoking other people's needs `MANAGE_GUILD`.

The invite preview (`GET /_telium/v1/invites/{code}`) works before sign-in, so a recipient can see the guild and start creating an account. Joining (`POST /_telium/v1/invites/{code}/join`) needs a guild session, and bans and join gates still apply.

## Guild addresses

A guild's id is a ULID that never changes. With `MANAGE_GUILD` you can also give it one vanity name, which has two spellings:

- the Telium address `#gaming:guilds.example`
- the link `https://guilds.example/invite/gaming`

New guilds have no vanity. While one is set, anyone can resolve the address, preview the guild and try to join, subject to bans and gates. Changing or removing it breaks both old spellings at once; generated invite links keep working. After a guild migrates, its old server redirects the old address to the new one. See [Federation overview](/federation/overview/) for address rules and [Migration](/federation/migration/) for moving a guild.

## Custom emoji and stickers

Uploads need `MANAGE_EXPRESSIONS`. Accepted emoji and stickers are public media so other guilds can render them. Two settings control whether a custom emoji can be used outside its home guild:

- The guild you post in decides whether it accepts foreign emoji (`external_emoji`), and you need `USE_EXTERNAL_EMOJI`.
- The emoji's own guild decides who may take it elsewhere with `emoji_export_policy`: `everyone`, `members`, or `role` plus `emoji_export_role_id` (that role or any role above it).

The export rule applies between two guilds on the same server too. Format and size limits are on the [Media](/features/media/) page.

## Join gates and screening

Configure gates with `PUT /_telium/v1/guilds/{guild_id}/gates` (`MANAGE_GUILD`).

| Field | Effect |
| --- | --- |
| `min_account_age_days` | 0 to 3650. Age is checked with the joiner's home server; the join fails if that server cannot be reached. |
| `domain_policy` | `open`, `allowlist` or `blocklist`, applied to the joiner's home domain using the `domains` list. |
| `screening` | Up to 10 questions. Answers are up to 1000 characters each. |
| `hold_first_messages` | 0 to 100. A new member's first N messages wait in the held queue. |

Applicants with pending screening answers appear at `GET /_telium/v1/guilds/{guild_id}/applicants`. Approving or rejecting needs `KICK_MEMBERS`. A rejected applicant cannot resubmit.

## AutoMod

AutoMod rules live at `/_telium/v1/guilds/{guild_id}/automod` and need `MANAGE_GUILD`. Members with `MANAGE_MESSAGES` and members holding an exempt role skip AutoMod.

| Kind | `pattern` / `threshold` | Matches |
| --- | --- | --- |
| `keyword` | Comma-separated words | Any word, case-insensitive substring. |
| `regex` | Regular expression | Case-insensitive; oversized patterns are refused. |
| `link` | Comma-separated allowed domains, or `*` | Any `http(s)` link to a host not on the list (subdomains count as allowed). Empty or `*` blocks all links. |
| `mention` | `threshold` of 1 or more | That many `@` in one message. |
| `flood` | `threshold` of 1 or more | That many messages in the channel within ten seconds. |

| Action | Effect |
| --- | --- |
| `block` (default) | The send fails with `403` naming the rule. |
| `timeout` | Blocks the message and times the author out for five minutes. |
| `flag` | The message goes through; the hit is recorded. |

Every hit is recorded with a 200-character excerpt. Moderators with `MANAGE_MESSAGES` read them at `GET /_telium/v1/guilds/{guild_id}/automod-hits`, and the gateway emits `AUTOMOD_ACTION`.

## Held messages and purge

With `MANAGE_MESSAGES`:

- `GET /_telium/v1/guilds/{guild_id}/held` lists pending held messages.
- `POST /_telium/v1/guilds/{guild_id}/held/{held_id}` with `{"decision": "approve"}` publishes the message; any other decision rejects it.
- `POST /_telium/v1/guilds/{guild_id}/moderation/purge` with `user_id`, optional `channel_id` and `limit` (default 100, max 1000) deletes that account's most recent messages.

Authors can edit their own messages. Moderators can delete messages but cannot edit another person's words.

## Audit log

`GET /_telium/v1/guilds/{guild_id}/audit-log` returns the newest 100 entries (actor, action, target, data, time). It needs `VIEW_AUDIT_LOG`. Recorded actions:

```text
guild.create  guild.update  guild.transfer_owner  guild.gates  guild.alias.set  guild.alias.clear
channel.create  channel.delete  channel.reorder
role.create  role.update  role.delete  role.reorder
member.join  member.roles  member.kick  member.ban  member.unban  member.timeout
message.delete  message.purge  message.held
invite.create  invite.revoke
automod.create  automod.delete
screening.decide
bot.install  bot.update  bot.uninstall
```

## Guild moderators and server operators

Guild permissions only reach inside one guild. Server-wide controls such as user reports, defederation, blocklist feeds and upload scanning belong to the server operator and are not grantable through any guild role. See [Production](/self-hosting/production/).
