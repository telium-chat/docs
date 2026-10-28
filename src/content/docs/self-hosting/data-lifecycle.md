---
title: Data lifecycle
description: What account and guild deletion remove, what survives, data export, and retention settings.
sidebar:
  order: 17
---

This page lists what the server deletes when an account or guild goes away, what it keeps, and the settings that control retention and integrity checks.

## Account deletion

`DELETE /_telium/v1/account` with the user's password or a reauth token. The server refuses while the account owns a guild or an enabled bot application.

1. In one transaction the server redacts the account row in place (a tombstone; the username is burned for good), blanks the profile, marks conversation memberships `left`, deactivates devices, and deletes nineteen tables of private state:

   `sync_store`, `media_preferences`, `push_subscriptions`, `friends` (as subject), `key_packages`, `key_backup`, `key_vault`, `identity_transitions`, `device_revocations`, `identity_recovery_policies`, `identity_roots`, `cross_signing`, `user_signatures` (as signer), `mfa_recovery_codes`, `opaque_login_attempts`, `opaque_reauth_tokens`, `home_sessions`, `recovery_addresses`, `recovery_email_challenges`.

2. After commit it sends a signed `deleted` notice to every server in `remote_memberships`.
3. The erasure journal (`account_erasures`) clears twenty-two further tables, then the account's profile media:

   `remote_memberships`, `membership_moves`, `notification_devices`, `notification_inbox`, `notification_outbox`, `devices`, `friends` (as peer), `user_signatures` (as subject), `verification_requests`, `migration_alerts`, `migration_handoffs`, `media_pulls`, `imported_identities`, `password_reset_attempts`, `recovery_copy_attempts`, `read_state`, `voice_states`, `screening_answers`, `emoji_entitlements`, `media_vouchers`, `interactions`, `ephemeral_messages`.

These survive deletion: messages, reactions and pins in guilds; guild `members` and `member_roles` rows; `audit_log` entries; attachments and emoji; cold archive segments; and backups taken before the deletion.

### Stuck erasure

The journal retries every minute and gives up after 20 attempts, logging an `ERROR`. To find and reset a stuck one:

```sql
SELECT user_id, stage, attempts, last_error FROM account_erasures WHERE stage != 'finished';
UPDATE account_erasures SET attempts = 0, next_at = 0, last_error = NULL WHERE user_id = '@someone:chat.example.com';
```

### Across federation

- Deletion is not global. Peers receive a signed notice and drop guild sessions. They are not asked to delete messages or member rows.
- Guild deletion sends nothing; peers learn on their next pull.

## Guild deletion

`DELETE /_telium/v1/guilds/{id}`, owner only. The server removes channels, messages, roles, members, the audit log and related rows. The orphan sweep reclaims attachment blobs later.

## Encryption bookkeeping

Two tables support encryption repair. Neither holds a key or plaintext, neither is keyed by account, and account deletion leaves them alone.

| Table | Holds | Kept for |
| --- | --- | --- |
| `voice_e2ee_log` | A guild call's accepted MLS commits and Welcomes (ciphertext and public handshake), epoch, committer, added user ids | The call's current group only, capped at the newest 256 epochs; cleared when the group restarts, when nobody left in the call holds its key, or with the guild |
| `dm_handoffs` | Signed sequencer handoffs for a conversation | The life of the conversation; a handoff the new home refused for good is deleted |

## Export

`GET /_telium/v1/account/export` streams a `telium-account-export-v2` JSON document, limited by `[retention] exports_per_day` (default 3). Its `not_included` field lists everything left out.

## Retention and integrity settings

| Setting | Default | Effect |
| --- | --- | --- |
| `[retention] erasure_journal_days` | `90` | Keep finished erasure rows |
| `[retention] tombstone_days` | `365` | Local `gone` and `moved` records |
| `[retention] remote_cache_days` | `30` | Tombstones learned from peers |
| `[retention] exports_per_day` | `3` | Export rate limit |
| `[retention] delivered_notice_days` | `14` | Delivered federation notices |
| `[retention] audit_log_days` | `730` | Guild audit entries |
| `[integrity] startup_check` | `quick` | `quick`, `full` or `off`; `TELIUM_DB_INTEGRITY` overrides for one run |
| `[integrity] foreign_key_check` | `true` | Refuse dangling references at boot |
| `[integrity] refuse_start_on_corruption` | `true` | `false` starts anyway so you can salvage |

Zero means "never" for every retention key. There is no message retention sweep; to move old history off the main database, use cold archiving (see [Configuration](/self-hosting/configuration/)).
