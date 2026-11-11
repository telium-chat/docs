---
title: MLS
description: MLS profile for encrypted conversations.
sidebar:
  order: 5
---

This page specifies the exact MLS ciphersuite, frame encoding and extensions used by Telium. It is for implementers. For what users should expect from encrypted DMs, see [DM encryption](/security/dm-encryption/).

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
