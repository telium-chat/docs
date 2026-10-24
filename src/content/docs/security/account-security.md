---
title: Account security
description: OPAQUE login, MFA, devices and revocation, the recovery key, password reset, recovery email and account lifecycle.
sidebar:
  order: 2
---

This page covers how your account home authenticates you and protects your account: password login, MFA, devices, the recovery key, password reset and account deletion. Identity roots and guardians are on [Identity continuity](/docs/security/identity-continuity/). DM key custody is on [DM encryption](/docs/security/dm-encryption/).

## Account ids

Account ids have the form `@localpart:server.name`. Registration lowercases the localpart, so `Alice` and `alice` are the same account. The capitalization you typed can become your initial display name.

The account id is a routing address. Your cryptographic identity is the immutable `tid:`, described on [Identity continuity](/docs/security/identity-continuity/).

## Password login (OPAQUE)

Current homeservers use OPAQUE (RFC 9807). Your client runs a start/finish exchange, and the password does not leave the client. The server stores an OPAQUE registration record, not a reusable password verifier. A successful exchange gives the client an export key that the server never sees; the client uses it to wrap your recovery keyring.

```text
POST /_telium/v1/register/opaque/start      POST /_telium/v1/register/opaque/finish
POST /_telium/v1/login/opaque/start         POST /_telium/v1/login/opaque/finish
POST /_telium/v1/auth/opaque/enroll/start   POST /_telium/v1/auth/opaque/enroll/finish
POST /_telium/v1/auth/opaque/reauth/start   POST /_telium/v1/auth/opaque/reauth/finish
POST /_telium/v1/password-reset/opaque/start
POST /_telium/v1/password-reset/opaque/finish
```

Downgrade handling:

- A failed OPAQUE login does not fall back to sending the raw password.
- An account created before OPAQUE needs one legacy login to enroll. That login sends the password to the server once. The client asks you to confirm it with an explicit **Upgrade this account** action. After enrollment, the legacy endpoint refuses that account.
- Once your client has seen OPAQUE at a homeserver URL, it remembers that. If the server later stops advertising OPAQUE, the client refuses to log in instead of falling back.
- A client contacting a server for the first time cannot know the server used to support OPAQUE. A server that presents itself as legacy can offer the weaker path, and you must choose it explicitly.

## Sensitive reauthentication

A bearer session alone cannot perform sensitive operations such as managing MFA, deactivating or deleting the account, authorizing a migration, or replacing the recovery key. The client runs a fresh OPAQUE exchange and receives a short-lived, one-use proof for that operation. The password is not sent in those requests.

## Sessions and devices

Each login creates a home session tied to a device. You can list devices, revoke one, sign out the current session (`POST /_telium/v1/logout`) or sign out everywhere (`POST /_telium/v1/logout-all`). Revoking a device also retires its push registrations. Bearer tokens are stored as hashes.

### Signed revocation

Ending a session stops the server talking to that device, but its MLS key stays in every group it joined. A client that holds your cross-signing root revokes a device with a statement the root signs:

```text
DELETE /_telium/v1/devices/{device_id}
{ "mls_key": "<device leaf key, base64>", "signature": "<root signature>" }

signed bytes: telium-device-revoke:v1|{user_id}|{tid}|{device_id}|{mls_key}
```

The server checks the signature against the account's current root before changing anything:

| Result | Meaning |
| --- | --- |
| `409` | The account has no identity anchor. |
| `401` | The signature is invalid. |
| `{ "ok": true, "revoked": [...] }` | Revoked. |

On success the server stores the statement, ends every session carrying that key, clears the device's cross-signature, deletes its KeyPackages and sends the revocation notice. Afterwards it answers `403` to a KeyPackage upload, cross-signature, message or rejoin from that key.

The server serves the statements in `revocations` on `GET /_telium/v1/crosssigning` and `GET /_telium/v1/users/{id}/devices`. Clients keep only statements signed by a root in the account's verified chain and enforce them themselves (see [Revoked devices](/docs/security/dm-encryption/#revoked-devices)). The server can withhold a statement but cannot forge one.

A `DELETE` without a body still works. It ends the session and enforces nothing cryptographically. Clients send it when they have no unlocked root or the device never had a signed key.

### Root rotation

`POST /_telium/v1/identity/rotate` needs, besides the old root's or the guardians' authorization:

- `new_key_signature`: the new root's signature over the rotation payload. Missing or invalid gets `401`. Clients refuse a transition past their pinned sequence without it.
- `device_signatures: [{ device_id, mls_key, signature }]`: the devices that stay, re-signed under the new root. A bad signature gets `401`, a revoked key `403`. Devices not listed lose their cross-signature.

## MFA

Telium supports TOTP. You set up an authenticator, and MFA is enabled only after you verify a code. You get one-time recovery codes, stored hashed; each works once. Disabling MFA needs fresh reauthentication.

MFA protects login. It does not replace identity-root authorization, device cross-signing or MLS key custody.

## Recovery key

New accounts get a recovery key of the form `telium-recovery-v1-...`, generated on the client and shown before you enter the app. Save it somewhere separate from your password. The server stores only its Ed25519 public key. The key is domain-separated into two uses: authorizing a password reset, and opening an independent encrypted copy of your recovery keyring.

- **Existing accounts** created before recovery keys can enroll one from settings. Enrollment needs fresh reauthentication and does not replace a recovery mechanism you already have.
- **Replacing the key** also needs fresh reauthentication (`replace_recovery_key: true` on the reauth finish). The server swaps the public key and the keyring copy in one transaction. A failure leaves the old key and copy in place.
- **A missing keyring copy** can be restored by entering the key in **Settings > Recovery**. The key signs a one-use server challenge together with the new copy (domain label `telium-recovery-k1-restore:v1`). The server writes the copy only if the signature verifies against the enrolled public key and no copy exists. The challenge is spent even when the proof fails.

## Password reset

**Forgot password?** resets your password with the recovery key:

1. The client starts an OPAQUE reset and builds the replacement registration record.
2. The server returns a short-lived, one-use challenge.
3. The client signs the challenge, account id, reset id and the exact replacement record with the recovery key.
4. The server verifies the signature against the enrolled public key and commits the new record.
5. The server revokes existing sessions and creates a new one.

The server deletes the challenge before checking the proof, so a failed attempt spends it. The private key is never sent. Binding the signature to the exact record stops a server or intermediary from substituting a different password.

A reset changes how you log in. It does not change your `tid:`, root history, guardian policy or cross-signing rows. After the reset, the client opens the recovery key's copy of your keyring and re-wraps it under the new password.

Guardians cannot reset a password. They authorize identity-root transitions only (see [Identity continuity](/docs/security/identity-continuity/#threshold-recovery)).

## Recovery email

A recovery email receives migration warnings and account notices. When an account or owned guild move is requested and the operator has configured `[mail]`, the warning carries a one-use, signed-out link that cancels the move during its cooling-off window.

The mailbox is a notification channel. Controlling it does not authorize a password reset, an identity-root change or a guardian approval.

- States: `none`, `pending`, `verified`, `bounced`. Only `verified` receives notices. While a replacement is pending, the old verified address keeps receiving them.
- Claiming or removing an address needs fresh reauthentication.
- Each message has two links, neither of which signs you in: `confirm` binds the address, and `disown` detaches it and suppresses it server-wide for 30 days. `GET` renders a page; the action is a `POST`. Links expire after 24 hours.
- Delivery retries after 2 s and 8 s on transport errors or 5xx, not on 4xx.
- Rate limits: 5 verifications per mailbox per 24 h, 10 notices per mailbox per hour, 15 messages per account per hour, 500 per server per hour.
- Hard bounces arrive at `POST /_telium/v1/admin/mail/bounce` (admin). A hard bounce retires the address, and the client receives a `RECOVERY_EMAIL_UPDATE` gateway event.
- The address is not carried in migration bundles, and account deletion removes it.
- Without `[mail]`, the server reports `recovery_email: false` in its features.

## Deactivation, export and deletion

| Action | Effect |
| --- | --- |
| Deactivate (`POST /_telium/v1/account/deactivate`) | Disables the account and keeps what is needed to reactivate it. |
| Reactivate (`POST /_telium/v1/account/reactivate`) | Needs valid credentials, and MFA if enabled. |
| Export (`GET /_telium/v1/account/export`) | Downloads data your home holds. Guild history hosted on other servers is not included. |
| Delete (`DELETE /_telium/v1/account`) | Removes or anonymizes private, profile and security data on your home and revokes sessions and devices. Tombstones stay so the id cannot be reused unsafely. Messages stored by other guild servers are not erased. |

## Web client trust

OPAQUE protects your password from the server's login endpoint. It cannot protect a password typed into malicious JavaScript, and end-to-end encryption cannot hide plaintext from the code that renders it. If your homeserver also serves your web client, it is part of what you trust. For protection against a malicious homeserver, use a packaged client or a web client from an origin you trust independently.
