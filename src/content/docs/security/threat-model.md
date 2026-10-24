---
title: Threat model
description: What each Telium component is trusted with, what it can do if hostile, and the known gaps.
sidebar:
  order: 1
---

This page lists each principal in a Telium deployment, what it is trusted with, and what it can do if it turns hostile. Gaps where the code does not yet enforce a claim are listed at the end.

:::caution[Limits]
Guild channels, guild voice and guild video are not end-to-end encrypted. The guild's server reads them. Telium has not had an independent security audit.
:::

## Assumptions and non-goals

- Ed25519, BLAKE3, MLS (RFC 9420), OPAQUE (RFC 9807) and TLS 1.2+ are assumed sound. Attacks on how Telium uses them are in scope.
- Shell access to a homeserver is the homeserver. A reverse proxy is trusted only if it is listed in `rate_limit.trusted_proxies`.
- Out of scope: end-to-end encryption for guild channels, federated erasure, secrecy from a malicious homeserver that also serves your web client, metadata resistance, traffic analysis and side channels, and DDoS resistance.

## Credentials

| Question | Answered by |
| --- | --- |
| Who is the user | Home session, guild session, identity assertion |
| Who is the server | Ed25519 request signature or signed document |
| What may they do | Server-side policy, checked per route |

A valid credential identifies the speaker. It grants nothing on its own.

## Principals

| Principal | Trusted with | If hostile |
| --- | --- | --- |
| Account homeserver | Login, identity assertions, OPAQUE record, encrypted vaults, KeyPackages, DM routing metadata | Can fully impersonate its own users. Can drop, delay or replay DM frames, add a device (visible to other members as an epoch change) and serve malicious JavaScript. Cannot read DMs, open server-blind vaults, silently replace a `tid:` or forge other servers. A legacy escrowed vault is readable by the server; leaving escrow rotates the recovery key. |
| Guild homeserver | Permissions, membership, message order and content, guild sessions, SFU join tokens | Has full control inside its own guilds. Audience binding stops it replaying your identity assertion to another server. |
| Federation peer | Being correctly identified | Can lie only about itself. The origin comes from the verified signature, and a valid signature does not authorize a route. |
| Media origin | Storing bytes, reporting MIME type, size and dimensions, re-encoding, scanning | Can withhold media or log fetches. Substitution is caught by the BLAKE3 hash check. Media capabilities are unguessable but not revocable. SVG and other active formats are refused, and served media carries `nosniff` and a safe disposition. |
| SFU | Forwarding call media | Sees participant IPs, room membership, timing and volume. Cannot read DM-call media or mint its own authorization. Reads guild-call media. |
| TURN | Relaying packets | Sees IPs and flows. It is your own home's TURN server. Server data cannot relax a client's `relay` posture. |
| Fetch proxies (camo, unfurl, playback, avatars, feeds) | Outbound requests for users | An SSRF surface, covered by the remote-fetch rules below. |
| Malicious client | Its own session's authority | Identity comes from the session, never the request body, and every object lookup is checked against its guild and channel. |
| Compromised device | Everything the user can do | Revocation ends its sessions, sockets and push registrations and changes the MLS epoch. Sensitive operations need fresh reauthentication. Tokens are stored hashed. |
| Malicious operator | Database, logs, IPs, signing keys, the served web client | Cannot read DM plaintext, open server-blind vaults, decrypt the sync store or act for other servers. Admin rights come from a per-request `admin` check. `telium.toml` is not writable at runtime. |
| Successor or standby | Authority after a signed handoff | Cannot nominate itself, be inserted by a third party, replay a transition or claim another server's name. A demoted primary refuses writes. |
| Feed or catalogue publisher | Recommendations | Can steer users or deny federation at scale. Feeds are key-pinned, refuse rollback, are size-bounded and expire. |
| Bot | Its token and guild permissions | Treated as a malicious client. Interaction callbacks are signature-verified, and webhooks go through the SSRF policy. |

The web client keeps the session in `localStorage` and MLS state and the DM recovery keyring in IndexedDB, unencrypted at rest. Anyone who can run code in the client's origin or read the browser profile has the account.

An [account move](/docs/federation/migration/) does not carry the `tid:` continuity chain. Contacts see the moved account as a new cryptographic identity and must verify it again.

## Invariants

- **Sessions.** A revoked session cannot make requests or keep a socket. Revoking a device retires every credential it holds, push included. Sensitive operations need fresh reauthentication. A password reset revokes sessions and leaves the `tid:` alone. Bearer tokens cannot be recovered from the database, and the database file and its WAL/SHM files are not readable by other local accounts.
- **Assertions.** Refused if the audience is another server, if expired, or if the subject's domain differs from the verified signing origin. A guild session is useless elsewhere.
- **Federation.** Requests verify against the claimed origin's key. Altered body, method, path or destination is refused. Canonical JSON is injective and stable, and floats are refused at both ends. Per-route policy applies after signature checks. Defederated peers are refused on every inbound path.
- **Succession.** A successor claim needs the predecessor's signature, and proofs are one-shot. Relocation notices must be signed by the relocated server. A demoted primary, and a guild's old host after a `moved` tombstone, accept no writes.
- **Authorization.** Server admin and guild authority do not imply each other. Role hierarchy is enforced on every mutation. Hidden channels answer not-found. Losing access stops events on an open socket. Object ids are re-checked against the guild and channel in the path. Unauthenticated requests cannot trigger unbounded password hashing.
- **Remote fetches** (any URL an untrusted party can make the server contact, including push endpoints, webhooks, relays and avatars). Only `http` and `https`. The resolved IP is checked and is the one connected to. Loopback, private, link-local (including `169.254.169.254`), CGNAT, ULA, IPv4-mapped and multicast addresses are refused, after every redirect. Bytes are capped while streaming, including after decompression. Connect, read and total timeouts apply. Unauthenticated callers get no success or failure oracle.
- **Rendering.** Only allowlisted link schemes reach `href` or `src`. Embed fields cannot inject markup. Any "this came from host X" label comes from something the client verified.

## Known gaps

Severity: **S1** exposes plaintext, credentials or a signing key, or lets an unauthenticated remote party take another identity. **S2** breaks an invariant but needs authentication, non-default config or a federating peer. **S3** is partial or missing defence in depth. **S4** is an accepted trade-off. None of the gaps below is rated S1.

| Gap | Severity |
| --- | --- |
| The relocated-guild write barrier is called per handler, not enforced structurally, so a mutating handler may lack it. | S2 |
| A signed peer can ask whether any user is entitled to a custom emoji (one boolean). The handler ignores the verified origin. | S2 |
| Failover promotion records can be backdated into an older key window. This needs a leaked private key the origin still publishes. | S3 |
| There is no nonce cache for signed server-to-server requests. Replay is bounded only by `federation.max_clock_skew_secs` (default 300 s, plus upload time on routes with a body). | S3 |
| Relying servers apply no ceiling to an identity assertion's `exp`. Only the issuing server's own users are affected. | S3 |
| The server's Content-Security-Policy has no `script-src`, `connect-src` or `img-src`. | S3 |
| `deploy/netguard.sh` has no `ip6tables` rules. IPv6 egress relies on the in-process fetch policy alone. | S3 |
| The SFU admin console's login lockout is global, so failed logins can lock the operator out for up to 5 minutes. | S4 |

To report a vulnerability, follow [SECURITY.md](https://github.com/telium-chat/telium/blob/main/SECURITY.md).
