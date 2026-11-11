---
title: Troubleshooting and support
description: Fix common problems and file useful bug reports.
sidebar:
  order: 5
---

## Start here

| Problem | Try this |
| --- | --- |
| Can't sign in or register | Check the homeserver domain after `:` in your username. Some servers require invitation codes. |
| Telium can't find a server | Check its `/.well-known/telium/server` URL or [website-domain delegation](/self-hosting/domain-delegation/). |
| File upload fails or returns HTTP 413 | Check both the [server upload policy](/self-hosting/public-server/#set-media-limits) and proxy/tunnel limits. |
| Call connects with no audio | Check microphone access and the [SFU troubleshooting steps](/self-hosting/sfu/#troubleshooting). |
| A cross-server friend or guild action fails | Try a local action, then report both homeserver domains for [federation debugging](/federation/overview/). |

## Report a bug

Use the [Telium issue tracker](https://github.com/telium-chat/telium/issues). For a new feature, use the feature request form; for a software failure, use the bug report form. Report abuse to the relevant **server operator**, not the software issue tracker.

**Security vulnerabilities must be reported privately** through [SECURITY.md](https://github.com/telium-chat/telium/blob/main/SECURITY.md), not a public issue.

Include the client version, platform, what you tried, what happened and reproduction steps. Operators can also attach a short relevant log excerpt. On native installs:

```sh
journalctl -u telium-server -n 100
```

On Compose, run `docker compose logs --tail=100 server` from the install directory.

**Remove secrets before sharing:** passwords, bearer tokens, recovery keys, private messages and personal data. Check logs and screenshots yourself before uploading them. Developers can start with [Contributing](/reference/development/).