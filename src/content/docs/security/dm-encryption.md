---
title: DM encryption
description: How Telium encrypts direct and group messages with MLS, how keys are recovered on a new device, and what servers still see.
sidebar:
  order: 3
---

Direct messages and group DMs use MLS (RFC 9420). Your client encrypts message bodies, attachment keys, reactions, edits, pins and other conversation signals before your homeserver receives them. This page covers key custody and recovery, device trust, the conversation sequencer, and what the infrastructure can still see.

:::caution
Only DMs and group DMs are end-to-end encrypted. Guild channels are not; see [Privacy](/security/privacy/). Typing indicators in DMs are also sent in plaintext.
:::

## Key custody

Your account has an MLS **recovery keyring**, stored on your homeserver as an encrypted vault. The keyring:

- opens the recovery GroupInfo used to rejoin existing conversations;
- opens the encrypted history mirror;
- protects your cross-signing secret, which the server stores as ciphertext.

The vault's custody mode decides who can open it:

| Mode | Opened by | Server can open it |
| --- | --- | --- |
| `opaque_custody` (default) | Your password, through the OPAQUE export key; also the recovery key | No |
| `device_custody` | A trusted device handing the keyring over | No |
| `escrowed` (legacy) | A wrapper key the server holds | Yes |

### Password and recovery key

With `opaque_custody`, OPAQUE gives your client an export key the server never receives. The client derives the vault wrapper from it with HMAC-SHA256. A new device signs in with your normal password and recovers the keyring without a second password and without another device online.

New accounts also get a recovery key (`telium-recovery-v1-...`). The server stores only its Ed25519 public key. The key is separately derived into a wrapper for a second encrypted copy of the keyring, stored as the `k1.` entry in `independent_ciphertext`. This copy opens on any server, which is how a vault that moved with your account opens at the destination. Password reset with the recovery key is on [Account security](/security/account-security/#password-reset).

The server stores the OPAQUE registration record and encrypted recovery data. It holds no password-equivalent value that opens the vault, and it never receives the recovery key.

Rules for the `k1.` copy:

- `POST /_telium/v1/vault/mode` keeps the stored copy unless the request sends `clear_independent: true`. The web client clears it when leaving escrow and when you remove a legacy passphrase copy. Changing custody mode alone does not clear it.
- Replacing the recovery key swaps the public key and the `k1.` copy in one transaction, and never overwrites a legacy `p2.` passphrase copy.
- If the copy is missing, **Settings > Recovery** asks for the key and restores it through `POST /_telium/v1/auth/recovery-key/vault-copy/start` and `.../finish`. The key signs `telium-recovery-k1-restore:v1|{user}|{attempt}|{challenge}|{ciphertext}`, and the server writes the copy only where none exists.

Older accounts may have an independent recovery passphrase. Clients still unlock with it, and settings can remove it once the OPAQUE and recovery-key paths are working.

### Accounts created before OPAQUE

An old account has an Argon2 password verifier. A current client does one legacy login, which sends the password to the server that one time, then replaces the verifier with an OPAQUE record. The client asks for an explicit **Upgrade this account** action first. Downgrade rules are on [Account security](/security/account-security/#password-login-opaque).

On a homeserver that does not advertise OPAQUE, `device_custody` is the fallback: the keyring stays on approved devices, and a new device needs a trusted device to hand it over.

### Trusted-device handoff

Two of your devices can compare verification emoji (SAS), derive an end-to-end channel and transfer the cross-signing secret and recovery keyring. With OPAQUE this is optional.

### Legacy escrow

In `escrowed` mode the server holds a key that opens the vault, so the operator can recover your GroupInfo and history mirror. Current clients move accounts out of escrow at first sign-in. Leaving escrow rotates the live recovery key; the old key stays in your new keyring as a retired key so older history stays readable. New recovery material is written under a key the server never held.

:::caution
No software can prove a server forgot a key. Treat history that was readable during escrow as exposed. Rotation protects current and future material only.
:::

## Vault writes

Vault writes are compare-and-swap. `PUT /_telium/v1/vault` and `POST /_telium/v1/vault/mode` take `expected_version`; `0` means "only if no vault exists". A stale version gets `409 vault_version_conflict` with the current `version`. A request without `expected_version` is written unconditionally, for older clients.

On a conflict the client reloads. If the vault still opens to the same live key, it retries once at the new version. Otherwise it refuses locally (`vault_changed`) and loads the server's vault instead of overwriting it.

The client does not discard a keyring it holds:

- With no vault on the server, a device that holds a keyring uploads it. Only a device holding nothing creates a new key.
- If the server's vault opens to a keyring without the held live key, the server's live key stays live and the held key is kept as a retired key.
- **Escrow-exit pin.** Once a device has held the keyring outside escrow, it refuses a server that later presents an `escrowed` vault with a different live key, and writes its own keyring back. The pin clears when the device itself chooses escrow, or on sign-out.
- A device keeps a newly created or rotated keyring when the write's response is lost, since the write may have landed.

## Cross-signing and device trust

Your cross-signing secret signs each device's MLS leaf signature key. Accounts also anchor an immutable `tid:` and a signed root-transition chain ([Identity continuity](/security/identity-continuity/)). Once a client has pinned your identity, a homeserver cannot substitute a new cross-signing key by publishing it.

When building or expanding a group, the client checks that:

1. the identity inside each signed KeyPackage matches the user and device row the homeserver claims;
2. for accounts with cross-signing, the leaf key matches an active device cross-signed by the accepted identity.

A homeserver can omit a real device or deny service. It cannot add its own unsigned device to a new DM by returning an extra KeyPackage. Legacy accounts without a cross-signing root skip check 2; check 1 always applies.

A rejoin request ("add my missing device") is honored only for a device with a valid cross-signature under an accepted identity, and the named key must match the device's signed entry. SAS verification also carries a signature by the account root over the live transcript, so account-level verification requires the device to hold the identity key.

A device is its MLS leaf signature key, generated once per browser profile and account. The server-issued device id changes at each sign-in; the leaf keeps the id that first published it. If a profile loses its group state while its key is still in the tree, it rejoins with one external commit that removes the old leaf and adds the new one. Members refuse any external commit that removes a leaf other than the joiner's own.

## Revoked devices

A revocation signed by your account root ([Account security](/security/account-security/#signed-revocation)) is enforced by every client. Clients keep the verified revoked keys per account, re-read their own at start, and re-read a peer's on refresh. With that set, a client:

- does not use a KeyPackage with a revoked key and refuses rejoins from one;
- skips application frames and proposals from a revoked leaf;
- refuses commits by a revoked leaf, external joins by a revoked key, and commits that add a revoked KeyPackage;
- shows the leaf as `revoked` and warns in the DM header, as for a changed identity.

Your other devices remove revoked leaves of your account from each conversation when it opens.

Limits:

- A homeserver can withhold the statement. A peer that never sees it treats the device as unverified.
- A client with an older list may accept a commit that up-to-date clients refuse, until its next refresh.
- A revoked profile keeps its key. Signing in again in the same browser gets `403` on re-signing until the profile's MLS state is wiped.

## KeyPackages

Each device keeps twelve one-time KeyPackages on its home (`POST /_telium/v1/keypackages` with `packages`) and one last-resort package (`last_resort`, replacing any earlier one).

- A claim (`POST /_telium/v1/users/{user}/keypackages/claim`) returns one package per active device. A one-time package is deleted as it is served, so two claimers never get the same one.
- With no one-time package left, the last-resort package is served (`"last_resort": true`) and stays. Revocation deletes all of a device's packages. `DELETE /_telium/v1/keypackages/last-resort` withdraws it.
- Claims are rate-limited per (claimer, target): a burst of ten, then one a minute, `429` beyond. A federated claim is accepted only for a claimer on the requesting server.
- `GET /_telium/v1/keypackages` reports `available` and `last_resort` per device. The client tops up at start and after each Welcome.

A last-resort package's init key can serve more than one Welcome, which weakens forward secrecy for those groups' first epoch.

## History mirror

MLS forward secrecy means a new device cannot decrypt messages from before it joined. Telium mirrors content your account has already opened: each row is encrypted on the client under the live recovery key and uploaded. A new device recovers the keyring and restores the mirror. Rows under retired keys stay readable because the keyring keeps a bounded set of old keys.

This trades forward secrecy for recoverability. Anyone holding a valid recovery keyring can read the history mirrored under it.

## Message requests

A message request is an ordinary MLS DM. Only the recipient's home keeps its state (`pending`, `declined`, `accepted`), and that state is not federated.

- Your client may decrypt the first message for a preview. Pending requests raise no unread count, notification, typing indicator or call ringing.
- Decline hides the conversation and stops delivery without telling the sender. Block hides it too. Becoming friends later overrides an earlier decline.
- A second one-to-one from an identity that already has a DM with you is acknowledged but not stored. Requests over the inbox cap are filed away silently.
- Request state moves with the account. DMs from before message requests export as accepted.

## Receipts and delivery

A message is **sent** once the sequencer orders it, **delivered** once every other member has a device holding its plaintext, and **read** once every other member has read it. Read receipts and delivery acknowledgements (`DELIVERED`, tag `0x08`) are MLS application messages, so the server cannot tell them from messages.

An acknowledgement is a per-device watermark: `{ device, key, seq, id }`. Receivers check that the named key is the sending leaf's key, the position is behind the acknowledgement's own place and matches the named frame id, and the position only moves forward. An account acknowledging its own message counts for nothing.

| Setting | Default |
| --- | --- |
| Read receipts | Off |
| Delivery acknowledgements | On |

Both are per account with a per-conversation override, and both are reciprocal: if you turn one off, your client drops that signal from others too. Someone with acknowledgements off is left out of the sender's view and is never shown as "not delivered". One silent member keeps a message at **sent**.

## Group membership policy

The creator of a group chat can set a policy, stored in an MLS GroupContext extension (`0xF7A0`):

```json
{ "v": 1, "creator": "@alice:home.example",
  "add": "creator", "remove": "admins", "policy": "creator",
  "admins": ["@bob:guilds.example"] }
```

`add`, `remove` and `policy` each take `creator`, `admins` or `anyone`. The creator can always do all three. Changing the policy takes a signed commit, so a server cannot alter it.

Every member's client refuses a commit that adds a new account without the add right, removes another account without the remove right, or changes, adds or drops the policy without the right. A new device of an existing member and removing yourself are always allowed. A refused commit stops the conversation's sync with an error.

A policy is set only if every invited device advertises the extension; otherwise the group is created open and the creator is told. The sequencer keeps its own copy (`conversations.policy`) and refuses declared changes that violate it with `403`. The creator can withdraw the policy with `DELETE /_telium/v1/conversations/{id}/policy` before the first commit. A modified client that commits without declaring the change gets past the sequencer, but members' clients still refuse the commit.

## Sequencer rules

The conversation's sequencer orders frames. Errors a client can receive when posting to `POST /_telium/v1/conversations/{id}/messages`:

| Response | Cause |
| --- | --- |
| `409 epoch_conflict` | The commit does not claim stored epoch + 1. Includes `winner_seq`, `winner_epoch`, `winner_sender`, `winner_digest` and `winner_frame_id` when known. |
| `409 generation_conflict` | A second group beginning (founding or StartOver) from a generation that already started over. Includes the current `generation`. |
| `409 frame_id_reused` | A `frame_id` already used for different bytes. |
| `403` | A declared change violates the policy, or the sender's key is revoked. |
| `400` | `start_over` on anything but a Welcome at epoch 1, or without a generation. |

`frame_id` is the unpadded base64url SHA-256 of the ciphertext. Resending the same frame returns the original with `"replayed": true`, so retries are safe. An add, remove or policy change is one request carrying the commit, its Welcome and the declared `change`; a refused commit leaves no frame and no member row.

Leaving sends an MLS Remove proposal for each of the account's leaves, then calls `POST /_telium/v1/conversations/{id}/leave`. Any remaining member may commit those proposals. The server flags departed members (`resync`) until a remove commit for them is ordered.

## Reading a conversation

`GET /_telium/v1/conversations/{id}/messages` takes:

| Query | Returns |
| --- | --- |
| `tail=n` | The newest `n` frames. Used when opening a conversation. |
| `after=s&limit=n` | The oldest `n` frames above `s`, in order (default 100, max 500). Used to catch up. |
| `after=s&tail=n` | The newest `n` frames above `s`. |

A device must apply every commit in order, so catching up uses `after`. On a member home that is missing frames from a remote sequencer, a forward read first fills the gap from the sequencer. If it cannot, the answer stops below the gap with `incomplete: true, missing_from: <seq>`, and the client retries.

The client shows three states separately: frames not yet processed (withheld), earlier history this device cannot read (one history boundary), and an MLS key-schedule failure (one warning with a retry).

## What servers still see

The sequencer and homeservers see routing metadata: conversation membership, sender and sender device, frame kind, MLS epoch, sequence number, timestamps, ciphertext size and traffic timing. For a group with a policy, they also see the policy and each declared membership change. The history mirror exposes row identifiers, scopes, update times and ciphertext sizes. Typing indicators are plaintext gateway events, forwarded to remote members' homes. See [Privacy](/security/privacy/).

End-to-end encryption hides content. It does not hide that you communicated, with whom, or when.

## Web client trust

A malicious homeserver that serves a modified web client can read your password before OPAQUE runs, or take plaintext and keys after decryption. Protection against a malicious homeserver assumes a trusted client build, such as the desktop or mobile app or a web client from an origin you trust independently.
