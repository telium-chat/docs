---
title: Voice and video
description: Guild voice channels, camera, screen sharing, mesh and SFU modes, regions, permissions and encryption.
sidebar:
  order: 5
---

This page covers calls in **guild voice channels**: joining, mesh and SFU modes, end-to-end encryption, regions, permissions, camera and screen sharing. Calls in DMs and group chats work differently; see [DM calls](/docs/features/dm-calls/). Running an SFU is covered in [SFU](/docs/self-hosting/sfu/).

## Who decides what

The guild server is the authority for a guild call, even when media flows through an SFU on another machine. It decides:

- whether you may connect, speak, publish camera or share your screen;
- the channel user limit and the bitrate ceiling;
- which region and SFU the call uses;
- server mute, deafen and move;
- which screen shares are live and who is watching each one.

The SFU does not evaluate roles. It receives a short-lived token, signed by the guild server, carrying flags that were already evaluated.

## Permissions

| Permission | Allows |
| --- | --- |
| `CONNECT` | joining the voice channel |
| `SPEAK` | sending microphone audio |
| `VIDEO` | publishing camera video |
| `STREAM` | screen sharing, and starting a [watch-together](/docs/features/watch-together/) session |
| `PRIORITY_SPEAKER` | priority speaker flag on the SFU token |
| `MUTE_MEMBERS`, `DEAFEN_MEMBERS` | server mute and deafen |
| `MOVE_MEMBERS` | moving another member to a different voice channel, and joining a channel that is at its user limit |

Moderation actions also respect the role hierarchy: you can only act on members you outrank. Server mute removes `speak` from the minted token, so a modified client cannot unmute itself at the SFU. Server mute and deafen survive leaving and rejoining.

Moving a member changes their voice state on the server. The moved member's own client then leaves the old room and joins the new one with a fresh token; the moderator never receives that member's credential.

## Joining

```text
POST /_telium/v1/channels/{channel_id}/voice/join
```

The server checks `CONNECT`, records a voice state (device, session id, region, mute, deafen, video and stream flags), publishes `VOICE_STATE_UPDATE`, and returns a `voice_server` object naming the mode. Long calls refresh their token with `POST /_telium/v1/channels/{channel_id}/voice/token`. A voice state belongs to a live session: when a device's last gateway connection goes away, the server removes it after `voice.reconnect_grace_secs`.

## Mesh and SFU

| | Mesh | SFU |
| --- | --- | --- |
| Used when | no usable SFU region is configured | a region resolves |
| `voice_server.mode` | `"mesh"` | `"sfu"` |
| Media path | peer to peer WebRTC, signalled through the guild server | each client sends once to the SFU (LiveKit) |
| Size | capped by `voice.mesh_max_participants` (default 4) | as large as the SFU handles |
| Encryption | DTLS-SRTP between peers | end-to-end, under a per-call MLS group |

In SFU mode the join answer carries the SFU endpoint and a guild-signed join token. The client spends the token at the SFU's `/session` endpoint, receives a LiveKit URL and access token, and talks WebRTC to LiveKit.

Mesh reserves separate media lines for microphone, camera, screen video and screen audio, so starting a camera or share swaps tracks without rebuilding the call.

### Encryption on the SFU

Every guild call on an SFU is end-to-end encrypted, and the join answer says `e2ee: "required"`. Each live call gets its own MLS group holding only the devices in the call, for as long as the call lasts.

- The join must include a fresh `key_package`. A join to an SFU channel without one gets `400`.
- The first person in founds the group. After that, the server names one **committer** (the longest-present member). When the roster changes, the committer posts one commit that adds the waiting devices and removes departed ones. A commit from anyone else gets `409 not_committer`.
- If the committer stays silent for 8 seconds while someone waits, the role moves to the next member.
- A member that misses a commit reads it back from `GET /_telium/v1/channels/{channel_id}/voice/e2ee/commits?since=N` (the server keeps the newest 256 epochs).
- Each epoch's media key is exported from the group and fed to LiveKit frame encryption. Devices drop frames they have no key for, so a late Welcome means a moment of silence, never audio in the clear.
- Each leaf must carry a device key the account has cross-signed. A leaf that fails this check ends the call on the device that found it.

The web client refuses to join an SFU call whose answer does not say `e2ee: "required"`, and never subscribes to a track LiveKit reports as unencrypted.

Limits:

- The guild server can stall a call (withhold a commit, drop a package) but cannot add a device of its own or read media.
- Participants, timing, packet sizes and network addresses stay visible to the guild server and the SFU.
- Mesh guild calls do not get this layer. Their media is peer to peer, but the guild server relays the SDP in the clear, so a hostile guild server could rewrite fingerprints and sit in the middle.

## Regions

A voice channel stores a region name, usually `auto`. Candidates come from the server's `[[voice.regions]]` and from regions a guild adds for itself.

For `auto` the server picks, in order: the guild's healthy default, the server's healthy default, the first healthy candidate, then the first candidate if none are healthy. A named region is used when it exists and is healthy; otherwise selection falls back to `auto`.

### Latency probing

A client on `auto` measures before joining. It sends `GET /health` to up to four healthy candidate SFUs, two rounds each, within a 2 second budget, with no credentials, referrer or custom headers. It requests the fastest region unless:

- there is only one candidate;
- the fastest is already the server default, or within 25 ms of it;
- nothing could be measured (blocked by CORS, a proxy, or all offline).

In those cases the join says `auto`. Results are cached for ten minutes. A region you choose by hand is never probed.

### Region routes

```text
GET     /_telium/v1/voice/regions
GET     /_telium/v1/guilds/{guild_id}/voice/regions
POST    /_telium/v1/guilds/{guild_id}/voice/regions
PATCH   /_telium/v1/guilds/{guild_id}/voice/regions/default
DELETE  /_telium/v1/guilds/{guild_id}/voice/regions/{name}
```

Managing guild regions requires guild management rights.

## Bitrate

`voice.max_bitrate` (default 2,500,000 bit/s) is the server ceiling. A channel can lower it but not raise it. The effective ceiling goes into the SFU token, the SFU may clamp it further, and the client takes the smallest positive ceiling it sees and splits it among audio, camera and screen, with bounded simulcast layers.

## Camera

Publishing video needs `VIDEO`. The client sets the `self_video` voice-state flag with the media change, and viewers hide a camera as soon as `self_video` is false, so a browser holding the last decoded frame does not show it as live.

## Screen sharing

Sharing needs `STREAM`, and `voice.max_streamers_per_channel` (default 4) caps concurrent sharers in one channel. The picker asks what you are sharing first:

| Preset | Shown as | Content hint | Degradation preference | Default FPS |
| --- | --- | --- | --- | --- |
| `detail` (default) | A document or code | `text`, falling back to `detail` | `maintain-resolution` | 15 |
| `motion` | A game or video | `motion` | `maintain-framerate` | 60 |

You can then pick 720p, 1080p, 1440p or 2160p and 15, 30 or 60 FPS. Changing the preset resets FPS to the preset's default. Both presets spend the same bitrate budget and differ in how they split it across simulcast layers. The browser and capture surface decide which constraints are honoured.

### Screen audio

Screen audio is a separate source from your microphone, so you can talk while sharing a tab or game's sound. It is a toggle in the picker, on by default. Support depends on the engine:

| Engine | Screen audio |
| --- | --- |
| Chromium (Chrome, Edge, Brave, Electron) | tab audio everywhere; screen and window audio on Windows and ChromeOS |
| Firefox | no track returned |
| Safari / WebKit | none |

The share starts even when no audio track comes back, and the client tells you.

Viewers get two volume controls per person: their voice and their screen audio. Both are stored locally and restored on the next join.

## Watching a share

On an SFU, screen shares are not forwarded to everyone. The client connects with `autoSubscribe: false`, receives microphones and cameras, and subscribes to a share's video and audio only after you press **Watch**. One streamer costs forwards only for actual viewers.

Watching (`POST /_telium/v1/channels/{channel_id}/voice/watch`) records a watcher row and tells the SFU to subscribe. Each change publishes `VOICE_WATCHERS_UPDATE` with the channel's full watcher table. Stopping a share clears its watchers; leaving a call clears both your shares and your subscriptions.

Watch quality is one of `auto`, `low`, `medium` or `high`. `auto` lets adaptive streaming choose up to the top layer; a named value is a cap. The client focuses one remote share at a time, and switching focus unsubscribes the previous one. Watch never toggles a participant's camera or microphone subscription.

Calls in DMs and group chats have no watcher rows.

## Restarts

Media does not pass through the guild server, so a server restart interrupts the roster and not the call. On boot the server keeps existing voice states and gives each a deadline `voice.reconnect_grace_secs` ahead. A reconnecting device names its call and session id in `IDENTIFY`; a match clears the deadline and is echoed in `READY` as `voice_reclaimed`, with no announcement to the room. Unclaimed states leave through the normal disconnect path when the deadline passes. Watcher rows are kept the same way.

- A second restart inside the window keeps the original deadline.
- A restart longer than the window drops the seat, and the client joins again.

## Voice on profiles

Your guild voice channel can appear on your profile card for viewers who can see that channel. The viewer's client builds it from the guild's permission-filtered voice roster. It is never copied into account presence, friend presence or your home server. Losing access to a channel removes the cached voice state learned while you had access.

## Devices and platforms

Per-user volume is local and does not change anyone's server state. Electron desktop lets you pick microphone and output devices.

| Client | Notes |
| --- | --- |
| Browser | standard WebRTC; capture support depends on the browser and source |
| Electron desktop | Chromium's media stack; media permissions granted only to the Telium renderer; Linux capture goes through the PipeWire portal where available |
| Android (Tauri) | joins, talks and watches; screen-share **publishing** is not available because Android System WebView lacks `getDisplayMedia` |

## Configuration

```toml
[voice]
stun_servers = ["stun:stun.l.google.com:19302"]
mesh_max_participants = 4
max_bitrate = 2500000
max_streamers_per_channel = 4
reconnect_grace_secs = 15
default_region = "local"

[[voice.regions]]
name = "local"
sfu = "https://sfu.your-domain.example"
```

With no addressed `[[voice.regions]]`, every guild call is mesh. Do not leave a placeholder SFU URL: configured addresses are advertised to clients. For deploying the SFU and TURN, see [SFU](/docs/self-hosting/sfu/).

## Routes

```text
GET       /_telium/v1/channels/{channel_id}/voice
POST      /_telium/v1/channels/{channel_id}/voice/join
POST      /_telium/v1/channels/{channel_id}/voice/leave
POST      /_telium/v1/channels/{channel_id}/voice/state
POST      /_telium/v1/channels/{channel_id}/voice/token
POST      /_telium/v1/channels/{channel_id}/voice/stream
POST      /_telium/v1/channels/{channel_id}/voice/watch
POST      /_telium/v1/channels/{channel_id}/voice/signal
GET|POST  /_telium/v1/channels/{channel_id}/voice/e2ee
GET       /_telium/v1/channels/{channel_id}/voice/e2ee/commits?since=N
POST      /_telium/v1/channels/{channel_id}/voice/e2ee/refuse
POST      /_telium/v1/guilds/{guild_id}/voice/{user_id}
```

See the [API reference](/docs/reference/api/) for the rest.
