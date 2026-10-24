---
title: Network privacy
description: Who learns your IP address for each kind of Telium connection, and how the Protect my IP relay works.
sidebar:
  order: 7
---

This page covers who learns your IP address for each connection Telium makes, and how the **Protect my IP** relay works. For what each component can read once a request arrives, see [Privacy](/docs/security/privacy/).

:::note
None of these options provide anonymity. Each one decides which party holds your address.
:::

## Connections

| Connection | Who learns your address | Covered by Protect my IP |
| --- | --- | --- |
| Guild REST and gateway | The guild server (plus timing, volume and TLS SNI) | Yes |
| Protected guild transport | The relay (your account home by default). The guild sees the relay's address. | This is the setting |
| Account home traffic | Your account home | No |
| [Calls](/docs/features/voice-and-video/) | `direct`: every participant. `relay`: your home's TURN. `sfu`: the SFU operator. | No, calls have their own posture |
| External upload hosts (Gofile) | The provider | No |
| External playback (Gofile) | The provider in native apps. Your home in the browser when `media_registry.gofile_playback_proxy = true`. | No |
| GIF search and media (Klipy) | The provider, plus your search terms | No |
| Link previews and camo images | The guild server fetches them. The linked site sees the guild server. | Yes |
| Emoji CDN (`cdn.jsdelivr.net`) | jsDelivr, plus which emoji rendered | No |
| Push (FCM, UnifiedPush, Web Push) | The push provider, continuously | No |
| Media from another Telium origin | That origin | No |
| Version check and deployment count | Your homeserver makes these itself, so the endpoints see the server's IP ([Updates](/docs/self-hosting/updates/)) | Not applicable |

## Modes

Your choice is stored in the [sealed sync store](/docs/security/sync-encryption/) as:

```json
{ "mode": "direct", "guilds": { "<guildId>": "protected" }, "autoFallback": false }
```

| Mode | Behavior |
| --- | --- |
| `direct` (default) | The client connects to each guild server itself. |
| `protected` | Guild traffic goes through a tunnel to the relay. The client runs its own TLS to the guild inside it, so the relay sees no plaintext. Guild servers need no changes. |
| `per-guild` | Per-guild overrides in `guilds`. One connection serves every guild on a domain, so the strictest setting among guilds on that domain applies. |

- **Fails closed.** If the relay is unavailable, or the relay budget is spent, the client does not connect. It asks once per guild per session whether to connect directly. `autoFallback: true` skips the prompt; it is off by default.
- **Desktop only.** A browser page cannot run TLS inside a tunnel, so the browser does not offer protected mode. If a synced profile requires it, the browser refuses to connect to that guild.
- **Calls are separate.** A `direct` call in a protected guild still exposes your address to the other participants.

## What the relay learns

- **Learns:** your IP and account (tunnels need a session on the relay's server), the destination server and host and port, tunnel open and close times, and bytes each way.
- **Does not learn:** request paths, methods, headers, tokens or content.

Together that is a timestamped record of which servers you talk to and how much. `relay.log_destinations` (default `false`) controls whether the relay writes it to disk, and the server publishes the setting as `logs_destinations` in its discovery document.

## Running a relay

Enable it in `telium.toml`:

```toml
[roles]
identity = true
relay = true
```

The relay serves only your server's own accounts, so it requires the identity role. When enabled, `/.well-known/telium/server` includes a `relay` object with the tunnel URL and limits.

Every relayed byte crosses your server twice, and guild servers see all your relayed users from one address and may rate-limit or refuse it. Bandwidth, not CPU, is the limit (a test measured about 2 s of CPU per GiB carried).

Destinations must be a host and port the named server publishes in `/.well-known/telium/server` as `api`, `gateway` or `client`. Internal addresses are refused, and the tunnel connects to the checked address without resolving again.

| `[relay]` key | Default | Meaning |
| --- | --- | --- |
| `max_concurrent_per_account` | `4` | Concurrent tunnels per account |
| `max_concurrent_total` | `256` | Concurrent tunnels in total |
| `max_tunnel_bytes` | 256 MiB | Bytes per tunnel |
| `daily_bytes_per_account` | 4 GiB | Bytes per account per rolling 24 h (persisted) |
| `idle_timeout_secs` | `120` | Idle timeout |
| `max_lifetime_secs` | `21600` | Absolute tunnel lifetime |
| `destinations_per_hour` | `40` | Distinct destinations per account per hour |
| `opens_burst` / `opens_per_minute` | `20` / `30` | Tunnel open rate |
| `ports` | `[443]` | Allowed destination ports |
| `allow` | `[]` | Server-name allowlist. Empty allows any server with a valid discovery document. |
| `deny` | `[]` | Server-name denylist, checked first |
| `discovery_cache_secs` | `600` | Discovery cache, including negative answers |
| `log_destinations` | `false` | Log account and destination per tunnel |

## Enforcement and limits

- A test (`web/src/test/outbound-chokepoint.test.js`) fails on any outbound call in `web/src` that does not go through the transport layer or is not allowlisted. At runtime the client wraps `fetch`, `WebSocket`, XHR and `sendBeacon` and throws `TransportBypass` when one targets a protected host. This detects bypasses; it does not block them.
- On desktop, `web/electron/relay-guard.cjs` cancels every request to a protected host other than the relay socket. It depends on the client pushing it the protected host list.
- Not tested end to end: a byte through a live relay session, the concurrency caps, protected mode during account migration, and reconnecting under protection.
- Not provided: multi-hop anonymity (this is not Tor or a VPN), resistance to traffic correlation, or hiding your destinations from the relay.
