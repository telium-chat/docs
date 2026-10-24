---
title: Rich presence
description: Share the game, music or video you are playing from the Telium desktop app, and what it does with that data.
sidebar:
  order: 8
---

The Telium desktop app (Electron) can show what you are playing, listening to or watching as part of your presence. This page covers the controls, the sources it reads, and what reaches other people.

## Settings

Open **Settings -> Activity sharing**. Three switches work independently:

| Switch | Default on a new install | Shows |
| --- | --- | --- |
| Game presence | on | games and apps (Playing) |
| Music presence | off | Listening |
| Video presence | off | Watching (and Streaming) |

These settings are **per device**. They are not synced, so turning on detection on one machine never turns it on elsewhere.

Detection starts only after you sign in and with at least one switch on. Signing out, or turning all three off, stops it and clears your activity. Invisible and offline status hide activity as usual. The current activity is not stored anywhere as a history.

## Sources

Up to one game, one music and one video activity can show at once. Within each category the richest source wins:

1. Discord-compatible Rich Presence sent by an application;
2. the operating system's media session (Linux MPRIS, or the Windows media helper);
3. generic program detection.

### Discord-compatible RPC

Telium bundles a pinned [arRPC](https://github.com/OpenAsar/arrpc) build and runs it in an isolated utility process. Apps that publish Discord Rich Presence work without changes. Telium probes the Discord IPC socket range and uses a free slot, so it coexists with a running Discord. A crashed worker clears your activity and restarts without affecting the app window.

### Wine and Proton games

Windows games under Wine or Proton can reach the native listener without per-game Steam launch options. For Steam/Proton prefixes, Telium installs a small helper as a Wine service once the prefix is idle; Wine starts it alongside the game on the next launch. The helper does nothing unless a running Telium instance has written a fresh authenticated local endpoint. Plain Wine and Lutris sessions use an on-demand path instead.

**Activity sharing** shows bridge state (Wine process found, service install pending, bridge ready, relaying) so you can tell where it stopped.

### Linux media (MPRIS)

Telium reads `org.mpris.MediaPlayer2` players on your session D-Bus: title, artist, album, duration, position and artwork. Media is classed as Listening or Watching. A player's `xesam:mimeType` wins when present; otherwise known video URLs (YouTube, Vimeo, Twitch) and video file extensions become Watching, and everything else stays Listening. A missing bus, no players, or a paused player does not affect anything else. The settings pane shows which players are visible, readable and playing.

## Artwork

| Artwork | Handling |
| --- | --- |
| Discord application assets | resolved to Discord's public asset images |
| Other HTTPS artwork URLs | shown to other viewers through Telium's [camo proxy](/features/media/#link-previews-and-camo), so they never contact the artwork host |
| Local MPRIS album art (`file://`) | uploaded as short-lived profile media (six hours); your filesystem path is never published |

## What other people see

Activity uses the normal presence path. Clients send a bounded `rich_activities` list (at most one per category) plus a legacy single-activity field for older clients. A web session that sends no activity leaves your desktop activity in place; only an explicit clear removes it.

Detail changes are batched with presence fanout. Starting, clearing, and a new track are sent right away.

A custom status takes priority over detected activity in compact views. In a guild's member list, your live voice channel in that guild comes first. Profile cards show voice, then game, music and video cards with artwork, details, elapsed time, party size and buttons.

## Safety

- Process lists, process ids, RPC socket ids and Discord join secrets never leave your machine or reach the app window.
- Activity is sanitized on the desktop and again by every viewer, since a modified client can send anything.
- Buttons and artwork URLs are scheme-checked; `javascript:` and credential-bearing URLs are dropped.
