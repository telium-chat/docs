---
title: Quick start
description: Run a Telium homeserver on your machine to try it out. For a publicly reachable one, start with Running in production.
sidebar:
  order: 1
---

This page gets a homeserver running on your machine so you can try Telium, and stops there. A publicly reachable server wants a production install, which sets up automatic updates: continue with [Running in production](/self-hosting/production/) when you are ready to move beyond loopback. Running a web client is not part of it: people use the one hosted at [telium.chat](https://telium.chat), and hosting your own is optional.

## How it compares

Telium has Discord's guild model on servers you run, federated like Matrix, with DMs encrypted end to end.

<img class="diagram diagram-light" src="/diagrams/compare-light.svg" alt="Feature comparison of Telium, Discord, Element (Matrix), Signal, Telegram and Mattermost: self-hosting, federation, communities, end-to-end encrypted DMs and channels, calls, bots, account migration, phone-free sign-up, open source and maturity." />
<img class="diagram diagram-dark" src="/diagrams/compare-dark.svg" alt="Feature comparison of Telium, Discord, Element (Matrix), Signal, Telegram and Mattermost: self-hosting, federation, communities, end-to-end encrypted DMs and channels, calls, bots, account migration, phone-free sign-up, open source and maturity." />

Telium is alpha. The others have years of production use, audits and polished apps. If you need encrypted community channels today, use Matrix or Signal groups.

## Requirements

- Rust 1.85 or newer
- Git
- [Bun](https://bun.sh), only to run or build the web client yourself

The client needs no setup. [telium.chat](https://telium.chat) is a full Telium web client that works with every server, including one on your own machine.

## Try it locally

Start the homeserver:

```sh
git clone https://github.com/telium-chat/telium.git
cd telium/server
cargo run -- init     # writes telium.toml
cargo run -- serve    # listens on 127.0.0.1:8448
```

Open [telium.chat](https://telium.chat) and register an address on your server, such as `@alice:localhost:8448`. The first account on a fresh server becomes its administrator. To name administrators explicitly instead, list their localparts in `registration.admins`.

To keep the client on your machine too, run it from the repository in a second terminal:

```sh
cd telium/web
bun install
bun run dev           # http://localhost:5173
```

The Vite dev server proxies API, discovery and gateway paths to `http://localhost:8448`. Set `TELIUM_ORIGIN` to point it at another homeserver.

This server is for looking around and for development: it listens on loopback only and has no automatic updates. A publicly reachable server — even if you are its only user — comes from a production install.

## Go public

[Running in production](/self-hosting/production/) compares the two supported installs — native systemd and Docker Compose. Both are one command with your domain as the argument, and both ship an updater that installs new releases on its own. That matters in alpha: releases can change the wire format, and a server left behind will stop working with updated clients and federated servers. [Stability](/start/stability/) says what that means in practice.

## Voice and video

Calls work without extra setup: with no SFU configured, the server uses peer-to-peer mesh for up to `voice.mesh_max_participants` people (default 4). Larger calls and TURN relays for restrictive networks are production concerns — see [SFU](/self-hosting/sfu/) and [DM calls](/features/dm-calls/).
