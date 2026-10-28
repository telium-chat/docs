---
title: Server administrators
description: Grant and revoke server admin rights, and recover admin access from the host when nobody can sign in.
sidebar:
  order: 15
---

This page covers who counts as a server administrator, the routes and commands that manage them, and how to regain admin access from the host's shell.

## Who is an administrator

The `accounts.admin` flag decides. The server reads it from the database on every request, so a revocation takes effect on the next request.

The flag is set automatically for:

- the first account registered on a fresh server, and
- any localpart listed in `registration.admins` when it registers.

:::caution
An unregistered name in `registration.admins` makes whoever registers it first an admin. Empty the list once those accounts exist.
:::

## Routes

| Route | Does |
| --- | --- |
| `GET /_telium/v1/admin/ownership` | Roster and pending recovery claims |
| `POST /_telium/v1/admin/ownership/grant` | Make an account admin |
| `POST /_telium/v1/admin/ownership/revoke` | Remove admin |
| `GET /_telium/v1/admin/ownership/sessions` | Admin devices and their sessions |
| `DELETE /_telium/v1/admin/ownership/sessions/{device_id}` | End one admin device everywhere (announced to federation) |
| `POST /_telium/v1/admin/ownership/recovery/{id}/cancel` | Cancel a recovery claim (no password needed) |

Grant, revoke and session revocation need your `password` (or a `reauth_token`) in the request body. Every action is written to `server_audit_log` and announced to all admins.

## Last usable administrator

The server refuses any revoke, deactivation, deletion or move that would leave no usable admin (`409 last_admin`). An admin account is unusable if it is deactivated, suspended, scheduled for deletion, or has no credential. Accounts unseen for 90 days are reported as dormant but still count.

## Recovering admin access

`admin recover` grants admin authority to an account you name. It does not reset a password or create a session. If you lost your own password:

1. Register a new account (or use another existing one).
2. On the host, run:

   ```sh
   telium-server admin recover @new:chat.example.com --reason "lost the only admin password"
   ```

3. Sign in as that account.

Your old account stays locked.

Rules the server enforces:

- It refuses the claim if the database file or its directory is writable by anyone other than its owner. Fix the mode (`chmod 0600` on the file, `0700` on the directory) and retry. The refusal is logged as `ownership.recovery.refused`.
- Every claim goes to the audit log, is logged at `ERROR` on each boot until it settles, and is sent by gateway, push and email to every admin with a verified address.
- With no usable admin, the claim is granted immediately. Otherwise it waits `ownership.recovery_delay_secs` from the announcement, and any admin can cancel it.

:::danger
A recovery claim you did not open means someone has write access to your host. Cancel it and follow [Disaster recovery](/self-hosting/disaster-recovery/#signing-key-stolen).
:::

## CLI

```sh
telium-server admin list      # roster with standing; warns when only one admin is usable
telium-server admin recover <account> --reason "..." [--yes]
telium-server admin claims    # pending recovery claims
telium-server admin cancel <id>
```

These run against the database directly, so they work when nobody can sign in.

## Config

```toml
[ownership]
recovery_delay_secs = 86400   # 0 is allowed
```

## Recommendations

- Grant a second admin now.
- Give every admin a verified recovery email.
- Keep `registration.admins` empty after setup.
