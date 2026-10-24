---
title: Identity continuity
description: The immutable tid identity, signed root rotation, guardian recovery, and the first-contact limit.
sidebar:
  order: 5
---

An account address such as `@alice:home.example` is a routing address. The cryptographic identity is a self-certifying `tid:` that clients verify themselves. This page covers how that identity is created, rotated and recovered, and where its protection ends.

```text
tid:<hex>  =  SHA-256("telium-identity-id:v1\0" || genesis cross-signing public key)
```

The homeserver stores and publishes the identity state. Clients verify it locally.

## Genesis

The first time a client holds the account's cross-signing private key, it anchors the public key as sequence zero. The anchor carries the genesis key's signature over the account address, the `tid:` and the key, so the server cannot change the address in the document without breaking the proof. Every client re-derives the `tid:`.

After anchoring, `PUT /_telium/v1/crosssigning` can update the encrypted storage for the same key but cannot replace the public root.

## Root rotation

A new root is accepted only as the next link in the chain:

```text
R0 --authorized--> R1 --authorized--> R2
```

The sequence must increase by exactly one, and `previous_key` must equal the verified head. A rotation is signed by the previous root (or by guardians, below) and also by the new root over the same payload (`new_key_signature`), so the chain can only extend to a key the account holds. Clients accept a transition without `new_key_signature` only at or below a sequence they had already pinned. The same request re-signs the devices that stay ([Account security](/security/account-security/#root-rotation)).

Device revocations are signed by a root in the chain and bound to the `tid:`. Clients accept a revocation from any root in the verified chain, so a compromised old root could revoke devices (denial of service) but could not add one.

## Threshold recovery

An account can publish a root-signed recovery policy naming two to five guardians. The current UI sets up three guardians with a threshold of two.

- A guardian must be someone the account has cryptographically verified. Friendship is not enough.
- Each entry binds the guardian's account address, `tid:` and the root key selected when the policy was signed.
- Guardian slots must use distinct signing keys, so one key cannot fill two slots.
- One guardian cannot recover the identity alone. The homeserver is not a guardian and cannot produce guardian signatures.
- Replacing the policy increments its version. Only the newest policy at a given identity state can authorize recovery.
- A guardian's later root rotation does not update your policy. Replace the policy to adopt their new root.

Guardians gain no access to your password, OPAQUE export key, DM recovery keyring or MLS state. Guardians authorize identity-root transitions only; they cannot reset your password. Password reset uses the recovery key ([Account security](/security/account-security/#password-reset)) and leaves the `tid:`, root history, guardian policy and cross-signing rows unchanged.

:::note[Guardian lists are public]
The continuity document publishes signed recovery policies so other clients can check which guardian set was active. Your guardians' account ids, `tid:`s and policy history are visible to anyone who fetches it.
:::

## Verification

When both accounts support continuity, human verification binds to the `tid:`. The SAS (emoji) exchange also carries a signature by the root being verified, so a device that only knows a server-supplied root cannot turn an emoji match into account-level verification.

After an authorized rotation, a verified contact checks the chain and keeps treating the account as the same person. These count as an identity change:

- an unauthorized replacement root;
- a broken transition chain;
- a different `tid:`;
- the continuity endpoint disappearing after the identity was pinned.

A changed identity cannot authorize a trusted device or rejoin.

Clients pin the `tid:`, the highest verified root sequence and current root, and the recovery-policy version. Later documents must extend that checkpoint, and the counters cannot go backwards. A policy version that first appears after a checkpoint cannot be signed by a root already retired at that checkpoint. This stops a server replaying an old chain prefix, reviving a revoked guardian set, or presenting new state signed by a retired root.

Pins sync across your own devices, sealed ([Sync encryption](/security/sync-encryption/#identity-pins)).

## What the client checks

The homeserver can store, omit, replay or rewrite its database. The security boundary is the client, which:

1. requires the continuity document to name the requested address;
2. derives the `tid:` from the genesis key;
3. verifies the ordered transition chain;
4. verifies each recovery policy against the root that signed it;
5. verifies threshold guardian signatures when used, with independent keys per slot;
6. compares the `tid:` with its local pin;
7. requires the chain to contain its last pinned checkpoint, with no decrease in root sequence or policy version;
8. rejects new policy versions signed by roots already retired at that checkpoint.

A malicious homeserver can deny service or withhold history. It cannot create a valid transition without an authorized private key.

## Limits

:::caution[First contact]
Continuity does not protect first contact. If Bob has never seen Alice, a malicious Alice homeserver can show Bob a fabricated identity while showing everyone else the real one. Bob has no earlier pin to compare against.
:::

The same applies to a brand-new device of an account whose checkpoint has never reached it. A new device of an account that already has other devices is covered once its keyring opens, because it receives their synced pins.

Other limits:

- An [account move](/federation/migration/) does not carry the `tid:` chain. The destination account has its own identity, clients treat it as new, and contacts must verify it again.
- Legacy homeservers stay usable until an identity has been pinned.
- Identity revocation notices sent to guild servers when a device is revoked or an account moves affect sessions only. They do not change which key a contact has pinned.
