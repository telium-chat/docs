---
title: Account and guild migration
description: Move an account or a guild to another Telium server, what travels in the bundle, and how to recover a stuck move.
sidebar:
  order: 2
---

You can move an account or a guild from one Telium server to another. This page covers the steps, the authorizations a move needs, the cooling-off window, what the bundle carries, how the transfer handles failure, and the tombstone that keeps old ids resolving.

A move runs in a fixed order: grant, transfer, acknowledge, tombstone, stand down. The source destroys nothing until the destination has acknowledged a complete import.

:::caution[Account moves start a new cryptographic identity]
An account move does not yet carry the source account's `tid:` [identity continuity](/security/identity-continuity/) chain. The destination account keeps its own immutable identity. Contacts' clients treat the moved account as a new identity and must verify it again. The identities you have pinned for your contacts (`identity.pins.v1`) do travel, sealed, in the sync store.
:::

## Authorization

A move needs three independent proofs:

| Proof | Guards against |
| --- | --- |
| An import claim issued by the destination to an account you control there | A source pushing you somewhere you never agreed to |
| Your source account password, re-entered | A stolen session token |
| An Ed25519 signature from a device already on the account | A phished password |

A guild move also requires that you are the guild's owner on the source.

## Moving, step by step

### Guided flow

1. On the source, open **Move this account** in account settings. For a guild, use **Server Settings → Overview → Move to another server**. Enter the destination.
2. The destination's own web client opens in a new window. Sign in or register the account that should receive the move (for a guild, the account that will own it there), then confirm **Receive this account** or **Receive this guild**.
3. Back on the source, the dialog names the account or new owner the move lands on. Re-enter your source password. Your device signs the grant locally.
4. The client shows the move as **scheduled, not completed** and points to the cancel control.

The source client finds the destination page from the destination's own discovery document (`client`, set by `[web] client_url` or `public_base_url`). If the destination publishes no web client, the dialog switches to an import code.

### Import code

Available for both accounts and guilds under **Use an import code**:

1. On the destination, sign in and open **Settings → Account → Receive a move**. Enter the old account or guild id (and the old host for a guild). You get a short-lived, single-use import code.
2. On the source, open the move dialog, enter the destination and the code, and re-enter your password.

Your destination password never goes into the source client.

## Cooling-off window

`POST /_telium/v1/migrate` returns `{ "state": "pending", "executes_at": ... }`. Nothing has moved yet. Until `executes_at`, any signed-in device can cancel with no password or signature:

```text
POST /_telium/v1/migrate/{id}/cancel
```

The window length is set on the source:

```toml
[federation]
migration_delay_secs = 86400   # default; must be >= 0 and under 7 days
```

When the window ends, the server runs the move in its maintenance loop. Unreachable destinations back off from one minute, doubling up to an hour. `POST /_telium/v1/migrate/{id}/execute` runs a ready transfer inside the request.

### Alerts

When a move is scheduled or retried, the source warns the owner three ways:

- A `MIGRATION_ALERT` gateway event to every session of the account (or guild owner).
- A content-free push wake to every registered device.
- An email to the verified recovery address, if one is set and the server has a mailer. It names the destination and deadline (UTC) and carries a cancel link that works signed out.

Every client shows a banner with the destination, the deadline and **Cancel move**. Alerts never block the move: it proceeds whether or not the email was delivered.

Mail is configured under `[mail]`:

```toml
[mail]
mode = "webhook"                     # "none" (default) sends nothing
webhook_url = "https://mail-relay.example/send"
# webhook_token = "..."              # sent as a bearer token
# from = "noreply@chat.example"      # default: noreply@<server_name>
```

The webhook receives `{ "to", "from", "subject", "text" }` as JSON. There is no built-in SMTP client.

The cancel link (`/_telium/v1/migrate/cancel-link?t=...`) is signed by the server, single-use and valid until `executes_at`. Opening it shows a confirmation page; submitting the form cancels. A `retry` restarts the window and invalidates earlier links, and so does rotating the server key.

## Retry

After the window, a move cannot be cancelled. A `failed` move can be retried under the same migration id:

```text
POST /_telium/v1/migrate/{id}/retry
  { "import_token", "device_signature", "created_at", "password" | "reauth_token" }
```

- Send all four claim fields or no body. No body retries under the stored claim.
- A new claim needs the password or a reauth token.
- The body must be `application/json` (`400`) with only known fields (`422`).
- Every retry restarts the cooling-off window.
- Retry is refused while another move of the same subject is live.

A subject moves once. A move is refused if it already has a `moved` tombstone.

## What travels

### Account bundle

| Carried | Notes |
| --- | --- |
| Profile, devices, friends, message-request decisions | Public profile-link switches included |
| Key vault | Ciphertext only, never the escrow key |
| History backup (`key_backup`) | Ciphertext, newest first, up to 16 MB |
| Sync store | Allowlisted keys only (below) |
| Your own undelivered DM frames | Only for conversations the destination sequences |
| Your uploads, with bytes | Up to 96 MB raw and 10,000 objects; the rest is fetched after the move |
| Guild memberships | Local and on other servers, with signed proofs |
| Account history | `original_created_at` and the chain of prior ids |

| Stays behind | Do this at the destination |
| --- | --- |
| Recovery email | Set it again |
| TOTP and recovery codes | Enroll the second factor again |
| Push subscriptions, notification devices | Devices re-enroll when they sign in |
| Sessions, password hash, OPAQUE record, escrow key | Sign in normally |
| DM history | Conversations re-anchor; no plaintext moves |

Synced keys that travel: `prefs.v1` (without `voiceRegion` and the per-device rich presence switches), `emoji.recent.v1`, `emoji.tone.v1`, `gif.favorites.v1`, and, when sealed, `stickers.saved.v1`, `drafts.v2` and `identity.pins.v1`. `drafts.v1` and unknown keys stay. Each value counts against the destination's `limits.max_sync_store_bytes`. See [Sync encryption](/security/sync-encryption/).

The vault's custody mode at the destination:

| Exported as | Lands as |
| --- | --- |
| `self_custody` | `self_custody` |
| `opaque_custody` | `opaque_custody`, unlocked once with the recovery key, then re-wrapped for this server |
| `escrowed` or anything else | `device_custody` |

:::note
On first sign-in at the destination, the client reports the vault locked. Enter your recovery key when the client asks for it in Settings. Do not use **Forgot password?** for this: a reset there uses the recovery key the destination issued, and your moved vault is sealed under the old one.
:::

Uploads keep their hash and capability, so links work with the host swapped. The old origin answers `GET /_telium/v1/media/{hash}` with `307` to the new origin. Objects over the budget are pulled afterwards through `POST /_telium/v1/migrate/media/fetch` and `/confirm`. Encrypted DM bodies are never rewritten. See [Media](/features/media/).

### Guild bundle

The guild row and every guild table (channels, roles, threads, overwrites, emojis, stickers, members, messages, reactions, pins, read state, invites, AutoMod and origin rules, screening, voice regions, audit log), archived history, and emoji and sticker bytes. The source signs the bundle. Attachments move as references, since the media origin does not change.

At import:

- Ids are kept unless the destination already has that guild id, in which case all ids are renumbered. The vanity address and invite codes are kept where free.
- The claiming account becomes the owner.
- Archived history lands in `messages` and search is rebuilt.

## Remote guild memberships

Your home keeps a registry of guilds you belong to on other servers, fed by signed notices from guild servers (`POST /_telium/v1/users/{user_id}/memberships`) and by your client after each `READY` (`POST /_telium/v1/memberships`).

After an account import, the destination tells each guild server about the move with a signed `POST /_telium/v1/users/{old_id}/moved`. The guild server checks the old home's signed status before rewriting anything, and answers `409 try_again` until the old home says `moved`. The old home separately sends a `moved` revocation notice. See [Federation](/federation/overview/#identity-revocation-notices).

Retries start 30 seconds after import and back off to a one-hour cap, for 40 attempts (about two days). Check and retry from the destination:

| Endpoint | Action |
| --- | --- |
| `GET /_telium/v1/migrate/memberships` | Per guild server: state, attempts, next attempt, last error |
| `POST /_telium/v1/migrate/memberships/retry` | Requeue failed rows now |

The same list appears in **Settings → Account** under **Guild memberships that moved here**, with **Try again**. A guild server that never hears still remaps the membership the next time it revalidates the session.

## Transfer and failure

```text
POST {destination}/_telium/v1/migrate/import    { migration_id, import_token, bundle }
POST {destination}/_telium/v1/migrate/receipt   { migration_id }
```

The source asks `receipt` before every push. `404` means push; an acknowledgement means skip to the tombstone. The destination returns a co-signed acknowledgement with the new id, and only then does the source write the tombstone, deactivate the account (or freeze the guild) and delete sessions.

Destination limits:

| Limit | Value |
| --- | --- |
| Normal federation body | 4 MB |
| Migration import body | 160 MB, only for a caller holding a live claim |
| Live claims per account | 4 (a fifth drops the oldest) |
| Claim lifetime | 7 days |
| Pushes per claim | 5 |
| Large bodies in flight | 2 total, 1 per sender |

Refusals and what to do:

| Response | Meaning | Action |
| --- | --- | --- |
| `409 try_again` | Another push of this id is importing, or has landed | Wait. The source retries automatically |
| `409` id used by another server, or for a different subject | Migration id collision | Use a new migration id |
| `409` landed but never acknowledged | The subject is already on the destination | Do not push again. An operator must finish by hand |
| `409` claim already used | Spent claim | Ask `receipt` |
| `409` claim failed too many times | Five attempts used | Get a new claim, then `retry` |
| `403` claim expired, wrong source, or no match | Claim not usable by this origin | Get a new claim and `retry`, or ask `receipt` |
| `409` newer protocol version | Destination is older than source | Upgrade the destination, then `retry` |
| `413` body too large | Usually a spent or expired claim | Check the claim, then `retry` with a new one |
| `404` from `receipt` | Nothing landed | Push |

A `409`, `403` or `413` parks the move as `failed`. Other errors leave it `ready` for the next sweep.

## Tombstones

The source publishes a `moved` record signed three ways: by your device (authorized), the new server (received) and the old server (published).

- `GET /_telium/v1/users/{id}/status` on a moved account returns the tombstone, not `404`.
- `GET /_telium/v1/guilds/{id}` on a moved guild returns `new_id`. Old invite links keep working.
- Message history keeps the old id and resolves it through the tombstone.
- The guild's vanity address answers `moved` and forwards to the destination.

A moved guild's rows stay on the source as a read-only archive, and deleting it is refused. To reclaim the space, a server admin calls `POST /_telium/v1/admin/guilds/{guild_id}/purge`. It drops messages, channels, roles and archives, and keeps the tombstone and membership rows.

## Whole-server moves

Renaming or shutting down a whole server is separate from per-account migration. See [Relocation](/self-hosting/relocation/), [Sunset](/self-hosting/sunset/) and [Warm standby](/self-hosting/warm-standby/).
