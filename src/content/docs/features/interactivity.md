---
title: Interactivity
description: Buttons, selects, cards, modals and ephemeral messages that bots attach to messages, and the interaction round trip.
sidebar:
  order: 9
---

Bots can attach controls (`components`) and structured blocks (`cards`) to a message. A person pressing a control creates an *interaction* that the server delivers to the bot, which answers with a callback.

Only a bot, or an application hosted by the same server, can attach non-empty `components` or `cards`. A human session that tries gets `403` and nothing is written. The same check applies on edit, so a person cannot add buttons to a message later. See [Bots](/docs/features/bots/) for installing one.

## Round trip

```text
person                server                          bot
  | press              |                                |
  |------------------->| re-check standing              |
  |                    | create interaction + token     |
  |                    |------- INTERACTION_CREATE ---->|
  |<--- 200 {id} ------|                                |
  |                    |<-- POST .../{id}/{token}/callback
  |<-- MESSAGE_CREATE -|                                |
```

The token goes to the bot only. The person who pressed never sees it.

## Sending components

```json
{
  "content": "Pick a colour",
  "components": [
    {
      "type": "action_row",
      "components": [
        { "type": "button", "style": "primary", "label": "Red", "custom_id": "colour:red" },
        { "type": "button", "style": "secondary", "label": "Blue", "custom_id": "colour:blue" },
        { "type": "button", "style": "link", "label": "Help", "url": "https://example.com/help" }
      ]
    },
    {
      "type": "action_row",
      "components": [
        {
          "type": "select",
          "custom_id": "shade",
          "placeholder": "How dark?",
          "min": 1,
          "max": 1,
          "options": [
            { "label": "Pale", "value": "pale" },
            { "label": "Deep", "value": "deep", "description": "quite dark", "default": true }
          ]
        }
      ]
    }
  ]
}
```

Send it to `POST /_telium/v1/channels/{channel_id}/messages` with the bot's guild session. `PATCH .../messages/{id}` accepts `components` too: leave the field out to keep the stored tree, or send `[]` to clear it.

Button styles are `primary`, `secondary`, `success`, `danger` and `link`. A `link` button has a `url` and no `custom_id`. Every other style has a `custom_id` and no `url`. Pressing a link button opens the URL in the browser and does not reach the server.

`custom_id` is your own opaque string. The server matches it against the stored tree and echoes it back, nothing more.

### Limits

The server validates every tree on write and returns `422` on a violation.

| Rule | Limit |
| --- | --- |
| Action rows per message | 5 |
| Components per row | 5 |
| Top-level component type | `action_row` only, no nesting |
| `custom_id` | 100 characters, unique within the message |
| Button label | 80 characters |
| Select placeholder | 150 characters |
| Select options | 1 to 25, unique values (option value 100 characters, description 100) |
| `text_input` | Modals only, at most 5 per modal, value up to 4000 characters |
| Cards per message | 5 |
| Card fields | 25 (name 256, value 1024 characters) |
| Card title / description / footer / author | 256 / 4096 / 2048 / 256 characters |
| URLs | `https:` only, no embedded credentials, 2048 characters |

## Cards

```json
{
  "cards": [{
    "title": "Deploy 41f2c8",
    "url": "https://ci.example.com/builds/41f2c8",
    "description": "Green on all runners.",
    "colour": 3066993,
    "author": { "name": "CI" },
    "fields": [
      { "name": "Duration", "value": "4m12s", "inline": true },
      { "name": "Tests", "value": "1182", "inline": true }
    ],
    "image": { "origin": "chat.example.com", "hash": "<blake3>", "width": 800, "height": 200 },
    "footer": { "text": "build #4194" },
    "timestamp": 1758240000000
  }]
}
```

Clients draw cards with the bot's name on them, separate from link embeds. `image` and `thumbnail` cannot be URLs. They take one of two forms:

```json
{ "origin": "chat.example.com", "hash": "<blake3>", "width": 800, "height": 200 }
{ "camo": "<blake3>", "width": 800, "height": 200 }
```

`origin` plus `hash` names uploaded media (foreign origins go through the normal federated media check). `camo` names a hash already in this server's media cache. Both are resolved on write, so readers only fetch from their own server. See [Media](/docs/features/media/).

## Receiving an interaction

A press is `POST /_telium/v1/channels/{channel_id}/messages/{message_id}/interact` with `{"custom_id": "...", "values": [...]}`. The bot receives `INTERACTION_CREATE` on its gateway connection:

```json
{
  "id": "01J...",
  "token": "...",
  "kind": "component",
  "application_id": "...",
  "application_origin": "chat.example.com",
  "guild_id": "...",
  "channel_id": "...",
  "message_id": "01J...",
  "user_id": "@someone:chat.example.com",
  "member": { "user_id": "...", "roles": ["..."], "permissions": "1024" },
  "data": { "custom_id": "colour:red", "values": ["deep"] }
}
```

`permissions` is a decimal string because it is a 64-bit mask. Interactions reach only the bot that owns the message and do not need a gateway intent.

At press time the server checks again that:

- the presser is a member, is not banned and can still see the channel;
- the message exists and is not deleted;
- the component exists in the stored tree, is not disabled and is not a link button;
- select values are all offered options, without duplicates, within `min` and `max`;
- the bot is still installed and not banned (an uninstalled bot's buttons stop working);
- the presser is a person (bots cannot press components).

Presses are rate-limited per user at the `[rate_limit]` write rate (`write_burst`, `write_per_sec`) and per bot at eight times that.

## Responding

```text
POST /_telium/v1/interactions/{id}/{token}/callback
Authorization: Bearer <bot guild session>
```

The token is valid for 15 minutes and works once. A second POST returns `409`. A token for another bot's interaction returns `404`, the same as an unknown token.

| `type` | Effect |
| --- | --- |
| `message` | Posts a new message as the bot. The bot's `SEND_MESSAGES` is checked again. |
| `update_message` | Rewrites the message holding the component. Only works on the bot's own messages, and does not mark the message edited. |
| `deferred` | Spends the token and shows the presser a pending state (`INTERACTION_DEFERRED`). Follow up with `PATCH` on the same callback URL within 15 minutes. |
| `modal` | Opens a form for the presser. |

```json
{ "type": "message", "data": { "content": "Red it is.", "cards": [], "components": [], "ephemeral": false } }
```

After `deferred`, the first `PATCH .../callback` with `{content, components, cards}` creates the message and later ones edit it. A `PATCH` before any response returns `409`.

### Modals

```json
{
  "type": "modal",
  "data": {
    "custom_id": "report",
    "title": "Report this",
    "components": [{
      "type": "action_row",
      "components": [
        { "type": "text_input", "custom_id": "why", "label": "Why?",
          "style": "paragraph", "required": true, "max": 500 }
      ]
    }]
  }
}
```

`text_input` styles are `short` and `paragraph`. The presser's client gets `MODAL_OPEN` and submits with its own session:

```text
POST /_telium/v1/interactions/{id}/modal
{ "components": [{ "custom_id": "why", "value": "..." }] }
```

The server checks the submission against the form that was opened: unknown fields are refused, required fields must be filled, and lengths must fit `min` and `max`. Each form accepts one submission; a second returns `409`. A valid submission creates a new interaction of kind `modal_submit`, with its own token and a `parent_id`. You cannot answer a modal with another modal.

## Ephemeral messages

`"ephemeral": true` on a `message` response (or on the `deferred` before a follow-up) shows the message to the presser only. It is not stored in channel history, search, notifications, exports or federation, and moderators cannot see it. Do not use ephemeral messages for anything the channel needs a record of.

An ephemeral message can carry components. Their state is kept for 24 hours. Presses go to:

```text
POST /_telium/v1/channels/{channel_id}/ephemeral/{ephemeral_id}/interact
{ "custom_id": "confirm" }
```

Anyone other than the recipient gets `404`. An `update_message` response rewrites it and sends `EPHEMERAL_MESSAGE_UPDATE` to the same person.

## Deleting a message

Deleting a message clears its components and cards.

## Applications hosted on the server

A server can host an application in-process (`bot_applications.local`). It receives interactions through the `LocalApplication` trait in `server/src/gateway/local_apps.rs` instead of a socket, and answers with the same token and callback rules. It has the same permission ceiling, managed role and audit entries as any other bot.
