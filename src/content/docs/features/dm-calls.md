---
title: DM calls
description: Calls in direct messages and group chats, call privacy settings, and how media stays end-to-end encrypted through an SFU.
sidebar:
  order: 6
---

This page covers calls in direct messages and group chats: the three call privacy settings, how a call picks mesh or SFU, where the SFU comes from, and what each server can see. Guild voice channels are covered in [Voice and video](/features/voice-and-video/).

## Call privacy

Set your default in **Settings -> Calls & audio -> Call privacy**, with per-conversation overrides below it. The setting lives in your client sync store; servers never learn it.

| Setting | Media path | Who learns your IP address |
| --- | --- | --- |
| **Direct** | peer to peer mesh (host and STUN candidates) | every other participant |
| **Relay only** | the same mesh, every connection forced through **your own home's** TURN server | your home's TURN operator, no participant |
| **Through an SFU** | one SFU, media end-to-end encrypted with a key the SFU never holds | the SFU operator, no participant |

Order of strictness is Direct, Relay only, Through an SFU. Two rules hold:

- **Your client enforces your setting.** A Relay-only client uses `iceTransportPolicy: "relay"` from the first offer, whatever any peer or server says. If it has no TURN and no SFU is offered, it refuses to connect.
- **The strictest setting in the call wins.** Clients share their settings in small *hellos* encrypted under a key derived from the conversation's MLS group. Servers carry hellos but cannot read them. A participant whose hello has not arrived or cannot be opened counts as Relay only.

Relay mode hides your address from participants, not your identity from the relay: the TURN username is `{expiry}:{user_id}`. The configured STUN server (Google's by default) sees your address under Direct.

### Settings changing mid-call

- **A Relay-only participant joins a direct mesh.** Existing clients that have TURN switch their live connections to relay-only and restart ICE, without hanging up. Clients without TURN keep their paths; the strict participant is still behind their own relay. When that participant leaves, clients relax on the next ICE restart.
- **Someone needs an SFU.** A client sets a single `wants_sfu` bit on its join when it has posture "Through an SFU", or "Relay only" with no TURN at home. The conversation's sequencer switches the call to SFU and sends `VOICE_SERVER_UPDATE`.
- **Scale-up.** Each client starts an SFU session alongside the running mesh, swaps over once it connects, and then closes the mesh. Nobody redials.

## Mesh or SFU

The conversation's sequencer (the home server that orders the conversation) decides the topology. It sees the roster and the `wants_sfu` bits, never anyone's setting.

1. The call uses an **SFU** if one is available and either the roster exceeds `voice.mesh_max_participants` (default 4) or anyone sent `wants_sfu`.
2. Otherwise it is **mesh**.
3. A join that would push a mesh past the cap with no SFU anywhere is refused: larger calls need an SFU configured.
4. Once on an SFU, the call stays there until it empties.

A sequencer that lies can make a call stricter or unavailable. It cannot make your connection more exposed, because your client enforces your setting.

## Where the SFU comes from

The sequencer picks, in order:

1. **A custom SFU set on the conversation.** Any member can set one. The URL is stored only in the MLS group state, so no server learns it. It must be a `telium-sfu`, or anything that accepts the same signed join token and returns a LiveKit URL and token from `POST /session`, and it must trust the sequencer's origin.
2. **The sequencer's own SFU regions.**
3. **The first participant home, in domain order, that has regions.**

The server hosting the SFU mints all tokens for the call. Other homes request them over signed federation (`POST /_telium/v1/dm/voice/token`), and the host checks the request comes from the user's own home and that the user is a member. Tokens carry `room_kind: "conversation"` and `e2ee: true`, and grant speak, video and stream (no priority). See [SFU](/self-hosting/sfu/) for running one.

## Encryption through the SFU

An SFU conversation call is always end-to-end encrypted with LiveKit's per-frame AES-GCM transform.

- The media key is exported from the conversation's MLS group for the current epoch, in key slot `epoch mod 16`.
- On an epoch change, clients install the new key for decryption at once and start sending under it 2 seconds later, so everyone has it before frames arrive.
- A member removed from the conversation cannot decrypt media sent after the rekey, even with an SFU token that is still valid (tokens last two minutes).
- Decryption failures are reported only after they persist for four seconds for the same participant.

A client that cannot do this refuses to join an SFU call instead of joining in the clear. That covers browsers without `RTCRtpScriptTransform` or encoded insertable streams, devices not in the MLS group, and WebKitGTK (GNOME Web, Tauri's Linux webview), whose transform is a stub. The packaged Linux desktop app is Electron and is unaffected. Mesh calls are already DTLS-SRTP between peers, with signalling sealed under the conversation's group.

## Restarts

A call survives a home server restart because media never passes through it. The sequencer keeps a row for every participant, including those homed elsewhere. When the grace window ends, it asks each remote participant's home whether that device is still live (`/_telium/v1/dm/voice`, `op: "held"`). Anything other than yes drops the seat. See [Voice and video](/features/voice-and-video/#restarts) for the shared mechanism.

## What each server learns

| Server | Learns |
| --- | --- |
| Your home | that you are in a call, whether you asked for an SFU, and your IP from its TURN server if you relay |
| The sequencer | the roster, `wants_sfu` bits, mesh or SFU, and which server hosts. Never a setting or a custom SFU URL |
| The SFU host | who joined and from which IP, and each frame's unencrypted header. Never media content |
| A TURN server | the IP of whoever relays through it and the far end's candidate address |

## Limits

- **The SFU sees traffic shape.** Who is speaking, packet sizes and timing remain visible.
- **Frame headers are not encrypted.** LiveKit leaves the first byte of each Opus frame (its configuration: bandwidth, frame duration, mono or stereo) and the first bytes of each video frame (keyframe flag, and dimensions on a VP8 keyframe) in the clear. This is fixed in livekit-client and cannot be configured.
- **A custom SFU gets no control commands.** Server-side kicks reach only SFUs run by the Telium server that minted the token. Removal from a custom-SFU call relies on the two-minute token and the MLS rekey.
- **Hellos are authenticated to the group, not to a device.** A member could forge another member's hello. A forged stricter hello makes the call stricter; a forged laxer one cannot expose the impersonated person, whose own client still enforces their setting.
- **Relay only with no TURN and no SFU cannot join.** The client says why and offers two fixes: set a custom SFU on the conversation, or lower the setting for that conversation.

## Operator configuration

Relay only needs a TURN server on the participant's own home. Both keys are required; setting one alone does nothing (the server warns at startup).

```toml
[voice]
stun_servers = ["stun:stun.l.google.com:19302"]
mesh_max_participants = 4
turn = "turn.example.com:3478"
turn_secret = "shared secret, matching coturn's static-auth-secret"
turn_ttl_secs = 3600
```

TURN must be reachable on UDP from the public internet, so it cannot sit behind an HTTP-only ingress such as a Cloudflare Tunnel. `TELIUM_TURN_SECRET` overrides `turn_secret`; see [Secrets](/self-hosting/secrets/).

:::caution
On a server with neither TURN nor an SFU, the Relay only setting is unusable: those users' clients refuse calls rather than expose their address.
:::

## Routes

```text
GET   /_telium/v1/conversations/{id}/voice
POST  /_telium/v1/conversations/{id}/voice/join
POST  /_telium/v1/conversations/{id}/voice/leave
POST  /_telium/v1/conversations/{id}/voice/state
POST  /_telium/v1/conversations/{id}/voice/signal
POST  /_telium/v1/conversations/{id}/voice/server
```

Server to server: `POST /_telium/v1/dm/voice`, `/_telium/v1/dm/voice/notify` and `/_telium/v1/dm/voice/token`.
