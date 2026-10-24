---
title: Protocol compatibility
description: The Telium protocol version window, capability tokens, what counts as a breaking change, and how version skew is reported.
sidebar:
  order: 2
---

This page defines how Telium servers and clients on different versions talk to each other. The rules are enforced in [`telium-protocol/src/compat.rs`](https://github.com/telium-chat/telium/blob/main/telium-protocol/src/compat.rs) and tested in `server/tests/interop.rs`.

The protocol version is one integer covering the durable wire formats: the federation API (`/_telium/v1/`), gateway frames, migration bundles, and signed documents (identity assertions, key documents, promotion and relocation records). It is separate from the release version and from the local database format (`STATE_FORMAT_VERSION`, see [Upgrades](/self-hosting/upgrades/)).

## Version window

| Constant | Value |
| --- | --- |
| `PROTOCOL_VERSION` | 1 |
| `MIN_SUPPORTED_PROTOCOL_VERSION` | 1 |

Each side advertises its window:

- **Discovery:** `/.well-known/telium/server` includes `protocol: { version, min_supported, capabilities }` next to the legacy `protocol_version` string.
- **Server to server:** every signed request carries `X-Telium-Protocol`, `X-Telium-Min-Protocol` and `X-Telium-Capabilities`. The receiver records them only after the signature verifies.
- **Gateway:** `HELLO` and `READY` advertise the server's window. The client sends its own in the `protocol` block of `IDENTIFY`.

A peer that advertises nothing is treated as version 1, minimum 1, with no capabilities. The minimum is raised only on a major release after a full deprecation cycle.

## Change rules

Compatible, no version bump:

- Adding a field, endpoint, gateway event, error code, or an enum value whose readers ignore unknown values. A missing field must mean the old behaviour.
- Relaxing a limit, rejecting only input no correct peer sends, or local-only changes.

Incompatible, needs a bump:

- Removing, renaming or retyping a field, or changing its units, meaning or which documents count as valid.
- Changing how a signature is computed or what it covers, or the order of a multi-step protocol (such as migration grant, transfer, acknowledge, tombstone).
- Making an optional element required.

The test: a peer on the oldest version in the window must still end up with correct state.

## Capabilities

Prefer a capability over a version bump. The caller checks for the capability before sending and falls back when it is absent. Unknown tokens are kept as sent.

| Capability | Caller's fallback when the peer lacks it |
| --- | --- |
| `migrate.try_again` | Read the English text of a `409` |
| `migrate.handoff` | Moving to that peer is not offered |
| `sync.sealed` | Sealed-only sync keys are not sent |
| `relocation.announce` | The relocation is discovered at cutover |
| `onboarding.recommendations` | The peer is not a recommendation target |
| `federation.curator_feeds` | Its feeds are not polled |
| `transport.relay` | No "Protect my IP" offer for that home server |

## Skew reporting

Per-peer status is one of `unknown` (never observed, not an error), `ok`, `peer_protocol_too_old` or `peer_protocol_too_new`.

| Endpoint | Shows |
| --- | --- |
| `GET /_telium/v1/admin/peers` | Per-peer `protocol` block (`status`, `version`, `min_supported`, `capabilities`, `message`, `remedy`), plus `local` and an `incompatible` count. Incompatible peers sort first |
| `GET /_telium/v1/admin/peers/{origin}` | Adds `local_protocol` |
| `GET /_telium/v1/admin/status` | `protocol` and `incompatible_peers` |

The control plane's Federation pane shows the same data.

Outside the window:

- A client's gateway connection closes with code `4015` before the token is checked. The close reason includes a remedy.
- A server-to-server request gets `400` with `"error": "incompatible_protocol"`. It is not retried and does not mark the peer as down.

## Fixtures

`server/tests/fixtures/interop/` holds `v0-legacy/` (before this contract), `v1/` (current) and `hypothetical-v2/` (synthetic, for testing refusal). Frozen shapes are never edited; a new version adds a directory. The suite also checks that every key path an older release published is still published.

See [Federation](/federation/overview/#errors-between-peers) for how peer errors reach clients.
