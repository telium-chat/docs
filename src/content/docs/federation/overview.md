---
title: Federation
description: How Telium servers discover each other, sign requests, hand out guild sessions, resolve guild addresses and block peers.
sidebar:
  order: 1
---

Telium federation connects independent account homes, guild servers and media origins. Each server stays the authority for what it owns and uses signed messages to tell the others. This page covers discovery, keys, cross-server sessions, guild vanity addresses, revocation notices and defederation.

## Names and discovery

An identity carries a logical server name:

```text
@alice:home.example
```

`home.example` is the federation name. It does not have to be the socket a peer dials. Discovery resolves the name to the current API base and signing keys, which is what lets you put the server behind a reverse proxy, relocate it or fail it over without rewriting identifiers.

| Endpoint | Purpose |
| --- | --- |
| `GET /.well-known/telium/server` | Discovery document: API base, `client` URL, protocol window, `sunset`, `relocation`, `moved_to` |
| `GET /_telium/v1/keys` | The server's published Ed25519 signing keys |
| `GET /_telium/v1/health` | Liveness |
| `GET /_telium/v1/capabilities` | Enabled roles, features and selected operator policy |

Some role-specific discovery lives elsewhere. External upload hosts are listed at `GET /_telium/v1/media/registry`, and voice regions have their own routes. Do not assume every operator setting appears in the capabilities document.

For test rigs, `[federation] peers` maps a logical server name straight to an endpoint, and `[federation] allow_http = true` permits plain HTTP. Leave `allow_http` off for public federation.

```toml
[federation]
enabled = true
request_timeout_secs = 15
# test rigs only
# allow_http = true
# [federation.peers]
# "guilds.example" = "http://guilds.lan:8080"
```

See [Relocation](/self-hosting/relocation/), [Sunset](/self-hosting/sunset/) and [Warm standby](/self-hosting/warm-standby/) for the discovery fields those features add.

## Server keys and signed requests

Every server signs federation requests and documents with Ed25519 keys published at `/_telium/v1/keys`. TLS proves you reached the host on the certificate. The Telium signature proves which logical server authored the request or record. A peer checks the claimed origin against discovered key material before accepting signed data. The canonical JSON signing rules are in [Signing](/reference/protocol/signing/).

Telium uses two kinds of trust:

- **Signed server-to-server requests.** The signature covers method, path, body hash, timestamp, origin and destination. Friendship and presence relays, DM delivery, media authorization, migration imports, relocation notices, standby replication and federation reports all use this.
- **Signed public documents.** Profiles, device lists, account status, identity documents and the key and discovery documents are public GETs. You trust the signed response object, not the request.

A valid signature authenticates the sender. It does not authorize the action. Each route still applies its own policy (for example, replication reads are limited to configured standby peers).

## Sessions on foreign guild servers

A client never sends its home bearer token to a guild server. The sequence is:

1. The client signs in to its account home.
2. It asks the home for a short-lived identity assertion (`POST /_telium/v1/assertions`) with the guild server as audience.
3. The home signs an assertion binding account, device, device public key, audience and expiry.
4. The client presents it to the guild server (`POST /_telium/v1/sessions`).
5. The guild server verifies it against the home's published key and mints its own guild-session token.
6. Guild REST and gateway traffic uses that local token.

<img class="diagram diagram-light" src="/diagrams/session-light.svg" alt="1: the client signs in to its home server with OPAQUE. 2: it requests an assertion for the guild server. 3: the home returns a signed assertion. 4: the client posts it to the guild server. 5: the guild server fetches the home's keys to verify it. 6: it returns a guild-session token. 7: later traffic uses that token." />
<img class="diagram diagram-dark" src="/diagrams/session-dark.svg" alt="1: the client signs in to its home server with OPAQUE. 2: it requests an assertion for the guild server. 3: the home returns a signed assertion. 4: the client posts it to the guild server. 5: the guild server fetches the home's keys to verify it. 6: it returns a guild-session token. 7: later traffic uses that token." />

The home is not on the hot path for each guild request. When identity and guild roles share one server, `POST /_telium/v1/sessions/local` performs the same exchange internally.

Guild servers revalidate foreign sessions against each account's home on a schedule. Revocation notices (below) make the common case immediate.

## Guild vanity addresses

A guild has an immutable ULID and, optionally, a readable address:

```text
#gaming:guilds.example
```

Rules for the localpart:

- 1 to 32 characters of `a-z`, `0-9`, `.`, `-`, `_`, stored case-folded.
- Reserved words are refused, including `admin`, `support`, `staff`, `official`, `security`, `system`, `telium` and `everyone`.
- Off by default. A member with `MANAGE_GUILD` enables, changes or disables it, while this server is still authoritative for the guild.
- One live address per guild. Changing or disabling it releases the name at once; renames leave no aliases.

The same name has a browser form: `#gaming:guilds.example` is `https://guilds.example/invite/gaming`, so someone without Telium lands on the public onboarding page. New random invite codes start with `~`, which vanity names cannot contain. Older unprefixed invite codes still work, and while one is live the server refuses a vanity claim with the same value.

### Resolution

| Endpoint | Auth | Behaviour |
| --- | --- | --- |
| `GET /_telium/v1/guild-aliases/{alias}` | None, signed response | Answers for this server's own names: `active`, `moved` (with `to.origin` and `to.guild_id`) or `unknown` |
| `GET /_telium/v1/guild-addresses/resolve?address=...` | None, or a guild session | Follows the chain and returns the final `active` answer |
| `GET /_telium/v1/guilds/{guild_id}/join-preview` | None | Only while the guild has a live vanity address |
| `POST /_telium/v1/guilds/{guild_id}/join` | Guild session | Joins by address; same bans, join gates, screening and audit as an invite join |

Unauthenticated resolution must start at the server named in the address, so the resolver cannot be used as an anonymous proxy. With a guild session you can ask your connected server to resolve a foreign address.

A guild that has moved away answers `moved`, even if its rows remain. A `moved` answer is a hint: the resolver asks the named server again from scratch, and only an `active` answer from the server holding the guild ends the walk. Each answer is verified against the key of the origin that was asked, and its `host` must match that origin. The walk stops after six hops, and a loop returns `409`.

Disabling the vanity address closes address-based joining immediately. Invite links are unaffected.

When a guild migrates, its live address becomes a forward to the destination in the same transaction that writes the tombstone, and the name is re-adopted at the destination if it is free there. A deleted guild's names are released. See [Migration](/federation/migration/).

## External emoji

Using another guild's custom emoji needs both sides to agree, and the server enforces it:

- The receiving guild's `external_emoji` setting must allow foreign emoji, and the member needs `USE_EXTERNAL_EMOJI`.
- The owning guild's `emoji_export_policy` decides who may carry its emoji elsewhere: `everyone` (default), `members`, or `role` (holders of `emoji_export_role_id` or a higher role). If that role is deleted, the policy falls back to members.

Your server asks the owning server over `POST /_telium/v1/emoji/entitlement` and caches the answer per origin, emoji and user for five minutes. If the owner is unreachable, the last verdict is used for up to a day, after which use is allowed. An unknown emoji id returns `404`; a refusal returns `403`.

## Identity revocation notices

When a device is revoked, all devices are signed out, or the account is deactivated, deleted or moved, the home sends one notice to each guild server in the account's membership registry:

```text
POST /_telium/v1/users/{user_id}/revoked      (signed)
{ "user_id", "kind": "device" | "all_devices" | "deactivated" | "deleted" | "moved",
  "device_id"?, "new_id"?, "at" }
```

Sending:

- Queued in the `identity_notices` outbox, one row per user, device, kind and guild server. A repeated event re-arms the existing row.
- Sent immediately, then retried with backoff from one minute, doubling up to 256 minutes, for 12 attempts in all (about 17 hours).
- Fan-out is capped at 256 guild servers. Anything past that is left to scheduled revalidation.

<img class="diagram diagram-light" src="/diagrams/revocation_retries-light.svg" alt="The notice is sent at once. Retry gaps double from 1 minute to 256 minutes, then stay at 256 minutes. The 12th and last attempt lands about 17 hours after the first." />
<img class="diagram diagram-dark" src="/diagrams/revocation_retries-dark.svg" alt="The notice is sent at once. Retry gaps double from 1 minute to 256 minutes, then stay at 256 minutes. The 12th and last attempt lands about 17 hours after the first." />

Receiving:

- The signer must be the account's home (the user id's domain, or the name it relocated to). Anything else is `403`.
- Each origin is rate-limited to a burst of 60, then one per second.
- `device` and `all_devices` drop the matching sessions.
- `deactivated` and `deleted` trigger a signed status fetch from the home, and the server acts on that answer.
- `moved` applies only if the home's status says `moved` with `moved_to` equal to `new_id`. Otherwise the reply is `409 try_again`.

A dropped session receives a `SESSION_REVOKED` gateway event and is closed. Cryptographic device revocation is separate: it is signed by the account root and published in `GET /_telium/v1/users/{id}/devices` under `revocations`. See [Account security](/security/account-security/) and [Identity continuity](/security/identity-continuity/).

## Delivery and temporary disagreement

Federation does not use cross-server transactions. The local authority commits what it owns and queues a signed fact for the peer, retrying until it lands. A friendship, for example, is two halves on two homes, and one half can exist briefly while the other server is down.

DM conversations have one sequencer (a member's home) that orders frames, with signed gap repair and signed handoffs when the sequencer moves. See [DM encryption](/security/dm-encryption/) and the [federation protocol](/reference/protocol/federation/).

## Errors between peers

Every signed request carries the sender's protocol window. A peer outside your window gets `400 incompatible_protocol`; this is never retried and never counted as the peer being down. See [Compatibility](/reference/compatibility/).

If your server calls a peer on a client's behalf and gets no usable answer, the client sees:

| Upstream result | Client gets |
| --- | --- |
| Connection refused or reset, or name does not resolve | `502 bad_gateway` |
| Timeout | `504 gateway_timeout` |
| Peer returned `503` | `503 upstream_unavailable` |
| Peer returned `504` | `504 gateway_timeout` |
| Any other peer `5xx` | `502` |

Peer refusals (`401`, `403`, `404`, `409`, `413`, `429`) pass through unchanged. Clients treat a `5xx` like a network failure ("not known yet"), and an identity continuity check never reads it as a key change.

## Defederation and blocklists

Server admins can block federation with a domain and subscribe to signed blocklist feeds.

| Endpoint | Action |
| --- | --- |
| `GET`, `POST /_telium/v1/admin/defederation` | List or add blocked domains |
| `DELETE /_telium/v1/admin/defederation/{domain}` | Remove a block |
| `GET`, `POST`, `DELETE /_telium/v1/admin/blocklist-feeds` | Manage blocklist feeds |
| `POST /_telium/v1/admin/blocklist-feeds/refresh` | Refresh feeds now |
| `GET /_telium/v1/admin/peers`, `/admin/peers/{origin}` | Peer status and protocol skew |

Defederation stops new interactions with the domain. It does not remove messages, media or client caches that already arrived.

## Relocation and failover

- **Relocation** moves a whole server to a new domain with a record both names sign. See [Relocation](/self-hosting/relocation/).
- **Warm standby** keeps a read-only replica that can be promoted when the primary fails. Promotion writes a sequenced signed authority record, so peers can verify the replacement and a returning primary fences itself. See [Warm standby](/self-hosting/warm-standby/).

:::caution
A brand-new peer can only trust a promoted standby if some trustworthy discovery and key history for the original name still exists. Keep the discovery document reachable independently of the primary machine.
:::

## Code

- `server/src/federation/mod.rs`: signing, verification, discovery, caches
- `server/src/federation/routes.rs`: admin federation controls, peers, reports
- `server/src/routes/wellknown.rs`: discovery and keys
- `server/src/vanity.rs`: guild addresses
- `server/src/revocation.rs`: revocation notices
- `server/src/emoji.rs`: external emoji entitlement

For the full route list, see the [API reference](/reference/api/).
