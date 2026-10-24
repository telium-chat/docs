---
title: Conformance
description: The protocol test vectors, the order to implement them in, and the cases they cover.
sidebar:
  order: 6
---

The [test vectors](https://github.com/telium-chat/telium/tree/main/docs/spec/vectors) are the highest authority in the spec. `server/tests/spec_vectors.rs` generates them from the production code, diffs them on every run, and runs each case through the production verifiers.

To regenerate (two passes, then a check):

```sh
cd server
UPDATE_SPEC_VECTORS=1 cargo test --test spec_vectors
UPDATE_SPEC_VECTORS=1 cargo test --test spec_vectors
cargo test --test spec_vectors
```

## Vectors, in suggested order

| File | Check |
| --- | --- |
| `signed-json.json` | Serialise `input`, compare with `canonical.utf8` and `canonical.length`. `refuses` holds the non-integer case. |
| `federation-request.json` | Six-member payload, empty-body hash, a lower-case method upper-cased before signing |
| `identity-assertion.json` | Unsorted payload, verified verbatim |
| `domain-separated.json` | Pipe strings, `tid:` with NUL, guardians given out of order |
| `relocation-record.json` | Both canonical byte strings |
| `must-reject.json` | Every case **MUST** fail |
| `must-accept.json` | Every case **MUST** pass |
| `permissions.json` | Compute and compare |

Cases with `evaluate_at` are frozen: evaluate them at that instant.

## Covered cases

**Reject:** member appended or removed; signature valid over a subset; `S + L`; small-order key; key carried inside the document; assertion `audience` for another server; expired or future-`iat` assertion; payload swapped under a signature; `body_hash` mismatch; wrong `destination`; timestamp outside skew (both directions); expired key for a live request; relocation without successor countersignature.

**Accept:** unknown member; unknown assertion claim; rewritten `key_id`; retired key for a durable record dated inside its window.

**Permissions:**

- `ADMINISTRATOR` bypasses all overwrites.
- A timeout overrides everything, owner included: exactly `VIEW_CHANNEL | READ_MESSAGE_HISTORY`.
- Within a tier, denies are unioned and applied before unioned allows.
- Tiers apply in order: `@everyone`, roles, member.
- A bot's installation ceiling is re-applied after overwrites. `ADMINISTRATOR` inside a ceiling lifts it.
