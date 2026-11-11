---
title: Try a local server
description: Run Telium locally for testing without publishing a production service.
sidebar:
  order: 1
---

**This is for development and experimentation.** It starts a homeserver on localhost. For a server others will use, follow [Set up a homeserver](/self-hosting/production/) instead.

## Requirements

Install Git and a current Rust toolchain. Bun is optional unless you're developing the web client.

## Try it locally

```sh
git clone https://github.com/telium-chat/telium.git
cd telium/server
cargo run -- init
cargo run -- serve
```

The example server listens on `127.0.0.1:8448`. It is **not** publicly reachable and has **no automatic updater**.

For browser development on the same machine:

```sh
cd ../web
bun install
bun run dev
```

Open the local address printed by Vite; the dev server proxies API and gateway traffic to the local homeserver. Production users should use [telium.chat](https://telium.chat), not a copy of the web client on each homeserver.

## Go public

Don't expose the local test setup directly. Use the [native installer](/self-hosting/install-systemd/) or [Docker Compose](/self-hosting/install-docker/), set a permanent account domain, enable HTTPS, then complete the [post-install checks](/self-hosting/after-setup/).

For voice calls, a separate relay is optional for smaller calls. See [SFU setup](/self-hosting/sfu/) for larger calls or public relay hosting.