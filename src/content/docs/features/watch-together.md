---
title: Watch together
description: Play one video in sync for everyone in a call, which services work, what they learn, and how operators turn it off.
sidebar:
  order: 7
---

Watch together puts one video on everyone's screen in a call and keeps every copy on the same second. It lives on the call stage, rides the call's signalling, and ends when the call ends.

## What can be synced

| Source | Sync | Notes |
| --- | --- | --- |
| YouTube | play, pause, seek, speed | embedded from `www.youtube-nocookie.com` |
| Vimeo | play, pause, seek, speed | embedded from `player.vimeo.com` with `dnt=1` |
| Direct video file (`.mp4`, `.webm`, `.m3u8` and similar) | play, pause, seek, speed | plays in a `<video>` element, best sync |
| Any other page | not possible | the start dialog says so and suggests screen sharing |

Pages on other origins cannot be controlled from the client (same-origin policy), so they are refused up front rather than drifting. [Screen sharing](/features/voice-and-video/#screen-sharing) plays anything and contacts nobody outside the call.

## Starting and consent

In a guild voice channel, starting a session needs `STREAM`. In a DM or group call, anyone in the call can start one. Anyone in the session can then play, pause, seek or change speed.

Before a player loads, the stage names the exact host it will connect to and what that host learns, and waits for you to agree. Consent is per session and held in memory only: it does not sync, and the next video asks again. No provider SDK is loaded at any point; the client speaks each player's documented `postMessage` protocol directly.

Link cards in channels never become players. Outside a watch-together session, links still go through [camo](/features/media/#link-previews-and-camo).

## Sync behaviour

The room shares one timeline `{ seq, by, at, position, rate, paused }`, where `at` is the publisher's clock time when `position` was true. Each client measures its clock offset to the publisher and corrects drift:

| Drift | Action |
| --- | --- |
| under 50 ms | nothing |
| 50 ms to 1 s | adjust `playbackRate` (at most ±5%) to close the gap over 8 s |
| 1 s or more | seek |

Late joiners land at the current position from the first message. If two people press controls at once, the higher counter wins and ties go to the lower user id, so every client agrees without a coordinator.

If someone's player stalls, the room pauses for them for up to 20 seconds, then continues and tells everyone who was left behind.

## Privacy

Session notes travel over the call's signalling route, one request per recipient:

```text
POST /_telium/v1/channels/{channel_id}/voice/signal
POST /_telium/v1/conversations/{conversation_id}/voice/signal
```

| Call | Who can read what you watch |
| --- | --- |
| DM or group call | nobody but participants: notes are sealed with AES-GCM under a key exported from the conversation's MLS group |
| Guild voice channel | the guild server, same as the channel's text. The start dialog and consent gate say so |

Either way, the video service you agreed to sees your IP address for as long as the player is open. Every incoming note is validated, and a player source is always rebuilt from a parsed id, so a crafted note cannot inject a URL into a frame.

## Operator control

The allowlist is published in the media registry:

```text
GET /_telium/v1/media/registry  ->  { …, "watch_together": { "enabled": true, "providers": [] } }
```

```toml
[media_registry.watch_together]
enabled = true
providers = ["youtube", "vimeo", "file"]
```

- Omitting the section enables every service the client supports.
- `providers` can only narrow that list. An empty list means all.
- `enabled = false` turns the feature off, and the call offers screen sharing only.
