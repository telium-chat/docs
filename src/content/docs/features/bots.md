---
title: Bots
description: Bot identities, tokens, guild installation, intents and permission ceilings, and the @telium/bot SDK.
sidebar:
  order: 10
---

A Telium bot is a federated identity such as `@weather:bots.example`, with its own home server. This page covers how a bot authenticates, how a guild installs it, and how to run one with the JavaScript SDK.

## Security model

You create an application on an identity server. It gets a bot identity and a long-lived bot token. Bot identities are stored apart from human accounts and cannot use password, MFA, recovery or human-session flows.

The bot token works only on the bot's own home, sent as `Authorization: Bot <token>`. To reach a guild server:

1. The bot asks its home for an assertion bound to that guild server (`POST /_telium/v1/bots/assertions`).
2. The guild server verifies it and returns a short-lived local session (`POST /_telium/v1/bots/session`).

The bot token never goes to a guild server. A bot guild session lasts the shorter of `[sessions] guild_session_ttl_secs` and `assertion_ttl_secs`, so five minutes with the defaults:

```toml
[sessions]
assertion_ttl_secs = 300
guild_session_ttl_secs = 3600
```

An open bot gateway closes when its session expires, and the SDK fetches a fresh assertion before reconnecting. Token resets, application deletion and lowered ceilings reach every guild within that window.

## Permissions and intents

The guild server is authoritative. Inside a guild the bot is an ordinary member:

- A dedicated managed role carries its permissions, and channel overwrites apply as usual.
- REST calls go through the same permission checks as a person's.
- The application declares an intent ceiling and a permission ceiling. A guild can grant less, never more. Raising the ceiling later grants nothing in guilds that already installed the bot.
- Before each dispatch, an open gateway re-checks the guild's grant, so an uninstall or a reduced grant takes effect at once.
- Kick, ban and role changes on a bot member return a conflict. Change the installation instead.

Bot intents are `GUILD_MESSAGES`, `MESSAGE_CONTENT`, `GUILD_MEMBERS`, `GUILD_PRESENCES`, `GUILD_TYPING`, `GUILD_EXPRESSIONS`, `GUILD_STRUCTURE`, `GUILD_VOICE_STATES` and `DIRECT_MESSAGES`. New applications default to `GUILD_MESSAGES`, `GUILD_STRUCTURE`, `GUILD_EXPRESSIONS` and `GUILD_VOICE_STATES`, and to the permissions `VIEW_CHANNEL`, `SEND_MESSAGES` and `READ_MESSAGE_HISTORY`.

Without `MESSAGE_CONTENT`, message events arrive with empty `content` and `content_redacted: true`. `MESSAGE_CONTENT` must be granted twice: on the application under **User Settings > Developer**, and in the guild under **Guild Settings > Bots**.

Installing, changing and removing a bot needs `MANAGE_GUILD`. Each is recorded in the audit log as `bot.install`, `bot.update` or `bot.uninstall`. Installation data lives on the guild membership row, so it moves with the guild on migration and is covered by backups. See [Guilds and moderation](/features/guilds/).

## API

| Method and path | Auth | Purpose |
| --- | --- | --- |
| `GET` / `POST /_telium/v1/applications` | Developer session | List or create applications |
| `GET` / `PATCH` / `DELETE /_telium/v1/applications/{id}` | Developer session | Read, edit or delete one |
| `POST /_telium/v1/applications/{id}/token/reset` | Developer session | Issue a new bot token |
| `POST /_telium/v1/bots/assertions` | Bot token, bot home | Get an assertion for a guild server |
| `GET /_telium/v1/bots/installations` | Bot token, bot home | List active installations |
| `POST /_telium/v1/bots/session` | Assertion, guild server | Exchange it for a guild session |
| `POST /_telium/v1/guilds/{guild_id}/bots/preview` | Guild session | Resolve the signed application descriptor for the install review |
| `GET` / `POST /_telium/v1/guilds/{guild_id}/bots` | Guild session | List or install bots |
| `PATCH` / `DELETE /_telium/v1/guilds/{guild_id}/bots/{bot_user_id}` | Guild session | Change grants or uninstall |

Application names are 1 to 80 characters, descriptions up to 400. The bot localpart is 1 to 32 characters of `[a-z0-9._-]`. You cannot create an application while your account migration is pending.

Bots cannot hold DMs. A bot DM would need a real MLS client in the SDK.

## SDK

The first-party SDK is `@telium/bot` (Node 22 or later, ESM):

```js
import { BotClient } from '@telium/bot';

const bot = new BotClient({
  home: 'bots.example',
  token: process.env.TELIUM_BOT_TOKEN,
  intents: ['GUILD_MESSAGES', 'MESSAGE_CONTENT', 'GUILD_STRUCTURE'],
});

bot.on('MESSAGE_CREATE', async (message, { domain }) => {
  if (message.content === '!ping') await bot.sendMessage(message.channel_id, 'Pong!', { domain });
});

await bot.login();
```

| Option | Default | Effect |
| --- | --- | --- |
| `home` | | The bot's home server domain |
| `token` | | The bot token |
| `intents` | | Intents to request |
| `installationRefreshMs` | 5000 | How often to poll installations. `false` turns polling off. |
| `authRetryLimit` | 10 | Consecutive auth failures per domain before giving up |
| `allowInsecureHttp` | `false` | Local development only |

The SDK polls the installation list while running, so installing, removing or reinstalling the bot needs no restart. It keeps one gateway connection per guild server domain for all guilds there, and reconnects that domain when its guilds or grants change.

To answer buttons and other components, see [Interactivity](/features/interactivity/).

### Failures and reconnects

| Situation | SDK behavior |
| --- | --- |
| Socket loss, refused connection, timeout, HTTP 5xx | Retries with bounded backoff, emits a `warning` |
| Missing `HEARTBEAT_ACK` | Rebuilds the connection, `GATEWAY_HEARTBEAT_TIMEOUT` warning |
| `403` with code `bot_not_installed` | Stops retrying that installation until the installation list changes |
| `401`, or another `403` | Retried with `GATEWAY_AUTH_RETRY` / `GUILD_AUTH_RETRY` warnings, up to `authRetryLimit`. Then the domain is suppressed and an `error` with `terminal: true` fires. |
| `400`, `404` | Terminal at once |

Discovery uses HTTPS only and never falls back to plaintext. The `api` and `gateway` URLs a server publishes must be TLS and on the dialled domain or a delegation under it, and the SDK refuses a discovery document that names another domain. `TELIUM_BOT_INSECURE_ALLOW_PLAINTEXT_HTTP=1` allows plaintext for local development. Never set it in production: the bot token follows whatever address discovery returns.

## Not supported

Bot DMs, slash commands, OAuth-style user authorization, webhooks and a public application directory. Bots reconnect fresh instead of using gateway `RESUME`.
