---
title: Observability
description: Enable the Prometheus endpoint, set up alerts, and filter Telium's log categories.
sidebar:
  order: 13
---

Telium exposes a Prometheus scrape endpoint at `/metrics` and writes logs under a fixed set of categories. Metrics are aggregates only, with no per-user, per-guild or per-peer labels.

An unsampled gauge is omitted from the output rather than reported as `0`, so pair threshold alerts with `absent()`.

## Enabling `/metrics`

Scraping is off by default.

```toml
[metrics]
scrape_enabled = true
scrape_token = "${file:/etc/telium/metrics-token}"   # or TELIUM_METRICS_SCRAPE_TOKEN
scrape_allow = ["127.0.0.1", "::1"]                  # TCP peer address, never X-Forwarded-For
```

The server admits a scrape from an address in `scrape_allow` or with `Authorization: Bearer <token>`. Behind a reverse proxy every request arrives from the proxy's address, so use the token.

| Response | Cause |
| --- | --- |
| `404` | `scrape_enabled = false` |
| `401` | Peer not allowed and no valid token |
| `503` | `[metrics] enabled = false`, so nothing is measured |

```yaml
scrape_configs:
  - job_name: telium
    static_configs: [{ targets: ["127.0.0.1:8448"] }]
    authorization: { type: Bearer, credentials_file: /etc/telium/metrics-token }
```

To rotate the token, set `scrape_token_previous` to the old value while the scraper moves over, then clear it. See [Secrets](/self-hosting/secrets/).

## Suggested alerts

Treat these thresholds as starting points.

```promql
absent(telium_gateway_connections)
sum(rate(telium_http_responses_total{class="5xx"}[5m])) / sum(rate(telium_http_requests_total[5m])) > 0.01
histogram_quantile(0.99, sum(rate(telium_http_request_duration_seconds_bucket[5m])) by (le)) > 2
telium_database_pool_idle == 0 and telium_database_pool_connections >= telium_database_pool_max
sum(rate(telium_federation_delivery_failures_total[15m])) / sum(rate(telium_federation_deliveries_total[15m])) > 0.1
telium_federation_backlog_oldest_seconds > 900
telium_backup_stale == 1
telium_backup_age_seconds > 172800
telium_backup_key_stranded == 1
telium_standby_lag_seconds > 900
increase(telium_media_scan_failures_total[1h]) > 0
telium_sfu_regions_healthy == 0 and telium_sfu_regions > 0
changes(telium_process_start_time_seconds[1h]) > 2
```

Also watch free disk on the data directory with node exporter. `telium_storage_sample_age_seconds` tells you how old the storage gauges are.

## Log categories

Filter with `RUST_LOG`. The default is `info,sqlx=warn`.

```sh
RUST_LOG=warn,telium::federation=debug telium-server -c /etc/telium/telium.toml
```

`RUST_LOG=telium=debug` reaches every category, since all of them share the `telium::` prefix.

| Target | Covers |
| --- | --- |
| `telium::startup` | Config load and audit, preflight, database open and integrity, bind, shutdown drain |
| `telium::request` | The cause chain of every HTTP 500. This is not an access log. |
| `telium::auth` | Sessions, device revocation, account recovery |
| `telium::account` | Profile changes, deactivation, erasure, sunset |
| `telium::social` | DMs, conversations, friendships and their outboxes |
| `telium::media` | Uploads, object store, remote-media cache, cold storage |
| `telium::scan` | The upload hash-list scanner. It fails silently, so alert on `telium_media_scan_failures_total`. |
| `telium::voice` | Call setup and teardown, SFU control, region health, seat reclaim |
| `telium::push` | Web Push, APNs, FCM, native relay, notification outbox |
| `telium::gateway` | Realtime socket sessions, refusals, protocol violations |
| `telium::federation` | Signatures, key refresh, discovery, relocation, notices, catalogues, the signing key |
| `telium::relay` | Store-and-forward relay tunnels |
| `telium::migration` | Account, guild and domain moves. Chatty during a migration. |
| `telium::backup` | Backup key, archives, pruning, remote upload, pre-migration archive, restore drills |
| `telium::standby` | Warm-standby replication, promotion, demotion, fencing |
| `telium::moderation` | Automod, reports, media-origin feed subscriptions |
| `telium::admin` | Administrator audit trail, ownership, recovery claims |
| `telium::bots` | Bot accounts, applications, installs, tokens |
| `telium::maintenance` | The periodic sweep loop: retention and media sweeps |
| `telium::telemetry` | The metrics system itself: rollup worker, route table overflow |
