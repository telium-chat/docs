---
title: Quick start
description: Run a local Telium homeserver and connect a client in a few commands.
sidebar:
  order: 1
---

**Want a public homeserver with a real domain?** Skip this local demo and use [Running in production](/self-hosting/production/). It includes HTTPS and automatic updates.

**Just trying Telium?** You can use the hosted client at [telium.chat](https://telium.chat). You do **not** need to host a web client, an SFU or a relay to run a homeserver.

## 1. Start a local homeserver

You need **Git** and **Rust 1.85+**.

```sh
git clone https://github.com/telium-chat/telium.git
cd telium/server
cargo run -- init
cargo run -- serve
```

This creates `telium.toml` and starts Telium on `127.0.0.1:8448`.

## 2. Open the client

Go to [telium.chat](https://telium.chat) and register an account on your local server, for example `@alice:localhost:8448`. The first account on a fresh server becomes the administrator.

If you also want to develop the web client, open another terminal:

```sh
cd telium/web
bun install
bun run dev
```

This requires [Bun](https://bun.sh). The local Vite client proxies Telium API and gateway requests to `http://localhost:8448`; set `TELIUM_ORIGIN` to point it at another homeserver.

## 3. Decide what to do next

| Your goal | Next page |
|---|---|
| Put your server on the internet | [Running in production](/self-hosting/production/) |
| Run private voice/video infrastructure | [Voice relays (SFUs)](/self-hosting/sfu/) |
| Learn how accounts and guilds work | [Architecture](/start/architecture/) |
| Understand alpha limitations | [Stability](/start/stability/) |

**Voice does not require you to run an SFU.** Publicly reachable guild servers can use available relays from the signed public directory automatically; otherwise small calls can use peer-to-peer mesh, up to four participants by default. You can run a **private** SFU for your community without volunteering it to the public network.

:::caution
This local server is for testing: it has no TLS, is only reachable on loopback and does not have automatic updates. Do not expose the dev command directly to the internet.
:::

## What Telium is

Telium combines Discord-style communities with federated, independently run homeservers and encrypted DMs.

<img class="diagram diagram-light" src="/diagrams/compare-light.svg" alt="Feature comparison of Telium, Discord, Element (Matrix), Signal, Telegram and Mattermost: self-hosting, federation, communities, end-to-end encrypted DMs and channels, calls, bots, account migration, phone-free sign-up, open source and maturity." />
<img class="diagram diagram-dark" src="/diagrams/compare-dark.svg" alt="Feature comparison of Telium, Discord, Element (Matrix), Signal, Telegram and Mattermost: self-hosting, federation, communities, end-to-end encrypted DMs and channels, calls, bots, account migration, phone-free sign-up, open source and maturity." />

Telium is **alpha**. Other messaging platforms have years of production use and more mature security review. For established encrypted communities today, consider Matrix or Signal groups.
