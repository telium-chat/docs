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

Start at [CONTRIBUTING.md](https://github.com/telium-chat/telium/blob/main/CONTRIBUTING.md) and [Development](/docs/reference/development/).
