---
title: Protocol spec
description: The normative wire contract for building an independent Telium server or client.
sidebar:
  order: 1
---

These pages define the wire contract an independent server or client must follow. The key words **MUST**, **MUST NOT**, **SHOULD** and **MAY** are as in RFC 2119.

| Page | Covers |
| --- | --- |
| [Signing](/docs/reference/protocol/signing/) | Canonicalisation and the five signing families. Read first. |
| [Federation](/docs/reference/protocol/federation/) | Discovery, server-to-server authentication, signed routes, errors |
| [Gateway](/docs/reference/protocol/gateway/) | The realtime WebSocket |
| [MLS](/docs/reference/protocol/mls/) | Telium's RFC 9420 profile |
| [Conformance](/docs/reference/protocol/conformance/) | Test vectors and the conformance suite |

Precedence when sources disagree: [test vectors](https://github.com/telium-chat/telium/tree/main/docs/spec/vectors), then code, then these pages.

Versioning, capabilities and negotiation are normative in [Compatibility](/docs/reference/compatibility/). Stability promises are in [Stability](/docs/start/stability/), and federation behaviour in [Federation overview](/docs/federation/overview/).

Two rules apply everywhere:

1. A reader **MUST** ignore unrecognised fields and **MUST NOT** strip them before verifying a signature.
2. Adding a field is compatible. Changing what a signature covers is incompatible at any version.
