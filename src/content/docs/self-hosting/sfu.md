---
title: Voice relays (SFUs)
description: Decide whether you need an SFU, run one privately for your community, or opt in to sharing it with the network.
sidebar:
  order: 7
---

**You do not need to run an SFU to start a Telium homeserver.** With the default voice settings, guilds can use healthy relays from Telium's signed public directory when one is available. If no usable relay is available, small calls use peer-to-peer mesh (up to four participants by default).

An **SFU** is the server that forwards voice, video and screen-sharing media. You can run one yourself without donating it to strangers.

## Pick your setup

| What you want | Do this | Who uses your bandwidth? |
|---|---|---|
| **Just run a homeserver** | Keep the defaults; use the public relay directory | No calls are relayed by your box |
| **Reliable voice for your community** | [Run a private SFU](#run-a-private-sfu-for-your-community) and configure it as your server's region | Only homeservers you allow |
| **Help other communities too** | [Opt in to public hosting](#volunteer-a-public-relay) | Potentially other Telium communities |

:::tip
**Hosting an SFU is not consent to join the public network.** `trust.public = false` is the default. You do not have to put your relay in a directory, and running a homeserver does not require running a relay.
:::

## If you don't want to host a relay

**Do nothing.** The homeserver subscribes to the signed public relay directory by default. For each guild:

- **Automatic (default):** use the guild/server's configured SFU if one exists; otherwise pick a usable directory relay. If none is available, use mesh for small calls.
- **Fixed:** use only SFUs configured by the server or guild, not the directory.
- **Direct:** avoid the public directory. Configured private regions can still be used; otherwise calls use mesh.

Guild owners can change this under **Guild Settings → Voice / SFU**. Homeserver operators can disable the public-directory subscription entirely:

```toml
[voice.directory]
enabled = false
```

:::note
A public relay is operated by somebody else and may be full or offline. The directory is not a capacity guarantee. The SFU forwards encrypted call media, but its operator can still see connection metadata and uses their own bandwidth.
:::

## Run a private SFU for your community

**Recommended if your home server has a public IP, spare bandwidth and you want your own voice capacity.** Keep the SFU private unless you deliberately want to serve outsiders.

### Option A: You use the standalone Docker Compose installer

This is the shortest route if your homeserver and SFU will run on the same machine.

```sh
git clone https://github.com/telium-chat/telium.git
cd telium
sudo bash deploy/standalone/install.sh chat.example.com
```

When asked **"Carry voice calls from this box?"**, answer **yes**. The installer adds the SFU, connects the homeserver to it, and asks for two extra DNS names (for example `sfu.chat.example.com` and `livekit.chat.example.com`).

**The included SFU defaults to private.** Its `sfu.toml` trusts the homeserver you just installed; it does *not* accept arbitrary Telium servers. You do not need to submit it to a public list.

After installation, point all three DNS names at your machine, leave the SFU/LiveKit records **DNS-only** if you use Cloudflare, and open the [media ports](#network-requirements). Then [verify a call](#check-that-it-works).

Using an existing reverse proxy? The installer can use it instead of the bundled Caddy. The container cannot configure nginx or Certbot on the host: HTTPS for the two media hostnames is your reverse proxy's job.

See [Install with Compose](/self-hosting/install-docker/) for the rest of the homeserver steps.

### Option B: Native SFU, including a separate machine

On a Debian/Ubuntu host with a public IP, from a Telium checkout:

```sh
sudo bash sfu/install.sh
```

The installer sets up LiveKit, the SFU service and the admin dashboard, then prints a **one-time setup URL**. Follow it to choose your two hostnames and finish HTTPS setup.

1. Keep **private** mode (`trust.public = false`).
2. In the dashboard, open **Trusted servers** and add your homeserver's `server_name` (such as `chat.example.com`). The SFU discovers its signing key; you do not copy keys.
3. On the homeserver, add this to `telium.toml` and restart the server:

```toml
[voice]
enabled = true
default_region = "home"

[[voice.regions]]
name = "home"
sfu = "https://sfu.example.com"
```

Replace `sfu.example.com` with your SFU's HTTPS hostname. The `server_name` on the SFU's trust list must match the homeserver's real identity.

**Private means restricted admission, not LAN-only.** Clients outside your network still need to reach the SFU over HTTPS and its media ports.

### Network requirements

An SFU needs a publicly reachable address: HTTP-only tunnels (including Cloudflare Tunnel) cannot carry WebRTC UDP media. Your homeserver **can** remain behind a tunnel while its SFU lives on a separate public-IP host.

| Port | Protocol | Why |
|---|---|---|
| 443 | TCP | HTTPS control API and LiveKit WebSocket signaling (often via a reverse proxy) |
| 7881 | TCP | WebRTC media fallback |
| 3478 | UDP | LiveKit TURN |
| 50000–60000 | UDP | WebRTC media |

The SFU and LiveKit signaling typically use **two hostnames** over HTTPS. If you use Cloudflare DNS, do not orange-cloud the media hostnames. The current deployment uses the UDP range above; it is **not** a single-port UDP-mux setup.

## Check that it works

```sh
curl -fsS https://sfu.example.com/health
```

Look for `"ok":true`. Then open a guild voice channel from two accounts and check that the join response uses `mode: "sfu"`. Test actual microphone audio; a healthy HTTP endpoint alone does not prove the UDP path is open.

If you configured your own private region, calls should choose it instead of the public directory. **A configured region that becomes unavailable does not automatically fall back to directory relays**: small calls can fall back to mesh. Don't depend on public-relay failover as a backup for a private SFU unless you have separately tested and configured that behavior.

## Volunteer a public relay

There are **three separate choices**. They are not the same switch:

| Choice | What it means | Default |
|---|---|---|
| **Allow outside homeservers** | Set `[trust] public = true`. Any valid federated homeserver that knows the SFU URL can ask it to carry calls. | **Off** |
| **Appear on the public relay website** | Submit your relay to the [public registry](https://github.com/telium-chat/telium/blob/main/site/registry/README.md). Operators can discover and manually select it. | **Not listed** |
| **Be eligible for automatic directory routing** | In the registry entry, set `"feed": { "opt_in": true }`. The relay must also meet the directory's observed health, uptime and age requirements. | **Off** |

**Important:** Turning on `trust.public` allows strangers to use your relay **even when it is not listed** if they know its address. A website listing with feed opt-in disabled is discoverable and manually selectable, but does not enter the automatic selection feed.

For voluntary public hosting:

1. Set `[trust] public = true`, after confirming you can afford the traffic.
2. Set admission ceilings and a transfer budget in `sfu.toml`. The defaults of `0` mean **unlimited**, not a safe starter quota.
3. Check `/health`, audio, TLS and contact information.
4. Add an entry to [`site/registry/sfus.json`](https://github.com/telium-chat/telium/blob/main/site/registry/sfus.json) by pull request. Set `feed.opt_in` to `true` only if you also want eligible **automatic** traffic.

A relay can be useful to your own community indefinitely without any of these public steps.

### Example limits for a volunteer

Use limits sized to *your* bandwidth and billing, rather than copying arbitrary values. The relevant settings are:

```toml
[limits]
max_rooms = 10
max_participants = 30
transfer_budget_bytes = 100000000000
transfer_period_days = 30
```

These numbers are an **example**, not a recommendation for every host. The transfer budget is an estimate, not a billing provider's hard cap. Once admission is restricted, active calls are allowed to finish according to the relay's drain and admission rules.

## Advanced setup and troubleshooting

| Problem | What to check |
|---|---|
| `/health` reports `"ok":false` | LiveKit isn't healthy; inspect SFU/LiveKit service logs |
| `/session` returns 403 | A private SFU doesn't trust the homeserver; check its exact `server_name` and discovery |
| Connected, but no sound | UDP firewall/NAT, TCP fallback, TURN and microphone permission |
| Still using mesh | No usable region or directory relay; check voice settings and SFU health |
| SFU can't be reached behind a tunnel | Put media on a public-IP host; a tunnel can still front the homeserver |
| Relay receives unwanted traffic | Keep `trust.public = false`; remove unwanted public listings; set limits |

The [annotated SFU config](https://github.com/telium-chat/telium/blob/main/sfu/sfu.example.toml), [native deployment reference](https://github.com/telium-chat/telium/blob/main/sfu/README.md), and [relay directory rules](https://github.com/telium-chat/telium/blob/main/site/registry/README.md) cover key pinning, external LiveKit, proxy setup, TURN/TLS and more.

To understand why calls choose an SFU and how encryption works, see [Voice and video](/features/voice-and-video/).
