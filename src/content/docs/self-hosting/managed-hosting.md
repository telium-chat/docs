---
title: Managed hosting
description: List paid Telium hosting providers in the create-a-guild flow, subscribe to signed provider catalogues, and publish your own.
sidebar:
  order: 19
---

Your server can show a list of hosting providers in the create-a-guild flow, with each provider's prices, limits and terms. You can curate providers yourself, subscribe to signed catalogues other operators publish, or both. Your own curated list is also published as a signed catalogue others can subscribe to.

The list is a directory and nothing more:

- No money moves through Telium, and no server or client collects a payment credential.
- No account is created at a provider. The client opens the provider's own signup page in a new tab (`noopener`) and stops there.
- The server never fetches a URL found inside a catalogue, and never executes anything in one.
- Nothing verifies that a provider runs a Telium server or that its prices are real. Listing a provider means you are willing to name it.

## What users see

In **Add a guild → Create my own**:

- With no providers listed, the form is unchanged.
- With providers listed, the user first picks **Host it here** or a provider. Each provider card shows its cheapest plan's price and its member and storage caps.
- A provider's screen shows its description, regions, every plan, and links to its terms, privacy policy, website and contact, plus a statement that Telium takes no payment.
- **Continue to <provider>** opens the signup URL. Nothing is created or sent.

Each screen also tells the owner that a guild can be moved to another server later from **Guild settings → Moving this guild** (see [Migration](/federation/migration/)).

## Configuration

```toml
[hosting]
enabled = true
# catalog_refresh_secs = 21600    # 6 hours
# catalog_retry_secs = 900        # after a failed fetch
# catalog_timeout_secs = 10
# catalog_validity_secs = 604800  # how long the catalogue you publish stays valid

# Subscribe to a signed catalogue. `key` is the publisher's Ed25519 public key (base64).
[[hosting.catalogs]]
url   = "https://catalog.example.org/_telium/v1/hosting/catalog"
key   = "base64-ed25519-public-key"
label = "Community catalog"

# Your own curated providers.
[[hosting.providers]]
id = "aurora"
name = "Aurora Guilds"
base_url = "https://guilds.aurora.example"
signup_url = "https://guilds.aurora.example/signup"
terms_url = "https://guilds.aurora.example/terms"
privacy_url = "https://guilds.aurora.example/privacy"
contact = "hello@aurora.example"
description = "Managed Telium servers, run in the EU."
regions = ["eu-west", "eu-north"]
public_key = "base64-ed25519-public-key"   # the provider's own server key

[[hosting.providers.plans]]
id = "small"
name = "Small"
price_minor = 500        # minor units of currency: 5.00 EUR
currency = "EUR"
period = "monthly"       # free, monthly, yearly or metered
member_cap = 500
storage_bytes = 21474836480
media_quota_bytes = 10737418240
notes = "Daily backups included."
```

A plan limit left out means the provider did not state one, and the client says so.

With `enabled = true` and nothing configured, the server publishes an empty list and the flow looks as it did before. `enabled = false` stops all fetching, prunes the cache and lists nothing.

## Subscribing to catalogues

The server verifies each catalogue only against the key you pinned in `[[hosting.catalogs]]`. A catalogue cannot name or rotate its own key. If the publisher changes keys, re-pin.

Fetches use the same path as other signed feeds: https only, internal addresses refused, no redirects, size-capped.

A verified document replaces the held copy only if:

- its `serial` is higher than the held one (rollback protection), and
- it is not a different document under the same `serial` (equivocation is refused and recorded as an error).

Adoption replaces the whole provider list in one transaction. A catalogue past its `expires_at` lists nothing.

### Validation limits

The server refuses the whole document if any field fails:

| Field | Limit |
| --- | --- |
| Document size | 256 KiB |
| Providers | 200, unique ids |
| Plans per provider | 12, unique ids |
| Regions per provider | 40 |
| Short strings (name, id, region, contact, currency) | 64 characters |
| Descriptions and notes | 600 characters |
| URLs | 512 characters, https only, no embedded credentials |
| `price_minor` | 0 to 100,000,000; must be 0 when `period` is `free` |
| `member_cap` | At most 100,000,000 |
| Storage and media quota | Below 2^60 bytes |
| Any text | No control characters or bidi overrides |

The web client sanitises the same way again and drops any provider whose signup URL is not https.

## Publishing your list

Your `[[hosting.providers]]` are served as a signed catalogue at `/_telium/v1/hosting/catalog`. `/_telium/v1/hosting/publication` gives the URL and the key for other operators to pin. The signing key is created on first use.

## Endpoints

```text
GET  /_telium/v1/hosting/providers               # unauthenticated; the list the client shows
GET  /_telium/v1/hosting/catalog                 # your curated list, signed
GET  /_telium/v1/hosting/publication             # where it is published and the key to pin
GET  /_telium/v1/admin/hosting-catalogs          # subscription status (admin)
POST /_telium/v1/admin/hosting-catalogs/refresh  # fetch every subscription now (admin)
```

`/hosting/providers` returns:

```json
{
  "enabled": true,
  "self_hosted": { "server_name": "chat.example.com", "available": true },
  "providers": [ { "...": "provider fields, plus a source" } ],
  "portability": { "guided_handoff": true }
}
```

Each provider's `source` is `{"kind": "operator"}` for your own curation or `{"kind": "catalog", "label": ..., "publisher": ...}` for a subscription. Your providers come first, then catalogues in configured order. A duplicate offer is listed once.

The refresh route allows one manual fetch per subscription per minute. A subscription inside that window is reported as a `skipped` row. Catalogues otherwise refresh on `catalog_refresh_secs`.

### Subscription states

The admin console's **Hosting catalogs** pane shows the same data.

| State | Meaning |
| --- | --- |
| `disabled` | `hosting.enabled = false` |
| `invalid` | The URL or pinned key is malformed; never fetched |
| `active` | A verified, unexpired copy is held and its providers are listed |
| `key_mismatch` | A document arrived that does not verify against the pinned key. Re-pin the publisher's new key. |
| `failed` | Fetched and refused with nothing held (rollback, equivocation, bad field, unreachable host) |
| `pending` | Configured, not yet fetched |
| `expired` | A verified copy is held but past `expires_at`, so it lists nothing |

Each row also has `error` (the last fetch's failure, `null` after a success) and `failure`: `{ kind, message, at, consecutive }`, where `kind` is `misconfigured`, `unreachable`, `key_mismatch` or `rejected`.
