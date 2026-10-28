---
title: Warm standby
description: Stream a live copy of your server to a second server and promote it by hand if the primary is lost.
sidebar:
  order: 12
---

A warm standby is a second Telium server that holds a live, read-only copy of your primary. If the primary dies, an operator promotes the standby and it takes over the domain's authority. There is no quorum or automatic election: a human decides.

Your data-loss window is the replication lag at the moment of failure. With the default poll that is about 5 seconds.

<img class="diagram diagram-light" src="/diagrams/warm_standby-light.svg" alt="On the primary, write triggers fill repl_log. The standby pulls it with signed requests every 5 seconds into a read-only copy, served at /_telium/standby/a.example." />
<img class="diagram diagram-dark" src="/diagrams/warm_standby-dark.svg" alt="On the primary, write triggers fill repl_log. The standby pulls it with signed requests every 5 seconds into a read-only copy, served at /_telium/standby/a.example." />

## Consent on both sides

Pairing needs a setting on each server. Neither server can enrol the other.

| Server | Setting | Meaning |
| --- | --- | --- |
| `a.example` | `failover.standbys = ["b.example"]` | b may stream our database |
| `b.example` | `failover.replicate = ["a.example"]` | we hold and serve a's copy |

Naming a standby installs write-logging triggers on the primary. A server with no standby does not pay for them.

## Pairing

Pair while both servers are healthy. The primary signs its consent in advance, because it cannot sign once it has failed.

1. On the primary, allow the standby and restart:

   ```toml
   [failover]
   standbys = ["b.example"]
   ```

2. On the standby, mirror the primary and restart:

   ```toml
   [failover]
   replicate = ["a.example"]
   dir = "replicas"
   ```

   The standby bootstraps from a snapshot, then follows the log. `telium-server standby status` shows the lag closing.

3. On the primary, sign the consent:

   ```sh
   telium-server standby pair b.example
   ```

   A server admin can do the same over the API:

   ```text
   POST /_telium/v1/admin/failover
   { "subject_type": "server", "subject_id": "a.example", "standby": "b.example" }
   ```

The primary stores a signed `failover_authorization` record, which replicates to the standby. The standby holds the primary's signature before anything goes wrong. A server cannot be its own standby.

## What replicates

Everything in the schema except:

| Not copied | Reason |
| --- | --- |
| `server_keys`, `vapid_key` | Private keys. A promoted standby signs as itself. |
| `repl_log`, `repl_ack`, `replica_state` | Replication bookkeeping. |
| `sfu_health`, `media_cache` | Local observations and a TTL cache of remote media. |
| `_sqlx_migrations` | The copy runs its own migrations. |

Stored media follows the rows that reference it. The triggers are regenerated from the schema on every boot, so new tables are covered.

## Normal operation

The standby serves the copy under `/_telium/standby/a.example` and refuses writes there with `503 {"error": "standby_read_only"}`. The copy uses `server_name` `a.example`, so a client fails over by switching its API base and keeps its session.

Anyone can check the copy's state without authentication:

```sh
curl https://b.example/_telium/v1/failover/status/a.example
```

```json
{
  "origin": "a.example",
  "authority": "a.example",
  "promoted": false,
  "read_only": true,
  "behind_ms": 4200,
  "age_ms": 4200,
  "stale": false,
  "standby": "b.example"
}
```

`behind_ms` is the age of the newest replicated write. `age_ms` is the time since the standby last heard from the primary. The primary publishes its standby in `/.well-known/telium/server`, so clients learn the fallback while it is up.

## Failing over

Promotion is manual. A timeout cannot tell a network blip from a dead machine.

On the standby, once you have decided the primary is not coming back:

```sh
telium-server standby promote a.example
```

It asks you to type the domain back, does a last best-effort pull, verifies the primary's consent from the copy, and signs a `failover_promotion` record. The record carries the standby's signature over the primary's authorization; a record missing either is refused. Running it twice returns the same record.

An admin with a session but no shell can call:

```text
POST https://b.example/_telium/v1/admin/standby/a.example/promote
```

After promotion the copy is writable and `status` reports `authority: "b.example"`, `promoted: true`, `read_only: false`. Point DNS for `a.example` at the standby, or let clients find it: a client that already failed over notices on its next poll.

:::caution
A promotion cannot be undone. Do not promote because the primary is slow.
:::

### Client behaviour

The client caches the fallback from `.well-known`. After the primary stops answering for 20 seconds, it moves to the standby and shows a banner:

- **Not promoted:** a warning that this is a copy, how far behind it is, and that sending is disabled.
- **Promoted:** a plain notice that `a.example` is now served by `b.example`.

`/_telium/v1/health` and `.well-known` both publish which domain is the authority. The client returns to the primary only when it is alive and still the authority.

## When the old primary returns

It demotes itself. At startup, before the listener binds, it asks each standby's status endpoint for a promotion record and verifies it with its own key, which never replicates. The higher sequence wins. It repeats the check every `demotion_poll_secs`. An unreachable standby does not block boot.

A demoted server keeps its data readable but refuses writes and logins:

```json
{
  "error": "demoted",
  "message": "a.example is no longer the authority for this account; b.example is",
  "authority": "b.example",
  "sequence": 1,
  "record": {}
}
```

## Failing back

Run the same ceremony in the other direction:

1. On `b.example` (now the authority), set `failover.standbys = ["a.example"]` and restart.
2. On `a.example`, set `failover.replicate = ["b.example"]` and restart. It bootstraps from a snapshot that includes everything written during the outage.
3. On `b.example`, run `telium-server standby pair a.example`.
4. Once the lag has closed, on `a.example`, run `telium-server standby promote b.example`. The sequence goes to 2, `b.example` demotes itself, and clients follow.

## Reference

```sh
telium-server standby status            # mirrors, lag, and who the authority is
telium-server standby pair <domain>     # sign the consent (on the primary)
telium-server standby sync [origin]     # pull now
telium-server standby promote <origin>  # take over (on the standby); --yes skips the prompt
```

These commands work on the database directly and need no browser, session or primary. They are safe to run against a live server.

| Setting | Default | Meaning |
| --- | --- | --- |
| `failover.standbys` | `[]` | Who may stream this server |
| `failover.replicate` | `[]` | Whose copy this server holds |
| `failover.dir` | `replicas` | Where copies and their media live |
| `failover.poll_secs` | `5` | Pull interval; this is the data-loss window |
| `failover.batch` | `500` | Log entries per pull |
| `failover.keep_acked_secs` | `1800` | How long acknowledged entries survive, so a brief disconnect resumes |
| `failover.stale_after_secs` | `300` | Lag before readers are told the copy is behind |
| `failover.media_batch` | `200` | Objects examined per media sweep |
| `failover.demotion_poll_secs` | `30` | How often a primary checks whether it was replaced |
| `failover.max_snapshot_bytes` | `107374182400` (100 GiB) | Largest bootstrap snapshot a standby will write |

## Limits

- This is not high availability. Writes stop until a human promotes, and the last few seconds of writes can be lost.
- Only one server accepts writes at a time; the sequence number enforces that.
- A standby replicates deletions immediately. Keep [backups](/self-hosting/backups/) as well.
- Pairings are signed for a domain. After a [relocation](/self-hosting/relocation/), pair again under the new name.
