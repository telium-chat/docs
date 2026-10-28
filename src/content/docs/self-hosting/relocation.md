---
title: Domain relocation
description: Move a Telium server to a new domain while keeping its database, accounts, guilds and history.
sidebar:
  order: 18
---

A relocation renames your server from `old.example` to `new.example`. The operator, database, accounts, passwords, devices, guilds and history stay the same. The server and its peers rewrite every reference to the old name.

A relocation moves no data and asks users for nothing. To move a single account or guild between two servers, use [migration](/federation/migration/) instead. To close a server for good, see [Sunset](/self-hosting/sunset/).

## Steps

1. **Announce.** As a server admin:

   ```text
   POST /_telium/v1/admin/sunset
   { "mode": "relocate", "new_domain": "new.example", "effective_at": <ms>, "message": "We are moving to new.example" }
   ```

   `effective_at` defaults to 30 days from now. The server mints a successor signing key, signs a relocation record, publishes it as `relocation` in `/.well-known/telium/server`, and pushes it to every server it knows, retrying with backoff. Peers verify it and wait. Nothing is renamed yet.

2. **Point DNS.** Point `new.example` at the server and keep `old.example` pointed at it too.

3. **Restart under the new name.** Set `server_name = "new.example"` and update `public_base_url`, then restart. At boot, before anything else reads the database, the server:
   - records each account's OPAQUE credential identifier so existing passwords keep working,
   - fails account migrations still in their cooling-off window (their grants name the old id; users start them again),
   - rewrites the database,
   - files the old name's keys under `old.example` and makes the successor key current,
   - writes a local `domain moved` tombstone, clears the sunset notice, and queues an `applied` notice to every peer.

4. **Peers confirm.** On its next contact with `new.example` (the pushed notice, a discovery, or a recheck every ten minutes), each peer finds the successor key in the new name's key document and applies the rewrite.

To change the destination or withdraw before the cutover, post again with a different `new_domain`, or with `mode: "none"`. Withdrawing deletes the successor key, so the abandoned record can never be confirmed.

Sessions and access tokens survive the rename. A client that knew `old.example` reads `moved_to` from the old name's discovery document, checks that its token still works, and updates its stored home. Logins typed as `@alice:old.example` map to the new name.

## Keep the old name answering

After the cutover the server answers requests whose `Host` is a former name with a discovery document pointing at the new one, for `/.well-known/telium/server` and `/_telium/v1/keys`:

```json
{
  "server_name": "old.example",
  "api": "https://new.example",
  "moved_to": "new.example",
  "relocation": {},
  "keys": {}
}
```

Keeping the old DNS name pointed at the server is enough. Everything in the document is signed by the old name's keys, so you can also host it as a static file:

```text
GET /_telium/v1/relocation/old.example/discovery
```

:::caution
Keep the old name serving this document for at least one year after the cutover. Peers that were offline, backups restored later, and pasted invite links depend on it.
:::

If the old name disappears early:

| Peer state | Result |
| --- | --- |
| Already applied the relocation | Unaffected. It holds the record and the old keys. |
| Saw the announcement, not yet confirmed | Confirms once it reaches the new name. |
| Never heard of it | Cannot verify it. Its references to `old.example` go stale, and it meets `@alice:new.example` as a new id. |

Push the announcement weeks before the cutover so the last case stays rare.

## What a peer checks

A peer applies a relocation only when both names vouch for it:

- The record is signed by a key `old.example` vouches for now, or by a retired key while `old.example`'s own discovery document still publishes the same record.
- `announced_at` is no more than five minutes in the future.
- A pushed notice (`POST /_telium/v1/relocation`) comes from `old.example` or `new.example`, never a third server.
- The successor key's signature verifies, and `new.example`'s own key document publishes that key. Until it does, the record stays `announced` and nothing is rewritten.

Once applied, a second relocation for the same old name is refused with `409`. A later owner of a lapsed `old.example` cannot take it back.

## What gets rewritten

Peers and the relocating server rewrite, in one transaction:

- columns whose value is the domain (`guild_server`, `sequencer`, `home_domain`, `origin` and similar),
- ids ending in `:old.example`, such as `@alice:old.example` and `#alias:old.example`,
- JSON strings containing either, and `media://old.example/` references,
- attachment descriptors in message history (`origin`, `reference`, and the fetch `url`).

Requests to the old name are then sent to the new one, and ids under the old name resolve forward.

These are not rewritten:

- **Signed data.** Message signatures, co-signed tombstones and identity anchors keep the old id. They still verify with the old name's historical key, which peers keep.
- **Message text.** What people typed stays as typed.
- **Secrets and key material:** hashes, tokens, ciphertexts, `server_keys`, `remote_keys`, cold archives, the replication log, and migrations in flight.
- **Failover pairings.** Pair your [warm standby](/self-hosting/warm-standby/) again under the new name.

A chain of relocations (`a` to `b`, then `b` to `c`) is followed up to eight hops.
