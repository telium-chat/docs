---
title: Gateway
description: The guild realtime WebSocket, its lifecycle, opcodes, intents and close codes.
sidebar:
  order: 4
---

A client opens one WebSocket per guild server at `GET <api>/gateway/v1`. This page defines the frame format, connection lifecycle, opcodes, intents and close codes.

Frames are JSON text only (binary closes with 4002), with no compression. Every frame has `op`. `DISPATCH` frames add `s` (increasing sequence), `t` (event name) and `d`; other frames carry `d`.

```json
{ "op": "DISPATCH", "s": 42, "t": "MESSAGE_CREATE", "d": { } }
```

## Lifecycle

1. The server sends `HELLO`:
   ```json
   {"op":"HELLO","d":{"heartbeat_interval_ms":45000,"gateway_version":1,"protocol":{"version":…,"min_supported":…,"capabilities":[…]}}}
   ```
2. The client **MUST** send `IDENTIFY` first, within 30 000 ms (else close 4008; any other op first closes 4001). `d` holds `token` (the session token for this server, not an identity assertion), and optional `intents`, `presence` and `protocol`.
3. The server sends `READY` with `session_id`, `user` (`user_id`, `device_id`, `is_bot`, `application_id`), `server_name`, `protocol`, `intents` and the guild list.
4. The client sends `{"op":"HEARTBEAT"}` every `heartbeat_interval_ms` (read it from `HELLO`). The server replies `HEARTBEAT_ACK` and closes with 4009 after 2× the interval without one.

`HELLO` and `READY` carry the server's `protocol: {version, min_supported, capabilities}`. A client outside that window is closed with 4015. Negotiation rules are in [Compatibility](/reference/compatibility/).

There is no resume. `RESUME` gets `{"op":"INVALID_SESSION","d":{"resumable":false}}`. Use `s` for gap detection only. After a reconnect a client **MUST** re-fetch state over HTTP.

Every guild-scoped dispatch carries `guild_id` in `d`. Account-scoped events such as DMs do not.

## Client opcodes

| Op | Effect |
| --- | --- |
| `HEARTBEAT` | Keepalive, answered with `HEARTBEAT_ACK` |
| `PRESENCE_UPDATE` | Presence for this connection |
| `TYPING` / `TYPING_STOP` | Typing in `d.channel_id` |
| `DM_TYPING_START` / `DM_TYPING_STOP` | Typing in a private conversation |
| `SUBSCRIBE` | Member-list ranges, answered with `MEMBER_LIST_UPDATE` carrying `SYNC` ops (`range`, `items`) |
| `REQUEST_GUILD_CHANNELS` | Answered with a `CHANNEL_VISIBILITY` dispatch |

Unknown ops are ignored. A non-JSON or non-object frame closes with 4002. Frames other than `HEARTBEAT` are rate limited per account; frames over the limit are dropped.

## Intents

Bits `1<<0` to `1<<8`, in order:

| Bit | Intent |
| --- | --- |
| `1<<0` | `GUILD_MESSAGES` |
| `1<<1` | `GUILD_MEMBERS` |
| `1<<2` | `GUILD_PRESENCES` |
| `1<<3` | `GUILD_TYPING` |
| `1<<4` | `GUILD_EXPRESSIONS` |
| `1<<5` | `GUILD_STRUCTURE` |
| `1<<6` | `DIRECT_MESSAGES` |
| `1<<7` | `GUILD_VOICE_STATES` |
| `1<<8` | `MESSAGE_CONTENT` |

Default: `GUILD_MESSAGES | GUILD_MEMBERS | GUILD_STRUCTURE | GUILD_EXPRESSIONS | DIRECT_MESSAGES | GUILD_VOICE_STATES`.

Bot sessions are masked to the bot intent set (everything except `DIRECT_MESSAGES`) and to what the installation allows. Bots do not receive DM ciphertext.

## Close codes

| Code | Meaning | Client action |
| --- | --- | --- |
| 4001 | Expected `IDENTIFY` | fix the client |
| 4002 | Malformed or binary frame | fix the client |
| 4004 | Auth failed, session revoked or expired, or bot session with no application | re-authenticate over HTTP; do not retry the token |
| 4005 | Server restarting (also sent to connections accepted during shutdown) | reconnect with backoff |
| 4008 | `IDENTIFY` timeout | reconnect |
| 4009 | Heartbeat timeout | reconnect |
| 4010 | Falling behind; events dropped | reconnect immediately and resync from `READY`; keep reconnecting |
| 4015 | Protocol version outside the server's window | upgrade the client, see [Compatibility](/reference/compatibility/) |
