---
title: Scaling and capacity
description: Capacity targets for a single Telium process, what happens under overload, and why only one process may serve a database.
sidebar:
  order: 13
---

Telium's reference homeserver uses **one server process and one SQLite database**. Don't start multiple writers against the same database.

Before changing hardware, measure real CPU, memory, disk, database and upload traffic. The targets below are engineering estimates, not a promise of users per VPS. For monitoring, see [Observability](/self-hosting/observability/).

## Capacity targets

| | Comfortable | Degrades | Limit | Basis |
| --- | --- | --- | --- | --- |
| Fanout events/s | 16,000 | 32,000 | Render and socket write per recipient | Measured |
| Members in one guild receiving a message | 1,000 | 2,500 | Fanout divided by the guild's message rate | Derived |
| Gateway sessions per process | 2,000 | 5,000 | File descriptors, task memory | Estimate |
| Sustained message writes | 50/s | 150/s | Single SQLite writer plus FTS5 | Estimate |
| Accounts | 50,000 | | Disk | Estimate |

Fanout runs out before writes do. Write throughput depends on disk fsync speed: on an SD card, expect single digits per second.

### Measuring your own box

```sh
cd server && cargo test --release --test overload -- --ignored --nocapture
```

The test opens 32 sockets in one guild and raises the send rate until a session is shed.

## Overload behaviour

- Each gateway session has a queue of 400 events (`gateway.outbox_depth`).
- When a queue is full, the server drops the event and closes the session with code `4010` ("falling behind"). The client reconnects and receives a fresh `READY`, so it loses nothing.
- A stalled socket never blocks the publisher, and the HTTP API keeps working.
- Watch `gateway.events_dropped` and `gateway.sessions_shed` in `GET /_telium/v1/admin/metrics` (process-lifetime totals). A few shed sessions an hour is normal. Thousands in a burst mean you are over capacity.

## One process per database

The server refuses to start a second process on the same database. It holds a lease row (`instance_lease`) and heartbeats it every 30 seconds. A new process may take the lease when:

- the holder has the same PID and host,
- the holder's PID is dead on this host, or
- the lease is more than 2 minutes stale.

A database restored from a very fresh archive carries the lease of the server it came from, so it can refuse to start for up to 2 minutes.

`TELIUM_INSTANCE_LOCK=off` skips the check. Use it only for a lease left by a dead host, and only once you are sure nothing else is serving.

:::danger
A second process on the same database drops every live call at boot, doubles rate limits, splits presence, and runs backup, replication and outbox loops twice.
:::

## Storage beyond SQLite

Media and cold history can already live in object storage (`[media_store]`, `[archive]`; see [Configuration](/self-hosting/configuration/)). PostgreSQL and other databases are not supported or planned.
