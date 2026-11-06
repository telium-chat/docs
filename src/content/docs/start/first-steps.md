---
title: Your first steps in Telium
description: Create an account, find a community, send messages and try calls without running a server.
sidebar:
  order: 1
---

You do **not** need to host anything to use Telium. Pick an account home, sign in and join communities hosted across the network.

## 1. Open a client

Use [telium.chat](https://telium.chat) in your browser, or choose a [desktop or Android client](/start/clients/). The same account works across clients.

## 2. Choose where your account lives

A Telium address looks like `@alex:chat.example.com`. The part after the colon names your **home server**: the server that stores your account and handles sign-in.

- If someone invited you to their server, ask whether they accept new accounts and use their domain.
- If your client offers a server directory or recommendation, you can browse it. You can also enter a server name manually.
- A home server must allow registration before you can create an account there. Its operator sets the rules and manages that server.

**Your home server is not the same thing as a guild.** Once you have an account, you can join guilds (communities) hosted on *other* Telium servers without creating a new account on each one. [How federation works](/start/architecture/).

:::caution[Choose an operator you trust]
Your home server handles your login and account metadata. A guild server can read messages in its guild text channels. DMs and group DMs are end-to-end encrypted, but guild text messages are not. See [Privacy](/security/privacy/).
:::

## 3. Create your account and protect it

Register with a unique localpart and a strong password. If the client gives you an account recovery key, **save it somewhere safe and outside the device** before dismissing it. Review your sign-in devices and available recovery settings under your account's security settings.

[Account security](/security/account-security/) explains what your home server can and cannot recover if you lose access.

## 4. Find people and communities

There are two easy starting points:

- **Join a guild through an invite.** A guild has channels, members, roles and moderators. It can live on a different server from your account.
- **Create your own guild.** Add text or voice channels, then invite friends.

You can also [add friends](/features/friends/) using their full Telium address, even when their accounts live on different home servers.

Read [Guilds](/features/guilds/) when you want to manage roles, invitations and moderation.

## 5. Try a message, a file and a call

Send a message to a friend or a guild channel. Try attaching a small file and check where it will be uploaded and when it expires — the destination and limits can vary. [How file uploads work](/features/media/).

For voice, join a channel with another person. Small calls work directly between participants; larger calls can use an [SFU relay](/features/voice-and-video/). You don't have to run an SFU yourself.

## If something doesn't work

| Problem | Where to go |
| --- | --- |
| The client can't reach your server | [Client connection problems](/start/clients/#connection-problems) |
| You can't register | Check that your chosen home server allows new accounts; another server may accept them |
| A guild invite or friend request fails | [Federation](/federation/overview/) and [Getting help](/start/getting-help/) |
| Calls have no audio or fail to connect | [Voice and video](/features/voice-and-video/) |

Telium is still [alpha](/start/stability/). Expect changes, report bugs when you find them, and do not rely on guild text channels for secrets.

**Want to operate your own home server instead?** Start with [Running in production](/self-hosting/production/), then follow [After setting up your server](/self-hosting/after-setup/).
