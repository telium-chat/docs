---
title: MLS
description: Telium's RFC 9420 profile for DMs and group DMs, including the membership-policy extension and application frame types.
sidebar:
  order: 5
---

DMs and group DMs are RFC 9420 groups. The homeserver relays ciphertext only. This page fixes the ciphersuite, encoding, policy extension and application frame layout.

- Ciphersuite: `MLS_128_DHKEMX25519_AES128GCM_SHA256_Ed25519`, the only one.
- MLS frames use **standard base64, padded** (RFC 4648 §4), unlike every other surface ([Signing](/reference/protocol/signing/#general-rules)).

## Membership-policy extension

GroupContext extension `0xF7A0`. The body is UTF-8 JSON:

```json
{"v":1,"creator":"@a:x","add":"admins","remove":"admins","policy":"creator","admins":["@b:x"]}
```

- `v` **MUST** be `1`.
- `add`, `remove` and `policy` **MUST** each be `creator`, `admins` or `anyone`.
- `admins` holds at most 256 non-empty ids, deduplicated and sorted.
- Evaluation: `anyone` passes; the creator always passes; `admins` passes a listed member.
- A policy that fails to normalise is treated as absent.
- Clients **MUST** advertise `0xF7A0` in leaf capabilities. Key packages that do not are not added to policy-bearing groups.

## Application frames

The first plaintext byte is the type, followed by the payload.

| Byte | Type |
| --- | --- |
| `0x00` | MESSAGE |
| `0x01` | RECEIPT (account-level) |
| `0x02` | TYPING |
| `0x03` | REACTION |
| `0x04` | EDIT |
| `0x05` | DELETE |
| `0x06` | PIN |
| `0x07` | CALL_SFU |
| `0x08` | DELIVERED (per device) |

- `DELIVERED` names one device, which **MUST** equal the sending MLS leaf, else the frame is discarded. When both are due, it rides inside `RECEIPT` as `ack`.
- Unknown type bytes **MUST** be ignored.
- Legacy-shape typing frames are skipped during history replay.
