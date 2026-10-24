---
title: Disaster recovery
description: Step-by-step responses for a lost primary, a corrupted database, stolen keys, compromised admins and other incidents.
sidebar:
  order: 12
---

This page is a set of runbooks, one per incident. Commands assume `-c /etc/telium/telium.toml` and data in `/var/lib/telium`. `$TOKEN` is your own admin session token, and `a.example` is your server.

## First five minutes

Do not:

- start a server on a database you suspect is damaged. Each backup run copies the damage, and with the defaults (`keep = 8`, every 6 hours) you lose every good archive within 48 hours.
- promote a standby because the primary is slow. A promotion cannot be undone.
- point a rebuilt server at the live domain while another server still answers for it. Two authorities for one domain are never merged.
- run `restore` over data you have not copied. It replaces; it does not merge.

Check what you have:

```sh
telium-server backup list
ls -la /var/lib/telium/telium.db /var/lib/telium/media
sqlite3 /var/lib/telium/telium.db "SELECT count(*) FROM server_keys"
telium-server backup drill      # check the schema, "identity: N signing key(s)", and warnings
```

## Primary down, coming back

Reboot, full disk, bad deploy: fix the host and wait. Before doing anything else, check the standby:

```sh
telium-server standby status
curl https://b.example/_telium/v1/failover/status/a.example
```

Do not promote.

## Primary gone for good

Either restore the newest archive on a new box:

```sh
telium-server restore s3://latest --yes --key ./backup.key
```

Start it and confirm `/.well-known/telium/server` shows the old `current_key_id`. Or promote the standby with `telium-server standby promote a.example` (see [Warm standby](/docs/self-hosting/warm-standby/#failing-over)).

## Corrupted database

At startup the server runs `PRAGMA quick_check` (`[integrity] startup_check`) and `foreign_key_check`, and refuses to start on failure (`refuse_start_on_corruption`). Treat archives taken after the corruption began as suspect.

1. Stop the server: `systemctl stop telium` or `docker compose stop server`.
2. Try to salvage the live file:

   ```sh
   sqlite3 /var/lib/telium/telium.db '.recover' | sqlite3 /var/lib/telium/recovered.db
   sqlite3 /var/lib/telium/recovered.db 'PRAGMA integrity_check; SELECT count(*) FROM server_keys; SELECT count(*) FROM accounts;'
   ```

3. Otherwise restore an archive from before the damage:

   ```sh
   telium-server backup list
   telium-server backup verify backups/telium-<ts>.tbk
   telium-server restore backups/telium-<ts>.tbk --yes
   ```

4. Start the server, let migrations run, and check that `telium-server keys list` shows the same key id as before.
5. Find the cause: a full disk, power loss, a copy taken of a live file, or bad storage.

`TELIUM_DB_INTEGRITY` overrides `startup_check` for one run, and `refuse_start_on_corruption = false` starts anyway so you can salvage. See [Backups](/docs/self-hosting/backups/) for archive contents.

## Media store lost

Copy media back from the standby's replica:

```sh
rsync -a --ignore-existing standby:/var/lib/telium/replicas/a.example/media/ /var/lib/telium/media/
```

Or restore an archive on a scratch box and rsync its `media/`. Media in an S3 media store is not in archives.

## Domain or DNS lost

Check with `dig +short NS a.example`. Until you control the domain again, peers cannot reach you. If you are moving to a new domain, see [Relocation](/docs/self-hosting/relocation/).

## TLS certificate expired

Telium does not terminate TLS. Renew the certificate at your reverse proxy. `curl -sv https://a.example/.well-known/telium/server` shows the error.

## Signing key gone

If `server_keys` is empty, `restore` an archive whose drill reports `identity: 1 signing key(s)`. A freshly minted key is a new identity to peers.

## Signing key stolen

Your own server shows nothing; peers see the forgeries. There is no protocol-level revocation, so you tell peers by hand.

1. Ask every peer to defederate the domain doing the forging:

   ```sh
   curl -sX POST https://peer.example/_telium/v1/admin/defederation \
     -H "authorization: Bearer $PEER_ADMIN_TOKEN" -H 'content-type: application/json' \
     -d '{"domain":"evil.example","scope":"all","reason":"forged authority for a.example"}'
   ```

   A blocklist feed your peers subscribe to reaches them automatically.
2. Tell peers the compromised `key_id`, your legitimate standbys, and that any other failover authorization for your domain is forged.
3. Rotate and restart:

   ```sh
   telium-server keys rotate --compromised
   ```

   Peers stop accepting the old key after their key-cache TTL (up to a day).
4. Re-pair each standby: `telium-server standby pair b.example`.
5. Rotate every other secret that was in the database or on the disk, and start a new backup key. See [Secrets](/docs/self-hosting/secrets/).
6. Look for records claiming your domain:

   ```sh
   sqlite3 /var/lib/telium/telium.db "SELECT subject_id, sequence FROM failover;"
   sqlite3 /var/lib/telium/telium.db "SELECT origin, moved_to FROM remote_servers WHERE moved_to IS NOT NULL;"
   ```

## Admin account compromised

Admin status is read on every request, so revocation is immediate. Guild sessions already issued last up to `sessions.revalidate_interval_secs` (600). The `password` field is your own password.

1. Revoke authority. A `409 last_admin` means you must grant someone else first (step 4).

   ```sh
   curl -sX POST https://a.example/_telium/v1/admin/ownership/revoke \
     -H "authorization: Bearer $TOKEN" -H 'content-type: application/json' \
     -d '{"user_id":"@x:a.example","password":"..."}'
   ```

2. Suspend the account, which ends its sessions. Call `POST /_telium/v1/admin/step-up` first.

   ```sh
   curl -sX POST https://a.example/_telium/v1/admin/accounts/@x:a.example/suspend \
     -H "authorization: Bearer $TOKEN" -H 'content-type: application/json' \
     -d '{"reason":"credential compromise"}'
   ```

   If only a device was stolen, end that device: `GET`, then `DELETE /_telium/v1/admin/ownership/sessions/{device_id}`.
3. Review what it did: `GET /_telium/v1/admin/audit?actor=@x:a.example&limit=200`. Then check blocklist feeds (`/_telium/v1/admin/blocklist-feeds`) and defederation (`/_telium/v1/admin/defederation`).
4. Make sure a usable admin remains: `telium-server admin list`, then `POST /_telium/v1/admin/ownership/grant` if needed.
5. Check for recovery claims: `telium-server admin claims`, then `telium-server admin cancel <id>`.
6. If the attacker reached the host, follow [Signing key stolen](#signing-key-stolen) too.

## No usable admin

```sh
telium-server admin recover @someone:a.example --reason "..."
```

The claim is granted after `ownership.recovery_delay_secs` (24 hours), or immediately if no usable admin exists. See [Server administrators](/docs/self-hosting/server-ownership/).

## Other secret disclosed

Rotate it (see [Secrets](/docs/self-hosting/secrets/)), then run `telium-server check`, `telium-server admin list` and `telium-server admin claims`.

## Standby promoted by mistake

There is no demote. Take a backup on both sides, pick the server to keep, promote it back with `standby promote`, then re-pair with `standby pair`. Writes the other server accepted in between are stranded.

## Old primary came back after a promotion

Keep it stopped. Check `.record.authority` in `/_telium/v1/failover/status/a.example` on a peer, run `telium-server backup now` on the old primary to keep its data, then pair it as a standby of the new primary.

## Backups not reaching the remote

Check `curl -H "authorization: Bearer $TOKEN" https://a.example/_telium/v1/admin/status | jq .backup.remote`. Local archives are pruned to `keep` even when uploads fail. Fix the credentials or bucket, run `backup now` and `backup drill`, and copy `backups/` off the box in the meantime.

## Voice down

Check `curl https://sfu.example/health` and the `sfu_health` table. `POST /_telium/v1/admin/revalidate` re-checks. See [SFU](/docs/self-hosting/sfu/).

## External provider down

S3, GIF search, mail, push, the update manifest or a blocklist feed: only that feature degrades. Check `/_telium/v1/admin/status`. To retry feeds, `POST /_telium/v1/admin/blocklist-feeds/refresh`.

## Peers say "not reachable as a Telium server"

Check that the discovery document matches `server_name` and `public_base_url`:

```sh
curl https://a.example/.well-known/telium/server | jq '.server_name, .api, .gateway'
```

Then ask the peer to `POST /_telium/v1/admin/revalidate`.

## "Another instance holds the lease"

The lease expires 2 minutes after its last heartbeat. Set `TELIUM_INSTANCE_LOCK=off` for one start, only once you are sure nothing else is serving. See [Scaling](/docs/self-hosting/scaling/#one-process-per-database).

## Before you need this

- Store the backup key and `telium.toml` off the box. Neither is in the archive.
- Configure a [warm standby](/docs/self-hosting/warm-standby/). Write archives to a separate disk and a remote.
- Keep `backup.drill = true` (the default) so restore drills run on a schedule.
