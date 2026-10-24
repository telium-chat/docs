---
title: Planned shutdown
description: Announce that a Telium server is closing, let users move or save their accounts, and finish with signed tombstones.
sidebar:
  order: 15
---

A planned shutdown gives your users notice, lets them move or download their accounts, and ends with signed tombstones so peers and clients stop retrying. The server never moves anyone: each user decides where to go and starts their own [migration](/docs/federation/migration/).

If your server is changing its name rather than closing, see [Relocation](/docs/self-hosting/relocation/).

## 1. Announce

As a server admin:

```text
POST /_telium/v1/admin/sunset
{ "mode": "shutdown", "effective_at": <ms>, "message": "..." }
```

The server signs the record and serves it at `GET /_telium/v1/sunset`. Post `mode: "none"` to withdraw it any time before you finalize.

While a shutdown is announced:

- **Registration closes**, including OPAQUE registration and the `registration_open` flag in `/capabilities`.
- **Every login carries the notice.** Login, OPAQUE login, registration and reactivation responses include a `sunset` field. The web client shows a banner on every screen.
- **Users can download an account bundle** (below).

## 2. Account bundle

```text
POST /_telium/v1/account/bundle
{ "password": "..." }        or   { "reauth_token": "..." }
```

The server returns a signed `telium-account-bundle-v1` document with the caller's profile, synced settings, key-vault ciphertext and other portable state, plus the server's key document so the signature can be checked after the server is gone. It needs the password (or a reauth token for OPAQUE accounts), since the bundle contains the key-vault ciphertext.

The web client offers the download under Settings, Account, next to the shutdown notice.

:::note
A bundle is a record for the owner. No server can import one yet. A user who wants to stay on Telium should migrate their account while this server is still running.
:::

## 3. Run consented moves

Migrations normally run from the maintenance loop once their cooling-off window passes. Near the end, run them now:

```text
POST /_telium/v1/admin/sunset/execute
```

For every pending or ready move the server:

1. Re-verifies the device signature on the user's grant. Failures are reported under `refused` and not run.
2. Leaves moves still inside their cooling-off window alone and reports them under `waiting`, with `misses_deadline` set if they will not finish before the announced date. Tell those users, or move the date.
3. Runs the rest and reports them under `executed` or `failed`.

The response includes `remaining_accounts`: local accounts that have neither moved nor been tombstoned.

## 4. Finalize

Once the announced date has passed:

```text
POST /_telium/v1/admin/sunset/finalize
{ "confirm": "chat.example.com", "abandon_pending": false }
```

`confirm` must be this server's name. If any consented move is still in flight, the call is refused unless `abandon_pending` is `true`, which marks those moves `failed`.

:::danger
Finalizing cannot be undone, and a finalized shutdown cannot be withdrawn.
:::

In one transaction the server writes:

- a signed `gone` tombstone (`reason: "server_shutdown"`) for every local account without one,
- a tombstone for every local guild without one,
- a domain tombstone carrying the sunset record.

Existing `moved` tombstones are left as they are, so users who migrated keep their forwarding address. Guilds whose owner did not move them also get a `gone` tombstone.

## After finalizing

The server refuses every write with `410 Gone`, including after a restart:

```json
{ "error": "shut_down", "message": "chat.example.com has shut down", "tombstone": {} }
```

Reads still work, which serves the tombstones and the key document. The only writes still accepted are password and OPAQUE login, reauthentication, logout and the account bundle, so a user who missed the notice can still sign in and take a copy.

The tombstones answer only while the machine answers. To keep the signed answers available after you switch it off, keep serving the read-only server, or at least `/.well-known/telium/server` and the key document, for as long as you hold the domain.
