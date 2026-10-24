---
title: Sync encryption
description: How the client seals synced preferences, drafts, stickers and identity pins so your homeserver stores them without reading them.
sidebar:
  order: 4
---

The sync store (`/_telium/v1/sync`) carries preferences, recent emoji, GIF favourites, saved stickers, message drafts and identity pins between your devices. Your client seals every value before upload. The homeserver stores, quotas, returns and migrates the values but cannot read them. This page covers the key, the envelope, what stops the server from tampering, and what it still learns.

## Key

The sync key comes from your MLS recovery keyring ([DM encryption](/docs/security/dm-encryption/#key-custody)):

```text
OPAQUE export key ─┐
recovery key (k1.) ├─> vault ─> recovery keyring R (32 random bytes, + up to 8 retired)
trusted device  ───┘                 │
                                     └─ HKDF-SHA256(IKM = R, salt = "telium/sealed-sync/v1")
                                          ├─ info "aead"   -> sync key, AES-256-GCM, non-extractable
                                          └─ info "key-id" -> kid (first 8 bytes, base64url)
```

The HKDF label is used for nothing else, so the sync key cannot open the vault or the history mirror. You recover it by the same paths that recover the keyring: password sign-in on an OPAQUE home, the recovery key, a trusted device, or a legacy recovery passphrase.

The key rotates when the keyring rotates, which today happens when an account leaves legacy escrow. Retired keys open old values; nothing new is sealed under them.

### Escrowed accounts

Under legacy `escrowed` custody the server can open the keyring and derive the sync key. Current clients move accounts out of escrow at first sign-in. Until then, preferences, emoji, GIF favourites and saved stickers are sealed (no worse than plaintext), and drafts are not synced.

## Envelope

```json
{ "sealed": "v1", "kid": "3q2-7wAAAAA", "iv": "…", "ct": "…" }
```

| Field | Meaning |
| --- | --- |
| `sealed` | Envelope version. A client leaves rows with an unknown version alone. |
| `kid` | Key id, derived from the keyring. Changes when it rotates. |
| `iv` | 96-bit random AES-GCM nonce, new for every seal. |
| `ct` | AES-256-GCM ciphertext and 128-bit tag. |

The associated data is `"telium/sealed-sync/v1" LF kid LF key-name`. The plaintext is a 4-byte big-endian length, the JSON `{"n": counter, "t": written_at_ms, "v": value}`, and zero padding.

Binding the key name stops the server from returning a value sealed as `gif.favorites.v1` under `prefs.v1`. Each account's keyring is its own 32 random bytes, so a value from another account fails authentication. The user id is not bound, so sealed values keep opening after an [account move](/docs/federation/migration/) or a [server relocation](/docs/self-hosting/relocation/).

## Rollback and replay

Each value carries a per-key counter `n`. A write seals one more than the highest `n` the device has seen for that key. A device refuses a value below its mark, keeps its own copy and writes it back. Equal counters are accepted and the sealed timestamp `t` decides.

The server cannot create a value, change one, move one between keys or accounts, or roll a device back past what it has seen. It can:

- show a device with no saved state (a new device, or one that signed out) any consistent older version of the store;
- withhold a key or all keys;
- keep accepting writes while returning an older value to other devices.

### Downgrade

- After the first sealed write sets `accounts.sync_sealed_at`, the server refuses plaintext writes with `409`.
- `drafts.v2`, `stickers.saved.v1` and `identity.pins.v1` are sealed-only. The server refuses plaintext for them with `400`.
- A client that has seen sealed state for the account treats a plaintext row for a known key as injected and writes its own copy back sealed.

A fresh device on an account that has never been sealed has nothing to check against, and the server can show it fabricated plaintext.

### Retired keys

Every retired key today is one a former escrow server held, so that server could still seal values under it. A client refuses a retired-key value, and writes its own copy back under the live key, when:

1. the key is sealed-only; or
2. the device's mark for the key came from the live key; or
3. the device has held any value under the live key.

Otherwise it adopts the value and reseals it under the live key. The rotating device rewrites every key under the new key right after rotation, which keeps this window short.

## Conflicts

The store is last-write-wins per key, decided by the writer's sealed timestamp, not the server's `updated_at`. Device-only fields (`voiceRegion` and the Rich Presence switches) stay local.

Drafts merge per target. Each entry is `{text, at}`, and clearing a draft leaves a tombstone, so a draft sent on one device clears on the others. Tombstones expire after 30 days.

## Limits

| Item | Limit |
| --- | --- |
| Synced drafts | 100 targets, 4000 characters each, 96 KiB total, newest kept |
| Saved stickers | 100 |
| Padding | At least 256 bytes, then the next power of two up to 64 KiB, then 64 KiB steps |
| Push delay | 1.5 s after a change; 15 s for drafts |

The device keeps its full local set of drafts. Signing out removes local drafts.

## What the server learns

| It learns | Notes |
| --- | --- |
| Key names | A fixed, public set: `prefs.v1`, `emoji.recent.v1`, `emoji.tone.v1`, `gif.favorites.v1`, `stickers.saved.v1`, `drafts.v2`, `identity.pins.v1`. The server sees that you use synced drafts or stickers, not their content or which channels they concern. |
| Size bucket | Padding hides exact sizes. |
| Timing | Every write is a request. Drafts show roughly when you were composing. |
| Key id | Stable until the keyring rotates. |
| Sealed state | `sync_sealed_at`, and which rows are envelopes. |

Counters are inside the ciphertext.

## Migration

| Key | Moves to the new server |
| --- | --- |
| `prefs.v1`, `emoji.recent.v1`, `emoji.tone.v1`, `gif.favorites.v1` | Yes. Sealed values move byte for byte; plaintext values move with device-only fields stripped. |
| `stickers.saved.v1`, `drafts.v2`, `identity.pins.v1` | Only sealed. |
| `drafts.v1`, unknown keys | No. |

The bundle carries `sync_sealed`, and the destination applies the same rules as a device write. Moved values open once you enter your recovery key at the destination. Until then the client works from its local copy and syncs nothing.

## Without the key

A session without the keyring does not write to the server. That happens before the vault loads, on a moved account before you enter the recovery key, and on a `device_custody` device waiting for a trusted device. Changes apply locally and sync once the keyring arrives.

A row with an unknown `kid` is overwritten if the device opened the keyring from the vault in this session. If its keyring came from its own cache or another device, the row is left alone until the device has the current keyring. A row that fails authentication under a key the device holds is refused and overwritten with the device's copy.

## Identity pins

`identity.pins.v1` syncs the [identity pins](/docs/security/identity-continuity/#verification) your browser holds for other people, so a new device starts from what your other devices already pinned. Each pin is `{ immutableId, sequence, currentKey, policyVersion, policySignature, verified }`.

Pins merge instead of last-write-wins. For the same identity, the further root, newer policy and `verified` flag are kept. A conflict (a different `tid:`, two roots at one sequence, or two policies at one version) is never resolved silently: a verified pin beats an unverified one, the conflict is recorded, and the person shows as `changed` until someone verifies them again.

Pins are stored per browser, not per account, so two accounts signed in to one browser share them. Under legacy escrow the home could read the pins (who you have met) but could not plant one without a valid sealed envelope.

## Older clients

Clients that do not request sealed rows (`?sealed=1`) do not receive them. On a sealed account such a client syncs nothing: its writes are refused and it works from its local copy. Current clients delete `drafts.v1` and carry its drafts into `drafts.v2` locally.
