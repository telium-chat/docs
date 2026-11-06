---
title: Getting help
description: Where to report bugs, request features and disclose security issues, and what to include.
sidebar:
  order: 5
---

The GitHub issue tracker is the support channel. This page says where each kind of problem goes and what to attach.

| Problem | Where it goes |
| --- | --- |
| The client misbehaved or a screen broke | A [bug report](https://github.com/telium-chat/telium/issues/new?template=bug_report.yml) |
| A homeserver misbehaved (federation, media, calls, delivery) | A bug report naming the server and the component |
| A feature you want | A [feature idea](https://github.com/telium-chat/telium/issues/new?template=feature_request.yml) |
| Anything that could expose an account, a server or a message | Not a public issue. Report it privately as described in [SECURITY.md](https://github.com/telium-chat/telium/blob/main/SECURITY.md). |
| A user or message breaks a server's rules | That server's operators, through the report action in the client |

You can also file from the client under **Settings → Help & feedback**. It attaches diagnostics and shows you their contents first.

## A quick problem checklist

| What is wrong? | First things to try |
| --- | --- |
| Can't sign in or register | Double-check the **account home domain** (after the `:` in your username); a server can temporarily close registration. |
| The app can't find a server | Test `https://your-account-domain/.well-known/telium/server`. If its API is hosted on a different domain, check [delegation](/self-hosting/domain-delegation/). |
| Upload says too large or HTTP 413 | Compare the server's file-size policy with any reverse-proxy/tunnel limit. Public operators have a [media checklist](/self-hosting/public-server/#2-set-file-sizes-quotas-and-retention). |
| Voice has no audio | Check device and browser permissions; if mesh works but larger calls fail, ask the operator to inspect their [SFU](/self-hosting/sfu/). |
| Friends or guilds fail across servers | Try a local guild first. If that works, include both homeserver domains in a [federation bug report](/federation/overview/). |

Before you post logs or screenshots, remove passwords, access tokens, recovery keys, private message contents and other people's sensitive information.

## What to include

### Client

- The build line from the footer of the settings screen: version, build ID, runtime and build time. You can select it to copy.
- Diagnostics from **Settings → Connected servers → Copy diagnostics**. They contain versions, connection close codes, storage health and recent failures, and no messages, drafts, names or credentials, so they are safe to post publicly.

### Homeserver

Run these and paste the output:

```sh
telium-server version
telium-server updates check
uname -m                # x86_64 or aarch64
telium-server check     # config audit
```

Add the log excerpt around the failure (`journalctl -u telium-server` on a native install, `docker logs` under Compose). Logs can name guilds and accounts, so trim them to the relevant window.

For federation problems, include logs from both servers if you can.

## Contributing a fix

Start at [CONTRIBUTING.md](https://github.com/telium-chat/telium/blob/main/CONTRIBUTING.md) and [Development](/reference/development/).
