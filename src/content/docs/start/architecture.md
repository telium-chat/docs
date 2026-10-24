---
title: Architecture
description: How home servers, guild servers, media origins and SFUs divide authority in Telium.
sidebar:
  order: 2
---

Telium splits authority by what owns the data. An account has one authoritative home server, and a guild has one authoritative guild server. They can be the same machine, but nothing in the protocol requires it. You can sign in as `@alice:home.example` and join guilds hosted on `guilds.example` and anywhere else.

## Roles

### Home server

Your home server owns account-scoped state:

- authentication, devices and passwords (OPAQUE)
- your profile, account lifecycle and identity-continuity documents
- your side of friendships and blocks
- direct-message delivery and encrypted vault material
- synced client settings (sealed on your device first)
- the list of guilds you belong to on other servers
- account migration state

It does not hold a copy of foreign guilds. Channels, messages and roles of a guild on another server stay on that server.

### Guild server

A guild server is the only authority for a guild's:

- channels, categories, roles, overwrites and permissions
- members, bans, timeouts and join state
- messages, reactions, pins, threads, forums, read state and search
- invites and audit log
- AutoMod, held messages and reports
- voice state and SFU authorization

There is no multi-master replication. Each permission check runs once, against one copy of the state.

### Media origin

A media origin stores content-addressed files and issues capability-bearing references. A guild stores the reference, not another copy of the file. See [Media](/features/media/).

### SFU

The SFU forwards voice, video and screen-share media. It makes no permission decisions. The guild server decides who may join, publish, subscribe or stream, and mints a short-lived signed token with those rights. The SFU verifies the token and moves media. See [Voice and video](/features/voice-and-video/) and [SFU](/self-hosting/sfu/).

## Connections

A client holds one connection to its home server and one per guild server it uses. To reach a guild server, the client gets a short-lived, audience-bound identity assertion from the home server and exchanges it for a guild-local session. After that, the home server is off the guild's hot path.

```text
             +---------------------+
             | home server         |
             | home.example        |
             | auth, devices, DMs  |
             +----------+----------+
                        |
                 signed assertion
                        |
          +-------------+-------------+
          |                           |
          v                           v
+-------------------+       +-------------------+
| guild server      |       | guild server      |
| guilds.example    |       | other.example     |
+---------+---------+       +---------+---------+
          |                           |
       REST + WS                   REST + WS
          \                           /
           +-------------------------+
           | browser, desktop or     |
           | Android client          |
           +-------------------------+

guild server --signed token--> SFU <--media--> client
```

If one guild server goes down, only the guilds on it stop working. Your home server and other guilds keep running.

## One process or several

A small deployment runs all three roles in one `telium-server` process on SQLite. The switches live in `[roles]`:

```toml
[roles]
identity = true
guild = true
media = true
```

A disabled role does not mount its routes. In a single process, `POST /_telium/v1/sessions/local` runs the same assertion and session exchange internally, so you can split roles later without changing account identity. `GET /_telium/v1/capabilities` tells clients which features a server offers.

## Federation identity

When authorization depends on which server is asking, servers sign their requests. TLS protects the transport. The Telium signature identifies the logical server that sent the request. Discovery (`/.well-known/telium/server`) maps a server name to its current endpoint and published keys, so a server can move hosts or fail over without changing identity. Public lookups such as profiles and keys return signed documents instead of requiring a signed request.

Details: [Federation overview](/federation/overview/) and [Signing](/reference/protocol/signing/).

## Who can read what

| Data | Readable by |
| --- | --- |
| Guild messages | The guild server |
| DM and group-conversation content | Only participants' devices (MLS). Home servers route ciphertext and keep delivery metadata. See [DM encryption](/security/dm-encryption/). |
| Passwords | Not sent to the server as a reusable secret (OPAQUE). See [Account security](/security/account-security/). |
| Media | Anyone holding its capability reference |
| Presence and activity | The audience you share it with, subject to your privacy settings |

:::caution
A web client served by a malicious origin can read anything the page can read. Encryption cannot protect plaintext from JavaScript already running in the client. If your threat model includes a malicious home server, use a packaged client or a web origin you trust independently. See [Threat model](/security/threat-model/).
:::

## Caches and failure

Every cache in Telium can be dropped and rebuilt from the authority: the client's IndexedDB snapshot, foreign profiles cached by guild servers, remote media caches, federation key caches, and a warm standby's replica.

The system expects partial failure:

- Federation deliveries queue and retry, so both servers need not be online at once.
- A warm standby serves reads and refuses writes until you promote it. See [Warm standby](/self-hosting/warm-standby/).
- A demoted primary refuses new writes and points at the new authority.

## Repository

| Path | Contents |
| --- | --- |
| `server/` | Reference homeserver (all three roles) |
| `web/` | Shared React client and browser build |
| `web/electron/` | Electron desktop shell |
| `web/src-tauri/` | Tauri 2 shell for Android |
| `sfu/` | Telium SFU front end and LiveKit integration |
| `telium-protocol/` | Shared signing and protocol primitives |
| `sdk/` | Bot SDK |
| `site/` | Public website and server registry |

See [Development](/reference/development/) to build and test each part, and [API](/reference/api/) for the endpoint surface.
