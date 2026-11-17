---
title: Key custody design
description: Design for one key-custody path (opaque_custody), the states accounts can be in today, and the phased plan to remove the broken and legacy ones.
sidebar:
  order: 6
---

**Status: design, being implemented in phases.** Phases 0 to 3 are merged: the gate (#75), phase 1 (#76), phase 2 (#78) and phase 3 (#79). Phase 4 is merged (telium #80). Sections below describe the target; where a state is marked as fixed today it names the phase. The release gate it argues from is `web/src/test/fresh-device-login.test.js` in [telium-chat/telium](https://github.com/telium-chat/telium) (added in the custody-design pull request, #75), which runs against the built `telium-server`. For what users see today, read [DM encryption](/security/dm-encryption/#key-custody) and [Account security](/security/account-security/).

## Goal

There are two requirements, and the design has to meet both at once:

1. **People can message each other safely while trusting their homeserver as little as possible.** A homeserver that
   turns hostile must not be able to read messages, sign as a user, or quietly add a device to a conversation.
2. **A user can sign in on any device with their password and everything works,** as in other chat apps. That means
   the device can sign itself, its contacts accept it, it reads the history, and it sends and receives new messages.
   It needs no other device and no recovery key.

The agreed direction is one custody path, `opaque_custody`:

- The password goes through OPAQUE, which produces a client-only export key.
- The export key unwraps a single root secret.
- The account recovery key unwraps the same root secret directly.
- Device approval is an optional extra, not a mode.

`device_custody`, `self_custody`, `escrowed` and the throwaway-key seal for the root (`DEVICE_SEAL`) are refused by the
server and deleted outright, with no deprecation or migration window: no direct messages on the network matter yet
(there are only two test users), so there is nothing to carry forward. The server holds no escrow. The root signing key is always sealed under the root secret from the moment it exists.

Claims below are checked against the code at `fix/identity-downgrade-continuity` (a9b79a8) unless marked
**unverified**. "Gate" refers to a test in `fresh-device-login.test.js`.

---

## 1. Inventory: what exists today

### 1.1 Keys and where each one lives

| Key | What it is | Where it lives | Code |
|---|---|---|---|
| **History ring** (`ring.raw` plus up to 8 `retired`) | 32 random bytes. This is the de-facto root secret today. It seals: the DM history mirror (`Backup`), own GroupInfo frames (so a new device can join by external commit), sealed sync-store values (HKDF-derived), and the root signing key when that is `recovery-v1:`-sealed. | Server: `key_vault.ciphertext`, wrapped as described in 1.2, plus an optional second copy in `key_vault.independent_ciphertext`. Device: IndexedDB `telium-device-secrets`, slot `dm-recovery:<user>`. | `vault.js`, `device-secrets.js`, `backup.js`, `sealed-sync.js`, `mls.js` `publishGroupInfo`/`newestGroupInfo` |
| **Root signing key** (cross-signing secret) | Ed25519 key. It signs this account's device leaves (`telium-device-sig:v1`), verifications of other people (`telium-user-sig:v1/v2`), revocations, rotations and recovery policy. Its public half is anchored in the identity-continuity chain (immutable id). | Server: `cross_signing.sealed_secret`, in one of three forms (see 1.3). Device: IndexedDB `telium-mls`, store `identity`, key `crosssign:<user>`. A create still in flight is kept under `crosssign-pending:<pub>:<user>`. | `verify.js` `startOnce`, `mls-store.js` `keepSecret`/`keepPendingSecret`, `server/src/routes/identity/mod.rs` `put_cross_signing` |
| **Device MLS keys** | Per-sign-in MLS signature key (the leaf) and KeyPackages. One per session: every sign-in is a new MLS device. | IndexedDB `telium-mls` (`identity`, `packages`, `groups`, `opened`). Public KeyPackages go to the server. | `mls.js` |
| **Session token / `device_secret`** | Homeserver bearer token and per-device secret. This is authentication only, not E2EE. | localStorage `telium.session.v1` and the account registry. | `store/session.js`, `accounts.js` |
| **OPAQUE export key → password wrapper `W_pw`** | `W_pw = HMAC-SHA256(exportKey, "telium/dm-recovery-from-opaque-export/v1")`. The export key is produced on the client by OPAQUE register, login or reset, and the server never sees it. | **Memory only:** `store.authRecoveryWrapper`. It is lost on reload, in a second tab, and on account switch (`restart()`). | `opaque-auth.js` `recoveryWrapperFromExportKey`, `store/session.js` |
| **Account recovery key → `W_rk`, plus a reset signing key** | A 32-byte random seed shown to the user once (`telium-recovery-v1-…`). `W_rk = HMAC(seed, "telium/account-recovery-vault/v1")` wraps the ring copy `k1.…`. An Ed25519 key `HMAC(seed, "telium/account-recovery-sign/v1")` signs password resets, `k1` copy restores and identity resets (#74). Its public half is `accounts.recovery_public_key`. | The user (written down). Memory: `store.accountRecoveryWrapper`, present only at sign-up, after a reset, or after the user types it. sessionStorage `PENDING_RECOVERY_KEY` holds it until the user confirms it. | `account-recovery.js`, `opaque-auth.js` `registerOpaque`, `store/session.js` |
| **Legacy passphrase key** | `PBKDF2-SHA256(passphrase, salt, 600 000)`. The salt is either the fixed `telium/vault/v1` (old self-custody) or a 16-byte random salt (`p2.` format). | Server: `key_vault.ciphertext` (self_custody), or `independent_ciphertext` after migration. | `vault.js` `fromPassphrase` |
| **Escrow key** | 32 random bytes, stored in plaintext beside the ciphertext. | Server: `key_vault.escrow_key`. | `vault.js` `setMode('escrowed')`, `dm/vault.rs` |
| **Throwaway key** | 32 random bytes. It is used once to seal and then discarded, so the ciphertext can never be opened. | Nowhere. | `vault.js` (`device_custody` vault), `verify.js` (`DEVICE_SEAL`) |

The ring sits in two layers. `recovery-v1:` seals the root under the **ring's live key** (`vault.key`), not under
`W_pw`. So the full chain today is `password → export key → W_pw → ring → root`. When the ring rotates (on leaving
escrow), the old live key moves to `retired`, and that is why `startOnce` tries every opener in the ring.

### 1.2 Custody modes of the history ring (`key_vault`)

| Mode | How it is sealed | How it is opened | How an account gets here today |
|---|---|---|---|
| `opaque_custody` | `ciphertext = seal(W_pw, ring)`. An optional `independent_ciphertext` is either `k1.` + `seal(W_rk, ring)` or a legacy passphrase copy (`p2.` or unprefixed). | Uses `W_pw` if that session has it. Otherwise `W_rk` if the user typed the recovery key. Otherwise the legacy passphrase. Otherwise the locally held ring. Otherwise the vault is **locked** (`needs_password` / `needs_recovery_key` / `needs_device`). | The first start of a session that holds `W_pw` creates it. Any `W_pw` session that holds or opens the ring migrates the other modes into it. |
| `device_custody` | `ciphertext = seal(throwaway, ring)`, which nobody can open. | Only from a device that already holds the ring, or one that receives it from a sibling during SAS approval. | **The first start of a session without `W_pw`:** a restored session or second tab that finds no vault (`loadOnce`, `!vault.exists` branch). Also an escrowed vault opened by a session without `W_pw` (`lifecycle.js`). Legacy (non-OPAQUE) logins too. |
| `self_custody` | `PBKDF2(passphrase, fixed salt)` | The passphrase. | Legacy. No UI path that writes it was found (grep of `web/src/views`); `setMode` still supports it. |
| `escrowed` | `seal(escrow_key, ring)`, with `escrow_key` on the server. | By the server or any session. The server can read the history mirror. | Legacy default of older clients. |
| (none) | No row. `GET /vault` returns `mode:"none"`. | Nothing to open. | A new account before its first start, or any account whose vault write never landed. |

`setMode` out of `escrowed` rotates the ring. The escrow-exit pin (`device-secrets.js` `pinOutOfEscrow`) stops a
device that has held a non-escrowed ring from accepting an escrowed one with a different live key.

### 1.3 How the root is sealed (`cross_signing.sealed_secret`)

| Prefix | Sealed under | Written by |
|---|---|---|
| `recovery-v1:` | The ring's live key. | `startOnce` when `mode` is `opaque_custody` or `self_custody` *and* a ring key is in hand. `rotateRoot({recoveryKey})`. `recoverWithRecoveryKey({sealKey})` when `trustMethods.recoverIdentity` passes `vault.key` (only if `custodyMode()` is opaque or self). |
| `device-v1:` (`DEVICE_SEAL`) | A throwaway key. Only devices that hold it locally have it. | `startOnce` whenever `custodyMode()` is anything else. This includes **re-sealing an existing `recovery-v1:` root as `device-v1:`** (the `!wantRecovery && !deviceWrapped` branch). Also `rotateRoot()` without a key, and `recoverWithRecoveryKey` without `sealKey`. |
| unprefixed | The ring's live key (original format). | Old clients. Still read. |

`custodyMode()` (`store/trust.js`) returns `custody.mode`, else `vault.mode`, else **`device_custody`**. The custody
read is not awaited before the vault load (`lifecycle.js`), so it can be stale in either direction.

### 1.4 How a device gets the root and the ring today

- **Sign-up or sign-in with the password** (`W_pw` in memory). The device opens the ring from the vault, then opens
  the root if it is `recovery-v1:`. Gate: *signs up on one device, then a brand-new device…* passes.
- **Restored session** (reload, second tab, account switch; no `W_pw`). The device uses the locally held ring and
  root. If it holds neither, the vault is `locked` and the device cannot sign until the password is typed again.
- **Sibling approval (SAS).** `verify-sas.js` `handOverSecret` seals the root and the ring under a key derived from
  the SAS transcript. The receiver runs `adoptSecret` and `onRecoveryAdopted`; with `W_pw` in memory,
  `onRecoveryAdopted` moves the vault to `opaque_custody`. `adoptSecret` does **not** re-seal the server's
  `sealed_secret`.
- **Recovery key.** `unlockVault` opens `k1`. `recoverIdentity` (#74) starts a new immutable identity when the root is
  lost everywhere.
- **Password reset** (`resetPasswordOpaque`). The server swaps `opaque_record`, deletes all sessions, sets every
  device `active = 0` and announces revocation of all devices (`opaque.rs` `password_reset_finish`). It does not touch
  `cross_signing`. Through phase 2 it also did not touch `key_vault`: the primary copy stayed under the old
  `W_pw` until the resetting client's next vault load opened `k1` with `W_rk` and wrote a fresh one (`loadOnce`,
  `recoveryKeyPayload` branch), which no real-server test covered. Phase 3 (telium #79, merged) changed this:
  `password_reset_start` hands the recovery copy `R` to a caller that signs the request with the recovery key, the client
  opens it, and `password_reset_finish` carries the new `P` (inside the recovery-key signature) and writes it in the same
  transaction as the record. A reset that would leave an opaque vault with a `k1.` copy under the old password is
  refused. If the copy does not open under the key (an account moved here carries the source server's copy), the key's
  holder can sign "reset anyway, leave the vault"; the history stays locked, as it did before phase 3.
- **Password change.** Before phase 3 there was no password-change route: `opaque_record` is written only by
  `register_finish`, by `enroll_finish` (only where it is NULL), and by `password_reset_finish`. It is nulled on account
  deletion (`identity/mod.rs:708`). Phase 3 (telium #79, merged) added `POST /auth/opaque/password/change/start` and
  `/finish`, which replace the record and the vault in one transaction and end every other session and outstanding
  reauth proof.

---

## 2. Target model

### 2.1 Objects

- **AK, the account key.** This is today's history ring (live key plus retired keys), renamed to show it is the one
  root secret. Every account secret that must follow the user is sealed under AK:
  - the root signing key (`recovery-v1:`);
  - the history mirror;
  - own GroupInfo;
  - sealed sync.
- **Two wrappers of AK on the server, both in `key_vault`:**
  - `P` = `seal(W_pw, AK)` in `ciphertext`;
  - `R` = `k1.` + `seal(W_rk, AK)` in `independent_ciphertext`.
- **The root** = `recovery-v1:` + `seal(AK.live, rootSecret)` in `cross_signing.sealed_secret`.
- **Device holdings** (IndexedDB): AK, the root secret, the MLS leaf. Holding them is a cache, never the only copy.

`mode` stays in the schema for old rows but has one valid value for new writes, `opaque_custody`.

### 2.2 Invariants (the authority)

- **I1.** Custody objects (`key_vault` row, `cross_signing` row) are **created only by a session that holds `W_pw`**,
  and only inside sign-up/sign-in, *before* the session is saved where another tab can restore it. A session without
  `W_pw` never creates, downgrades or re-modes custody. It may only read, and do the one repair in I4.
- **I2.** A `cross_signing` row exists only if a `key_vault` row exists. The root is created only once AK is known and
  `P` has been accepted. Its seal is always `recovery-v1:` under AK's live key. There is no code path that writes
  `device-v1:`.
- **I3.** If `accounts.recovery_public_key` is set, `R` exists and opens to the same AK. Enrolling or replacing the
  recovery key writes `R` in the same request (this already holds: `reauth_finish` with
  `recovery_vault_ciphertext`).
- **I4.** A device that holds the root and AK, and sees the server's `sealed_secret` is not `recovery-v1:` under AK,
  re-seals it ("seal it properly now"). This is the only custody write allowed without `W_pw`.
- **I5.** Any write that changes the export key (password change, password reset, KSF parameter change) is atomic
  with writing the new `P`. The OPAQUE record and `P` never disagree.
- **I6.** A device keeps AK, and a root it is about to publish, locally *before* sending the write that creates them.
  This is already true for the root (`keepPendingSecret`) but not for AK.

### 2.3 States

Each state is the server tuple (vault, root seal, recovery copy). Device holdings are noted where they decide
recoverability.

**Target states:**

| # | State | Server | How an account reaches it |
|---|---|---|---|
| T0 | **Empty** | No vault, no root | Registration done, first start not yet run. Under I1 this exists only inside the sign-up request sequence. |
| T1 | **Vault only** | `P` (+`R`), no root | The vault write landed but the root write did not (lost answer, tab closed). Under I1 the sign-up call does not return until both have landed. |
| T2 | **Healthy** | `P` + `R` + `recovery-v1:` root | Normal. |
| T2n | **Healthy, no recovery key** | `P` + `recovery-v1:` root, `recovery_public_key` NULL | The user never enrolled a key (pre-recovery-key accounts, or a server that refused enrollment). Settings shows "Recovery key: Not made yet". |
| T3 | **Re-wrap pending** | `R` valid, `P` under an old export key | Before phase 3: after a password reset, before the resetting client's next vault load. Phase 3 (telium #79, merged) removed that cause: reset and change re-wrap `P` in the same write. It can still arise where there is no openable `R` to re-wrap from: L4 (copy missing), L5 (legacy passphrase copy, not `k1.`) and an account moved from another server whose copy does not open. The server leaves such a vault as it is. |
| T4 | **Reset identity** | As T2, with a new immutable id | The root was lost everywhere and was reset with the recovery key (#74). Contacts see "changed" until they compare emoji again. |
| TX | **Lost** | `P` unopenable (password forgotten), no `R`, no device holds AK | See 3.3. History and the root are gone; only #74 with a recovery key recovers, and there is none here. |

**Legacy and broken states.** These are not migrated. Phase 1 stops creating them, and phase 4 (merged in telium #80) refuses them and withdraws their key material (3.4); an account still in one is converted by a device that holds its keys (L1h), given a new vault (L1x, L6, L7), reset (L2x/L1x) or re-created.

| # | State | Server | How an account can be in it (verified unless marked) |
|---|---|---|---|
| L1 | **Device custody, root throwaway-sealed** | Vault `device_custody`, root `device-v1:` | A restored tab or second tab started before the sign-up tab and created the vault, and the sign-up tab never ran its own start (gate: *two tabs, and the restored one creates the vault…*; passes since phase 1). An escrowed vault opened without `W_pw` (`lifecycle.js` moves it to `device_custody`). Legacy-auth logins. **L1h:** a device still holds AK and the root. **L1x:** none does, and the account is unrecoverable except by #74 (root) and nothing at all (history). |
| L2 | **Opaque vault, root throwaway-sealed** | `P` (+`R`), root `device-v1:` | Accounts from before #70: the root was created while `custodyMode()` read `none` and fell back to `device_custody`. **It still arises today:** a device that holds the root restarts while `GET /vault` fails once (a 503). Trust.start then gets no ring key, and `startOnce` re-seals the server's `recovery-v1:` root as `device-v1:` (the `!wantRecovery && !deviceWrapped` branch). Phase 1 removed that branch; the gate *a device holding the root restarts while the vault read fails…* passes. A stale custody read has the same effect by the same branch (inferred; the two-tab orderings tested did not hit it). **L2h:** the holder exists. Gate: *…sealed properly once the device holding it restarts* passes; it is the heal from #70. **L2x:** no holder; #74 reset. Gate: *a legacy account whose root is throwaway-sealed and held only by its first device* (**fails, by construction**). |
| L3 | **Vault only, ring held by nobody** | `P` (+`R`), no root, and the creating tab never kept AK | The tab closed while the first vault write was in flight. `vault.js` remembers the ring only on an *unanswered error*, not on a request that never returns (gate: *the tab is closed while the first vault write is in flight…*; passes since phase 1). The device that made the account is locked until the password is typed again. A later password sign-in on any device recovers it. |
| L4 | **Recovery key enrolled, copy missing** | `recovery_public_key` set, `independent_ciphertext` NULL | Before #70, a second tab made a `device_custody` vault and the sign-up tab's migration dropped `R`. Also any server that lost or deleted `R`. Settings shows **"Needs reconnecting"** (`api.js` `recovery_copy_missing`). The key still resets the password and the identity, but opens no history. Repair: `restoreRecoveryCopy` (`recovery_copy_finish`). |
| L5 | **Legacy passphrase second copy** | `P` + `p2.`/unprefixed PBKDF2 copy in `independent_ciphertext` | `self_custody` migrated to opaque carries the old ciphertext forward (`loadOnce`, self_custody branch, `setMode(..., vault.ciphertext)`), or the user set an independent passphrase. Blocks recovery-key enrollment until removed. |
| L6 | **Self custody** | Vault `self_custody` | Legacy, and no longer migrated: the client refuses it (phase 4). It used to migrate to opaque (+L5) on the first `W_pw` session that held the ring or the passphrase. |
| L7 | **Escrowed** | Vault `escrowed`, `escrow_key` set | Legacy default. The server could read the mirror. Phase 4 refuses it; it used to leave on any start (to opaque with `W_pw`, to `device_custody` (L1) without). |
| L8 | **Recovery copy "Not made yet" despite a key** | Before #70: the UI read only local flags after a sibling handover | Fixed in #70 (`onRecoveryAdopted` keeps the read flags). Listed so later code does not reintroduce it. |

### 2.4 Transitions (target)

The required inputs are listed in parentheses. Anything not listed is refused.

| From → To | Event | Who | Notes |
|---|---|---|---|
| T0 → T2 | `signUp` (`W_pw`, `W_rk`) | Sign-up, before saving the session | Write `P`+`R` with CAS `expected_version: 0`, then the root with `create_only` sealed under AK. AK and the pending root are kept locally before each write (I6). Return only when both have landed, or retry on the next `W_pw` start. |
| T0 → T1 → T2 | Lost answer or crash between the two writes | Next `W_pw` start, or a held-AK start | A held-AK session may create the root (I2 needs only AK). It may not create the vault. |
| T2 → T2 | New device sign-in (`W_pw`) | Any device | Open `P` → AK → root. Sign own leaf. This is the gate. |
| T2 → T2 | Restored session (held AK + root) | Same device | No writes. If the held root ≠ the server's seal, apply I4. |
| T2 → T2 | Sibling approval (SAS) | Optional | Delivers AK and the root without the password. The receiver re-seals per I4 if needed. It never changes mode. |
| T2 → T2 | Password change (old `W_pw`, new `W_pw`) | **New route** | One request: reauth proof + new OPAQUE record + new `P`, with CAS on the vault version (I5). |
| T2 → T2 | Password reset (`W_rk` + recovery signature) | Signed-out device | The client opens `R` first, then sends the new OPAQUE record **and the new `P`** in `password_reset_finish` (I5). This removes T3. |
| T2 → T2 | Replace recovery key (`W_pw` reauth) | Signed in | Already one request (`reauth_finish`). |
| T2n → T2 | Enroll recovery key (`W_pw` reauth) | Signed in | Exists (`enrollRecoveryKey`). |
| T2 → T4 | Identity reset (recovery signature, AK) | Device with AK but no root | #74. `sealKey` must always be AK. Refuse if AK is not held, instead of falling back to `DEVICE_SEAL`. |
| T2 → TX | Password forgotten, no `R`, no holder | — | Terminal for history. |

---

## 3. Open questions and recommendations

### 3.1 Sessions without the OPAQUE export key

**Today.** A restored session (reload, second tab, account switch) has no `W_pw`. These are verified in code:
`authRecoveryWrapper` is set only by `signIn` and `resetPassword`, cleared by `signOut`, and set to `null` in the
`Store` constructor, which is what a restored session runs. Electron, Tauri and Android shells are **unverified**: their session restore was not traced. Such a
session that finds no vault creates a `device_custody` vault and a `device-v1:` root (L1). One that holds nothing
for an existing vault is locked.

**Recommendation.**

1. A session without `W_pw` never creates custody (I1). Sign-up and sign-in create the vault and root before calling
   `save()`, so the only tab that can restore a session is one started after custody exists. This removes L1 and L3
   at the source and flips two gates.
2. Keep AK locally before sending the vault create (I6), mirroring `keepPendingSecret`. Then a tab closed mid-write
   loses nothing.
3. A token-only device that holds AK and the root keeps working indefinitely; holding them is how a device "keeps"
   them. A token-only device that holds neither shows "Enter your password to unlock messages on this device". It
   does not offer a mode choice.
4. Do not persist `W_pw` or the export key. A device-bound wrapping (non-extractable WebCrypto key) of AK at rest
   could replace the raw bytes in IndexedDB. That is hardening against disk theft, not custody, so it is out of
   scope here.

### 3.2 Password change and reset must keep the same AK

Changing the password changes the export key, and so `W_pw`. AK must stay the same, so `R` and everything sealed
under AK keep working.

**Recommendation.**

- Add `POST /auth/opaque/password/change/start` and `/finish`. Finish takes a reauth proof, the new registration record and the new `P`,
  with `expected_version`. It updates `accounts.opaque_record` and `key_vault.ciphertext` in one transaction, and spends the reauth proof in that same transaction.
- Extend `password_reset_finish` to accept the new `P` and write it in the same transaction. The client can compute
  it because it opens `R` with the recovery key before sending finish, and the new export key exists after
  `finishRegistration`. `R` reaches the client from `password_reset_start`, which hands it out only against a
  recovery-key signature over the request. The new `P` and the version it replaces are inside the signature on finish.
  A reset that would leave an `opaque_custody` vault with a `k1.` copy under the old password is refused (`vault_rewrap_required`).
- Keep the `loadOnce` re-wrap-from-`R` path as a fallback for resets made by older clients. The read from `R` happens at any start; the re-seal write is gated by `reseal: true`, so it happens only at a sign-in or an unlock, where the password key is the one just typed.

Changing the KSF parameters (3.5) is the same operation: re-register at the next sign-in, while the password is in
hand, and write the new `P` in that same request.

### 3.3 Password forgotten and no recovery key

**History is lost.** No party holds a key that opens `P` without the password, and that is the point of the design.
The root is also lost unless a device still holds it.

- If a device still holds AK, the user can keep reading there, but cannot reset the password: `password_reset_*`
  requires the recovery-key signature.
- `enrollRecoveryKey` needs the current password (`reauthenticateOpaque`), so that device cannot make a new recovery
  key either.

The recovery *email* (`routes/recovery.rs`) is a notice address with confirm and disown links. No password reset was
found that uses it (**unverified** beyond reading that file).

**Recommendation.**

- **Sign-up must not finish until the server-side recovery copy `R` is confirmed written.** The app already makes the
  user click "yes, I saved it", so no new blocking step is added for that. The real bug is that `R` is sometimes not
  written, and Settings then shows "Not made yet" although the user did everything asked. The user's
  acknowledgement and the server's copy are two separate facts. Sign-up completes only when the vault write that
  carries `R` has been accepted and read back (I3); the acknowledgement is recorded on its own and never stands in
  for it. If the write fails, sign-up retries or reports the failure instead of returning success.
- **Root-signed recovery-key enrollment (decision: recommended yes, kept as a recommendation).** A device that holds
  the root may enroll a new recovery key without the password, behind a fresh confirmation on that device. That
  rescues "forgot password, still signed in somewhere". The cost is that a stolen unlocked device could mint a
  recovery key, which the fresh confirmation is there to limit.

### 3.4 Legacy modes: refuse and delete

There is no migration window. Phase 1 stops the client creating legacy state. Phase 4 (merged in telium #80) then makes the
server refuse it and deletes the code in the same change. Key material is withdrawn, not silently destroyed: migration
0099 copies every retired `key_vault` row whole into `key_vault_legacy_archive` and then nulls `escrow_key` and the
PBKDF2 `independent_ciphertext` copies. The columns and the rows stay, and the archive restores one account with a
single statement: a whole-row restore of `mode`, `ciphertext`, `escrow_key` and `independent_ciphertext` (it is a comment in the migration). A vault that lands in a retired mode after the migration, by account import, is archived by the server the first time a write would replace it. Existing accounts in a legacy state are not carried forward silently: the
client says so, and the user chooses.

| Legacy | Outcome |
|---|---|
| L7 escrowed, L6 self custody | Refused on every device, even one that holds the ring (that ring could have been exposed by the server-held key or a passphrase-sealed blob). The vault is shown locked, and Settings offers **Start a new vault**, after a confirmation that the old history stays locked for good. The old row is in the archive. |
| L5 passphrase copy | Nulled by migration 0099 (archived first). Nothing reads one; an account import drops one. |
| L4 copy missing | Exists: "Needs reconnecting" then `restoreRecoveryCopy`. Stays, because it is the repair for a lost `R`. |
| L1h / L2h root `device-v1:`, held | **"Seal it properly now"** (I4) in phase 2: if the held root binds and AK is known, re-seal as `recovery-v1:`. Works token-only when the vault mode is opaque. **L1h (vault `device_custody`) is not healed in phase 2.** Phase 4 converts it: a device that holds the ring (or whose recovery copy opens under the typed recovery key) rewrites the vault as `opaque_custody` with the same ring, at the next password sign-in or unlock (the same `reseal` rule as the other re-seals: the wrapper must come from the password typed then), and the held root is then re-sealed. A token-only device leaves it locked. `onRecoveryAdopted` with the password in hand converts it too. |
| L1x root held by no device, vault retired | **Try the recovery key first** (Settings > Unlock): if the vault has a recovery copy it opens to the old ring and the vault converts, with history. Only if that fails, **start a new vault** (this removes the recovery copy of the old vault, and the confirmation says so) (there is no account key to seal under until there is one), then the #74 reset with the recovery key, sealed under the new AK. A new vault has no recovery copy until the user reconnects the recovery key (the L4 step). With no recovery key either, the user creates a new account. A device that still holds the root keeps its identity: it re-seals the root under the new key and no reset is needed. |
| L2x root held by no device, vault opaque | #74 reset with the recovery key, sealed under AK (the password opens `P`). With no recovery key either, the user creates a new account. |
| L3 ring held by nobody, no root | Any `W_pw` sign-in recovers it (T1 to T2). |

### 3.5 Offline guessing after a homeserver compromise

What the server stores per account:

- the OPAQUE registration record (`accounts.opaque_record`);
- the OPAQUE server setup, which includes the OPRF seed (`opaque_server_state.setup`, **in the same database**,
  `opaque.rs` `setup`);
- `P`, `R`, the history mirror and the sealed root.

A database dump is therefore enough to run the OPRF locally and test password guesses offline against the envelope
or against `P`. So is a homeserver that is itself hostile. OPAQUE removes precomputation and protects against
everyone *except* the server. It does not protect against the server. The cost of each guess is set by the key
stretching function (KSF).

- **Where the KSF runs.** On the client, not the server. In `opaque-ke` 4.0.1 the KSF is applied in exactly two
  places, `ClientRegistration::finish` and `ClientLogin::finish` (`get_password_derived_key`); `ServerLogin` and
  `ServerRegistration` never call it. Nothing in the server crate (`server/src`) runs the client role either; only its integration tests do. The `type Ksf = argon2::Argon2` in `server/src/routes/opaque.rs` only fixes the
  cipher-suite type and does not run on the server. So the memory and time cost is paid by the **slowest client
  device** (an older phone in a browser or WebView), not by the host. A Raspberry Pi 3 homeserver (1 GB RAM) is not
  constrained by it. The attacker pays the same cost per guess, on their own hardware, which is why the parameter
  matters after a compromise.
- **Today's KSF.** Before phase 3, `opaque-auth.js` passed no `keyStretching`, so production used `@serenity-kit/opaque`'s default,
  "memory-constrained" Argon2id. Phase 3 (merged) passes it explicitly as version 1 of a `KSF_VERSIONS` table, with the same values: m = 2^16 KiB (64 MiB), t = 3, p = 4. Tests use a cheap override
  (`src/test/opaque-ksf.js`, test-only alias).
- **Decision: keep these parameters.** Do **not** raise to 128 MiB or above on a guess. The constraint is the slowest
  client device, and that has not been measured. Change them only after measuring on the slowest supported Android
  WebView and low-end browser, and only to a setting that those devices finish in about 1 to 2 s. RFC 9807's 2 GiB is
  not practical in browsers (serenity notes crashes at 2^21).
- **Changing parameters later** means re-registering at a sign-in, while the password is in hand, and writing the new
  `P` in that request (3.2). The parameter version is recorded in `accounts.opaque_ksf_version`, beside the OPAQUE record that it parameterises, rather than in `key_vault`: the client needs it at login and reset, before it has a session that could read the vault. Version 1 is the memory-constrained set above; the client's `KSF_VERSIONS` table and the server's accepted range grow together.
- **Legacy copies are weaker, and are deleted.** PBKDF2-SHA256 at 600 000 iterations is cheap on GPUs, and the
  unprefixed self-custody format uses one fixed salt for everyone. Phase 4 deletes them.
- **The recovery key is 256-bit random** and not guessable.
- State plainly in the UI that the password protects messages against the server only as far as the password is
  strong.

---

## 4. Phased plan

Each phase ships on its own and leaves every account no worse off. There is no waiting period between phases.

1. **Phase 0: the design and the gate.** This page, and the gate `fresh-device-login.test.js` (at phase 0: 8 pass, 4 `it.fails`; after phase 1: 11 pass, 1 `it.fails`).
2. **Phase 1: stop creating broken states.** Client only. *Status: merged (#76).*
   - `signIn` creates the vault and root before `save()` (I1).
   - Keep AK locally before the vault create (I6).
   - A start without `W_pw` never creates a vault: the `loadOnce` throwaway branch becomes "locked, needs_password".
   - Root creation requires AK; `rotateRoot` and `recoverWithRecoveryKey` require AK (no `DEVICE_SEAL`).
   - `recoverIdentity` always passes AK as `sealKey`.
   - `lifecycle.js` stops moving escrow to `device_custody`.
   - Remove the `!wantRecovery && !deviceWrapped` downgrade in `startOnce`: a root is never re-sealed except under
     AK (I2). This belongs in phase 1 because one failed vault read on any device that holds the root breaks every
     later fresh-device sign-in until that device restarts cleanly.
   - **Gates flipped:**
     - *two tabs, and the restored one creates the vault…*;
     - *the tab is closed while the first vault write is in flight…*;
     - *a device holding the root restarts while the vault read fails…*.

     Their `it.fails` markers come off. The fourth gate (a throwaway-sealed root held by a device that never runs
     again) stays `it.fails`: only phase 4 and a #74 reset deal with it.
3. **Phase 2: heal held roots and finish sign-up.** Client only. *Status: merged (#78).* One limit: both the `startOnce` re-seal and `sealRootProperly` apply the same mode check (`ringIsAccountKey` in `web/src/lib/verify.js`), so they run only when the vault mode is opaque or self custody. A held `device-v1:` root in a `device_custody` vault (L1h) on a token-only device is left for phase 4. `onRecoveryAdopted` does heal L1h when the password is in hand: it converts the vault to `opaque_custody` first, then seals.
   - "Seal it properly now" (I4) in `startOnce` and after `adoptSecret`.
   - Sign-up does not finish until `R` is confirmed written (3.3). The user's "yes, I saved it" is kept as it is and
     recorded separately.
4. **Phase 3: atomic re-wrap.** Server and client. *Status: merged (#79).*
   - Password-change route (`/auth/opaque/password/change/start` and `/finish`), and a Change password section in account settings.
   - `password_reset_finish` takes the new `P`. The `loadOnce` re-wrap-from-`R` path is kept for resets made before this: the read from `R` happens at any start, but the re-seal (the write under the password's wrapper) is gated by `reseal: true`, so it happens only at a sign-in or an unlock.
   - KSF parameter version (`accounts.opaque_ksf_version`), plus upgrade at sign-in. The parameters themselves stay as in 3.5 until
     measured: version 1 is Argon2id at 64 MiB, t = 3, p = 4.
   - A password change ends every other session and every outstanding reauth proof (the current session stays), and a
     device whose answer to the change was lost drops the old password's key from memory. `loadOnce` seals a vault a
     password key cannot open only for a key made from the password typed in that sign-in, never for one kept in
     memory.
   - A reset whose recovery copy does not open can be finished with a signed "vault unopenable" marker, so a moved
     account is not locked out of its password.
5. **Phase 4: refuse and delete legacy custody.** One phase, server and client, no waiting period. *Status: merged (telium #80).*
   - **Server:**
     - `put_vault` / `set_vault_mode` accept only `opaque_custody` (`self_custody`, `device_custody` and `escrowed` get
       a 400 with a code);
     - `put_cross_signing` / `rotate` / `reset_finish` refuse `device-v1:` seals;
     - stop serving `key_vault.escrow_key`, `server_can_recover` and `server_can_read`, and remove the non-opaque arms of
       `set_vault_mode` (the `escrow_key` column stays and is emptied, see Data). Writing `opaque_custody` over a row in
       a retired mode is allowed: it is the conversion.
   - **Client:**
     - `vault.js`: `device_custody`, `self_custody` and `escrowed` branches of `loadOnce`/`setMode`, `rotatedFrom`
       escrow rotation, `fromPassphrase`/`LEGACY_SALT`/`p2` handling, `setIndependentRecovery`;
     - `device-secrets.js`: the escrow-exit pin;
     - `verify.js`: `DEVICE_SEAL`, the unprefixed seal read and the `mode` parameter of `start`;
     - `trustMethods.custodyMode()`;
     - the UI notes for the retired modes in `RecoveryPane.jsx`.
   - **Data:** migration 0099 archives every retired `key_vault` row (`key_vault_legacy_archive`), then nulls `escrow_key` and the PBKDF2 `independent_ciphertext` copies. Nothing is dropped; the archive is dropped by a later migration once no account needs the way back.
   - **Client, conversion and refusal:** a retired vault is locked (`retiredMode`). `device_custody` converts with a held ring or the recovery key (L1h). Anything else is locked until the user starts a new vault on purpose.
   - Old clients degrade to "update to keep using encrypted DMs".
   - What remains:
     - One mode.
     - One root seal.
     - Two wrappers (`P`, `R`).
     - Sibling approval as an optional delivery channel.
     - #74 reset.

---

## 5. Threat model notes

**A hostile homeserver cannot, today and after:**

- read message content in non-escrowed accounts;
- sign as the user without the root;
- make an existing device accept a root that does not match the held secret (`binds`);
- break an identity-continuity chain for a contact who has pinned or verified it without that contact seeing
  "changed".

**A hostile homeserver can, today:**

- **First-contact substitution (TOFU).** Every identity document reaches a client through its own home. On first
  contact the client pins whatever it is served, so a hostile home can present a substitute root and devices for a
  contact. Only an emoji (SAS) comparison detects it. **#73 closes the *strip* variant:** a home that advertises
  `identity.continuity` can no longer make the client accept an unsigned KeyPackage by serving no identity. #73 does
  not close substitution, and nothing in this design does; it needs out-of-band verification or key transparency
  (out of scope).
- **Offline-guess passwords** (3.5).
- **Serve an escrowed vault to a fresh device.** A device with no held ring has no escrow-exit pin, so it takes the
  server-chosen ring.
  - With `W_pw` it rotates to a fresh live key and writes a new `P`. The server's key stays in the ring as a
    *retired opener*.
  - The device then lacks the true AK: it reads no real history and cannot open the root, which on its own is denial
    of service the server could cause by deleting `P` anyway.
  - Worse, history-mirror rows and GroupInfo sealed under the server's key now open on that device. So the server can
    plant history that the device displays as its own.
  - Inferred from `loadOnce` (escrowed branch) and `Backup.unseal` trying every opener; **unverified by test**. After
    phase 4 the client refuses escrowed vaults.
- **Serve `exists:false` or a `device_custody` vault** to strand a fresh device (locked, or a new unrelated ring).
  Denial of service only: the root under the real AK still does not open, so no signing. After phase 1 a fresh device
  with `W_pw` that sees "no vault" while a root exists stops with an error instead of creating one. That check is
  part of phase 1 (**design**).
- **Roll back the vault** to an older version, so a fresh device misses retired keys and cannot open the newest
  history. A held device merges (`mergeHeld`). This is not addressed here; a version counter signed with AK would be.
- **Delete `R`**, which puts the account in "Needs reconnecting". This is denial of service on recovery, repairable by
  the user.
- **Act as a password reset.** The server can replace `opaque_record` and so obtain sessions. It still cannot open
  `P` (no export key) or the root. It can run its own #74-style reset and publish a new identity, which contacts who
  pinned the old one see as "changed". That is exactly what a genuine reset looks like to them, and the #74 docs say
  so.

**What changes after the target model:**

- No mode in which the server holds a usable key (escrow removed).
- No path by which a fresh password device ends up unable to sign because of how *another* tab sealed the root
  (I1, I2, I4).
- Password change no longer risks orphaning `R` or `P` (I5).

What does not change: TOFU on first contact, offline guessing bounded by the KSF, and metadata (who talks to whom,
when, sizes), which the homeserver sees in every mode.

---

## Decisions recorded

1. **Root-signed recovery-key enrollment.** A device that holds the root may enroll a new recovery key without the
   password, behind a fresh confirmation on that device (3.3). Recommended yes; kept as a recommendation.
2. **KSF.** Keep Argon2id at 64 MiB, t = 3, p = 4 and change it only after measuring the slowest supported client
   device. The KSF runs on the client, so the homeserver's hardware is not the constraint (3.5).
3. **Legacy custody.** No deprecation or migration window. Legacy modes and `DEVICE_SEAL` are refused and deleted in
   one phase (phase 4). Escrowed accounts are not carried forward. The key material the phase withdraws is archived first,
   so the step can be undone per account.
4. **Recovery key at sign-up.** No new blocking acknowledgement step. Sign-up must not finish until the server-side
   recovery copy is confirmed written, and the user's acknowledgement is tracked separately (3.3).
