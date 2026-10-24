---
title: Signing
description: Ed25519 signing rules, canonical serialisation and the five signing families used across Telium.
sidebar:
  order: 2
---

Every Telium signature is Ed25519 (RFC 8032). There is no algorithm negotiation and no fallback. This page defines how each kind of signed object is serialised and verified.

## General rules

- Verify strictly (`verify_strict`): a verifier **MUST** reject non-canonical `S` (`S + L`) and small-order public keys, identity keys included.
- A signer **MUST NOT** sign JSON containing a non-integer number at any depth. It returns the document unchanged, without `signature`/`key_id`. A verifier **MUST** reject an unsigned document. `i64`/`u64` integers are fine.
- Base64 is **base64url unpadded** (RFC 4648 §5) everywhere except MLS frames ([MLS](/reference/protocol/mls/)). `decode_any_b64` (identity input) accepts all variants and re-encodes to base64url unpadded before signing or comparing.

## Family A: signed JSON documents

`sign_json`/`verify_json`. Used for key documents, media vouchers, relocation records, promotion proofs and migration tombstones.

1. Remove `signature` and `key_id`.
2. Serialise with no whitespace, keys sorted by UTF-8 bytes at every depth, escaping only `"`, `\` and C0 controls (not `/`, not non-ASCII).
3. Sign, then insert `signature` (base64url unpadded) and `key_id`.

To verify, repeat steps 1 and 2 on the document **as received**. Transmitted key order is irrelevant, but a serialiser **MUST** emit sorted order.

- `key_id` is not signed.
- `{"a":null}` and `{}` are different documents.
- Unknown members are covered by the signature.
- A valid signature is not authorisation. A voucher's `audience`, `exp` and `max_bytes` are checked separately.

## Family B: identity assertions

```text
base64url(payload) "." base64url(signature) "." key_id
```

The payload JSON is in declaration order, **not sorted**:

```text
user_id, device_id, device_pubkey, audience, origin, profile_version, display_name, avatar_ref, iat, exp
```

`avatar_ref` is omitted when absent. Verify the received payload segment **verbatim**, then parse it. Never re-serialise. Unknown claims are ignored.

The verifier checks, in order:

1. the signature, against the key found from `origin` + `key_id`;
2. `audience` equals this server's name exactly;
3. `exp` (ms) > now;
4. `iat` ≤ now + 60 000 ms.

## Family C: federation requests

`federation::signing_payload` is a Family A canonical object with exactly six members:

```json
{"body_hash":"…","destination":"…","method":"…","origin":"…","path":"…","timestamp":0}
```

- `method` is upper-case.
- `path` excludes the query string.
- `timestamp` is in ms.
- `body_hash` is the lowercase hex BLAKE3 of the body. For an empty body: `af1349b9f5f9a1a6a0404dea36dcc9499bcb25c9adc112b7cc9a93cae41f3262`.

```text
Authorization: X-Telium-Federation origin=…,destination=…,key=…,ts=…,sig=…
```

Optional parameters `signer=` and `authority=` mark [delegated signing](/reference/protocol/federation/#authentication-classes).

The query string is unsigned, so a federation endpoint **MUST NOT** accept a query argument that changes what the request does.

The receiver, before using the body:

1. rejects a malformed header (no defaults);
2. checks that `destination` is itself;
3. checks `|now - timestamp|` ≤ the skew window (`[federation] max_clock_skew_secs`, default 300);
4. recomputes `body_hash` from the received bytes;
5. resolves the key and verifies the signature.

## Family D: domain-separated strings

The tag and fields are joined with `|` (U+007C), UTF-8, no length prefixes.

| Tag | Fields after the tag | Signed by |
| --- | --- | --- |
| `telium-identity-anchor:v1` | `user_id`, `immutable_id`, `identity_key` | identity key |
| `telium-identity-rotate:v1` | `immutable_id`, `sequence`, `previous_key`, `new_key` | **new** identity key |
| `telium-identity-recovery-policy:v1` | `immutable_id`, `version`, `identity_sequence`, guardians | identity key |
| `telium-device-sig:v1` | `user_id`, `device_id`, `mls_key` | identity key |
| `telium-device-revoke:v1` | `user_id`, `immutable_id`, `device_id`, `mls_key` | identity key |
| `telium-password-reset:v1` | `user_id`, `reset_id`, `challenge`, `registration_record` | recovery key |
| `telium-recovery-k1-restore:v1` | `user_id`, `attempt_id`, `challenge`, `ciphertext` | recovery key |

Guardians are serialised as JSON `[threshold, [[user_id, immutable_id, identity_key], …]]`, with the rows sorted by `immutable_id`, then `user_id`, then `identity_key`.

The immutable id hashes a domain tag that ends in a NUL byte:

```text
"tid:" || lowercase_hex(SHA-256("telium-identity-id:v1\0" || raw_32_byte_pubkey))
```

Migration grants (`grant_payload`) are Family A JSON signed by a device key, with the signature sent separately and no `signature` member in the object.

## Family E: relocation record

1. The successor signs the body (Family A). Rename `signature` to `new_signature` and `key_id` to `new_key_id`.
2. The old key signs the body including `new_signature` (Family A).

To verify, check the outer signature, then rename the fields back and check the inner one. Both **MUST** pass (`relocation::check_signatures`).

## Key validity

`valid_from` and `valid_until` are in ms; `valid_until` is exclusive.

| Object | Key must be valid |
| --- | --- |
| Live request | now (`verify_key`) |
| Durable record (tombstone, promotion proof, relocation record) | at the record's timestamp (`verify_key_at`) |

Vectors for every family are listed in [Conformance](/reference/protocol/conformance/).
