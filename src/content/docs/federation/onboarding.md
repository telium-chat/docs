---
title: Account-home onboarding
description: How new users get an account home, how operators opt in to referrals, and the eligibility rules for the recommended signup pool.
sidebar:
  order: 3
---

This page covers where a new account gets created: the default on your own server, the opt-in recommendation flow that spreads new accounts across community homeservers, and what an operator must do to receive referrals.

## Defaults

A homeserver's own signup form creates the account on that homeserver and asks nothing. Two settings change this, and they are independent:

```toml
[registration.recommendations]
# Inbound: accept automatic beginner referrals from the public catalogue.
accepting = false
# Relative admission preference, clamped to 1-3 by the catalogue.
referral_weight = 1
# Outbound: have your own signup form offer a signed community recommendation
# instead of defaulting to this server.
suggest_alternatives = false
```

Your server advertises these in `/_telium/v1/capabilities` under `onboarding.recommendations`. The **change server** option stays on screen under every setting. Only the default moves.

The recommendation picker appears only when both are true:

- the serving operator set `suggest_alternatives = true`, and
- the client build pinned a recommendation signing key (`VITE_TELIUM_RECOMMENDATION_PUBLIC_KEY`).

Ordinary web builds pin no key, so they always offer the serving homeserver and fetch no catalogue.

## Directory and recommended pool

The public homeserver directory is built from [`site/registry/servers.json`](https://github.com/telium-chat/telium/blob/main/site/registry/servers.json). You join it by opening a pull request. The site probes each listed server's `/.well-known/telium/server` and `/_telium/v1/capabilities` every hour and records reachability, API origin, protocol version, roles, registration state, moves, sunsets and live referral settings.

Being listed does not put you in the recommended pool. The pool is a stricter subset.

### Opting in

You need both halves. Either one can pause referrals.

In the registry entry:

```json
{
  "domain": "chat.example.com",
  "operator": { "contact": "https://chat.example.com/contact" },
  "recommendations": { "opt_in": true }
}
```

On the running server:

```toml
[registration]
open = true

[registration.recommendations]
accepting = true
referral_weight = 2
```

Setting `accepting = false` pauses referrals at the next probe, without a registry change. `referral_weight` is an admission preference, not a capacity claim, and registration stays authoritative: your server can still refuse a signup.

### Eligibility

A server is in the pool only while every check passes. The evaluator reports failing checks by reason code, and the directory shows them.

| Check | Reason code when it fails |
| --- | --- |
| Registry `recommendations.opt_in` is `true` | `operator_not_opted_in` |
| Operator contact is an `https://` or `mailto:` URL | `operator_contact_missing` |
| Registry `added` is at least 7 days old | `listing_too_new` |
| First probe is at least 7 days old | `insufficient_observed_age` |
| Latest probe succeeded | `unreachable` |
| Probed server name matches the registry domain | `identity_domain_mismatch` |
| API origin is valid HTTPS | `insecure_or_invalid_api_origin` |
| `registration_open` is true | `registration_closed` |
| Protocol is the current generation (`v1`) | `incompatible_protocol` |
| No move announced | `server_moved` |
| No sunset announced | `server_sunsetting` |
| Identity role enabled | `identity_role_unavailable` |
| Latest probe within 3 hours | `stale_probe` |
| At least 72 probe samples | `insufficient_probe_history` |
| 30-day uptime at least 99% | `uptime_below_minimum` |
| Live `accepting = true` | `live_recommendations_disabled` |
| Live referral weight above zero | `no_live_referral_weight` |

The probe-history age check means a new endpoint cannot backdate `added` to skip the maturation period. Removal for abuse or fraud is a public registry action.

## Recommendation document

The project site publishes a static, signed recommendation document instead of an assignment API, so no central service learns about each signup. It can be mirrored and cached.

```json
{
  "kind": "telium.account_home_recommendations",
  "version": 1,
  "generated_at": "2026-09-16T20:00:00Z",
  "expires_at": "2026-09-16T22:00:00Z",
  "servers": [
    {
      "domain": "chat.example.com",
      "api_origin": "https://api.chat.example.com:8443",
      "name": "Example Chat",
      "region": "na-west",
      "region_label": "Oregon, US",
      "operator_name": "Example Collective",
      "operator_contact": "https://chat.example.com/contact",
      "uptime_30d": 99.9,
      "weight": 2
    }
  ],
  "key_id": "ed25519:account-home-recommendations",
  "signature": "..."
}
```

Documents are valid for two hours by default. `api_origin` is the origin observed through discovery, so delegated API hosts work. Clients verify the signature against the pinned Ed25519 key and reject expired documents and non-HTTPS origins. Alternate builds can pin another catalogue or none.

## Selection in the client

The client picks locally:

1. Take usable entries from the verified document.
2. Group entries by operator contact, so one operator's domains share a single share.
3. Cap any operator at 50% of the probability when another operator is available.
4. Split each operator's share across its servers by weight.
5. Draw once with secure local randomness.

The project-operated server gets no ranking bonus. The client does not infer region from your IP, and it does not contact any candidate homeserver before you accept one.

## Signup flow

When the picker is shown, the form displays an **Account home** card with the server name, region, measured uptime and operator contact. You can accept it, press **Change** for another recommendation, open **Browse all servers**, or type a domain.

Sign-in, password recovery and guided migration handoffs always use the server you name. A guided move goes to the destination in the handoff, never a random one.

### From an invite

A signed-out user opening a guild invite sees the guild preview, creates an account through the same Account home picker, acknowledges the recovery key if one was created, and lands in the guild. The guild's server does not become the account home because it issued the invite.

### Failure behaviour

1. Try the current signed document.
2. On a transport, HTTP or signature failure, fall back to a cached document after re-verifying its signature, key, expiry and entries.
3. If nothing valid remains, show manual server entry and the directory link.

A valid current document with no usable servers wins over the cache. Expired documents are never used. If the chosen server closes registration between catalogue generation and submit, the form keeps your entered details so you can pick another home.

## Limits

A recommended server is eligible under published criteria, not endorsed. It holds the server-visible data and metadata any account home holds. Grouping by operator contact does not stop an operator who uses distinct contacts; public registry review covers that case.

You can move your account later. See [Migration](/docs/federation/migration/).
