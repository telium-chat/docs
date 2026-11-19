---
title: Install with Compose
description: One compose.yml and a .env template with two required lines, from nothing to a homeserver that keeps itself up to date.
sidebar:
  order: 3
---

The whole homeserver is one `compose.yml`. There is no installer, no script on the host and no systemd timer. The file runs the server and an updater container that keeps it current. Your reverse proxy points at `127.0.0.1:8448`, the same as with a [native install](/self-hosting/install-systemd/). By the end of this page you have a server answering on your domain, automatic updates on, and your account as its administrator.

**This creates a Telium homeserver.** If you only want to run a public voice relay in Docker, use the [standalone SFU Docker installer](/self-hosting/sfu-docker/) instead; it needs no homeserver.

:::tip[Already have a website on your domain?]
You can keep your existing website at `example.com` (on any hosting provider), run Telium at `chat.example.com`, and have user IDs like `@you:example.com`. Before anyone registers, follow [Using your website domain for accounts](#using-your-website-domain-for-accounts).
:::

## What you need

- A Linux box with Docker Engine and the Compose plugin (`docker compose version` prints v2.20 or newer)
- A public hostname for the Telium HTTPS endpoint (for example, `chat.example.com`). Your account domain may stay on a separate website host.
- A reverse proxy for HTTPS: one already on the host (Caddy, nginx, Traefik, a tunnel), or the Caddy container this file can run for you (see [Put HTTPS in front](#put-https-in-front))

## Quick install

From an empty directory, for example `~/telium`, download the Compose file and the settings template. The template is saved as `.env`:

```sh
curl -fsSLO https://raw.githubusercontent.com/telium-chat/telium/main/deploy/compose/compose.yml
curl -fsSLo .env https://raw.githubusercontent.com/telium-chat/telium/main/deploy/compose/.env.example
```

**Before starting anything, open `.env` in any editor and fill in the two required lines at the top.** They ship empty, and Compose refuses to start until both have a value:

```sh
# The hostname clients connect to, through your reverse proxy,
# for example: TELIUM_DOMAIN=chat.example.com
TELIUM_DOMAIN=chat.example.com

# Who may sign up: closed (only people with a registration code) or open.
TELIUM_REGISTRATION=closed
```

:::caution[Decide the account domain now]
The first start sets the server's identity. `TELIUM_DOMAIN` (or `TELIUM_SERVER_NAME`, if you use [your website domain for accounts](#using-your-website-domain-for-accounts)) becomes part of every account ID, and it cannot change once accounts exist. The storage suggestions are also worked out on the first start. Everything else can be changed later in the same `.env`.
:::

Then start it:

```sh
docker compose up -d
```

**On a closed server you need a code to sign up, including for your own account.** Get the one-time setup code from the box once the server is running. [Create your account](#create-your-account-and-make-it-the-admin) has the full steps:

```sh
docker compose exec server telium-server registration-code bootstrap
```

Every other setting in the template is commented out and described above its line; uncomment one to change it, now or later. `.env` stays the place for settings: the server rebuilds its `telium.toml` from it on every start, so you never edit `telium.toml` itself (see [Changing settings](#changing-settings-and-running-server-commands)). They are the same settings as the tables below. Put comments on their own lines: in a `.env` file, text after a value becomes part of the value. If you would rather keep everything in one file, write the values into `compose.yml` in place of its `${…}` defaults instead.

If either required line is missing, Compose stops with a message naming it.

That starts two containers:

| Container | Does |
|---|---|
| `server` | The homeserver, listening on `127.0.0.1:8448` only. It writes its `telium.toml` from your settings on every start. |
| `updater` | Checks for a new release every minute and restarts whatever moved, with a five-minute warning to connected users. Updates are on by default. |

:::note[Checking the file before running it]
[`compose.yml`](https://github.com/telium-chat/telium/blob/main/deploy/compose/compose.yml) has comments throughout, and you can read all of it before starting anything. It uses only the Telium images, the official `docker:cli` image for the updater and, if you turn it on, `caddy:2`.
:::

**Keep your settings in `.env` (or in `compose.yml` itself), not only in your shell.** The updater re-reads both files when it recreates the server, so a variable you only `export`ed would disappear at the first update.

### Storage and backup settings

The native installer asks about uploads and backups. Here those answers are the optional lines in `.env`, with the same names. Leave a line commented out to accept the suggestion.

| Setting | Suggestion | What it is |
|---|---|---|
| `TELIUM_MEDIA_POLICY` | `quota` | Upload policy: `quota`, `enabled` or `disabled` |
| `TELIUM_MEDIA_QUOTA` | `1GiB` | Per-account upload allowance |
| `TELIUM_MEDIA_FILE_MAX` | `50MiB` | Largest single file |
| `TELIUM_MEDIA_TOTAL` | ¾ of the data disk | Server-wide media limit (`0` = no limit) |
| `TELIUM_MEDIA_FREE_RESERVE` | ⅒ of the data disk | Free space uploads must leave |
| `TELIUM_MEDIA_RETENTION_DAYS` | `30` open, `0` closed | Delete attachments after this many days (`0` = never) |
| `TELIUM_BACKUP_MEDIA` | `no` open, `yes` closed | Whether backups include attachments |
| `TELIUM_BACKUP_INTERVAL` | `6h` | How often to back up (`6h`, `12h`, `1d`) |
| `TELIUM_BACKUP_KEEP` | `2` | How many backups to keep |
| `TELIUM_BACKUP_FREE_RESERVE` | ⅒ of the backup disk | Skip a backup that would leave less than this free |

The disk suggestions use the same proportions as the native installer, measured from the size of the disk that holds Docker's volumes. Open and closed registration start from different retention and backup suggestions, for the reasons on the [native page](/self-hosting/install-systemd/#storage-and-backup-questions). Like the installer's answers, the suggestions are worked out on the first start and then kept, so opening a closed server later does not start deleting its old attachments. To change one later, set its line in `.env`. If backups leave attachments out, those files cannot be restored after a disk failure; read [choosing what media to back up](/self-hosting/backups/#choosing-what-media-to-back-up). Either way, these archives are on the same machine: save the backup key elsewhere and set up [an off-site destination](/self-hosting/backups/#copying-archives-off-the-machine).

An invalid value stops the server at start, and `docker compose logs server` says which one.

## Put HTTPS in front

### A reverse proxy on the host

Point it at `http://127.0.0.1:8448`, exactly as for a native install. [Exposing your server](/self-hosting/exposing/) has Caddy, nginx and Cloudflare Tunnel instructions, and the shipped [`deploy/reverse-proxy/`](https://github.com/telium-chat/telium/tree/main/deploy/reverse-proxy) configs work unchanged.

You do **not** need to edit `rate_limit.trusted_proxies`. A proxy on the host reaches the container through the Compose network's gateway, `172.31.241.1`, and the file already trusts that address. On a native install the same setting is `127.0.0.1`; behind Docker it is the gateway. The network uses the fixed subnet `172.31.241.0/28` so that this address never changes. If the subnet clashes with something on your box, see [Troubleshooting](#troubleshooting).

Port `8448` already taken on the host? Set `TELIUM_PORT=8449` in `.env` and point the proxy there.

### No proxy yet: the bundled Caddy

Add these to `.env` and run `docker compose up -d` again:

```sh
COMPOSE_PROFILES=proxy
ACME_EMAIL=you@example.com
```

Caddy publishes ports 80 and 443 and gets its certificate as soon as DNS points at the box. Don't turn this on while another proxy already uses those ports.

## Verify

On the box:

```sh
curl -fsS http://127.0.0.1:8448/_telium/v1/health
docker compose ps
```

Both containers should be `running`. Then, from another machine, so that DNS and TLS are tested too:

```sh
curl -fsS https://chat.example.com/.well-known/telium/server
curl -fsS https://chat.example.com/_telium/v1/capabilities
```

## Create your account and make it the admin

Signing up first does not make anyone a server administrator, because on an open server a stranger could beat you to it. You sign up, then grant your own account admin from the box. Run these from the directory holding `compose.yml`.

1. **Closed registration only:** get the one-time setup code. Running it again is safe and says whether the code was already used:

   ```sh
   docker compose exec server telium-server registration-code bootstrap
   ```

2. Open [telium.chat](https://telium.chat), choose your server, and sign up (with the code, if your server is closed).
3. Make that account the administrator, replacing `USERNAME` with the name you signed up with:

   ```sh
   docker compose exec server telium-server admin recover USERNAME --reason "Initial server owner"
   ```

   Double-check the username first, then sign in to that account.

You can make more registration codes later in the admin area under **Registration codes**, or with `docker compose exec server telium-server registration-code create`. To open or close sign-ups later, change `TELIUM_REGISTRATION` in `.env` and run `docker compose up -d`.

Voice calls work out of the box through Telium's shared relays. Running your own is optional: see [Voice calls on your own SFU](#voice-calls-on-your-own-sfu).

## Updates

The `updater` container keeps the server current by itself. Every minute it pulls the images this project runs. When one has moved, it shows connected users a restart notice, waits five minutes, and recreates only what changed. If a release is marked as needing a person, it is pulled but waits for you. The update logic is read from the server image, so each release brings its own updater with it.

```sh
docker compose exec updater telium-update --status   # mode, pin, window, anything waiting
docker compose exec updater telium-update --now      # take a held release now, no notice
docker compose logs updater                          # what it has done
```

Its settings are `.env` lines too. They are the same fields as every other Telium updater; [Updates](/self-hosting/updates/) explains them in full.

| Setting | Default | Meaning |
|---|---|---|
| `TELIUM_UPDATES` | `automatic` | `manual` stops all updates; the container keeps running and changes nothing |
| `TELIUM_PIN` | empty | Hold the server at an exact image (`ghcr.io/telium-chat/telium:server-v0.2.0`) or a `sha256:` digest |
| `TELIUM_PIN_REASON` | empty | Why; a pin without one is reported on every run |
| `TELIUM_UPDATE_WINDOW` | empty | `HH:MM-HH:MM` **in UTC**; restarts only happen inside it |
| `TELIUM_RESTART_NOTICE_SECS` | `300` | Warning given to users before a restart |

After changing one, apply it with `docker compose up -d`.

:::caution[The updater can control Docker]
The updater has the Docker socket mounted, which is root-equivalent on the host. That is what lets it restart containers. It has no network of its own and mounts your directory read-only. With rootless Docker, set `DOCKER_SOCKET` in `.env` to your socket's full path, for example `/run/user/1000/docker.sock`.
:::

To update by hand instead (with `TELIUM_UPDATES=manual`), run `docker compose pull && docker compose up -d`. Compose then replaces the server without warning connected users first.

## Changing settings and running server commands

There is no `telium.toml` to edit on the host. The server's whole configuration is the `TELIUM_CONFIG` block in `compose.yml`, filled in from `.env`. Edit either one, then:

```sh
docker compose up -d
```

Compose recreates the server when its configuration changed and leaves it alone otherwise. You can add any key from [`telium.example.toml`](https://github.com/telium-chat/telium/blob/main/server/telium.example.toml) to that block, for example [`[backup.remote]`](/self-hosting/backups/#buckets) or [S3 media storage](/self-hosting/s3-media-storage/). Secrets such as S3 keys belong in `.env` and the server's `environment:` list, not in the block; see [Secrets](/self-hosting/secrets/). Inside the block, write the server's own references with a doubled `$`, as `"$${env:NAME}"` or `"$${file:/path}"`. With a single `$`, Compose reads `${…}` as its own variable and refuses to start.

Server commands run inside the container, which already knows where its config is:

```sh
docker compose exec server telium-server check
docker compose exec server telium-server backup list
docker compose exec server telium-server backup drill
```

Inside the container the generated file is `/var/lib/telium/telium.toml`. It is rewritten on every start, so edits to it are lost.

## Voice calls on your own SFU

Group calls already work through Telium's shared relays. To run your own [SFU](/self-hosting/sfu/) on this box instead:

1. Add to `.env`:

   ```sh
   COMPOSE_PROFILES=voice            # proxy,voice with the bundled Caddy
   TELIUM_SFU_DOMAIN=sfu.chat.example.com
   TELIUM_LIVEKIT_DOMAIN=livekit.chat.example.com
   ```

2. In `compose.yml`, uncomment the `[voice]` lines at the end of `TELIUM_CONFIG`.
3. Point DNS for both names at the box. On Cloudflare they must be **DNS-only**: media cannot go through the proxy.
4. Front them. The bundled Caddy does this automatically. With your own proxy, send `sfu.…` to `http://127.0.0.1:7890` (and its `/admin` path to `127.0.0.1:7891`), and `livekit.…` to `http://127.0.0.1:7880` with WebSocket upgrades allowed.
5. Open TCP 7881, UDP 3478 and UDP 50000–60000 in the firewall, then run `docker compose up -d`.

To find the dashboard's first-run URL, run `docker compose logs sfu | grep FIRST-RUN`. The updater keeps the SFU current along with the server.

## Using your website domain for accounts

Want your website at `example.com` (on any hosting provider), but your Telium server at `chat.example.com`? Your account addresses can still be `@you:example.com`.

1. **Before registering any accounts**, add the account domain to `.env`, leaving `TELIUM_DOMAIN` as the chat hostname:

   ```sh
   TELIUM_DOMAIN=chat.example.com
   TELIUM_SERVER_NAME=example.com
   ```

   Then run `docker compose up -d`.

2. Set up DNS and HTTPS so that **`chat.example.com`** reaches this box. Keep **`example.com`** pointed at your website host.
3. Check `https://chat.example.com/.well-known/telium/server`: it should announce `server_name` `example.com`.
4. Put a one-line **`telium.txt`** file on your website with `chat.example.com` inside it, so clients entering `example.com` can find the server. Follow the [website-domain setup guide](/self-hosting/domain-delegation/).

**Do not change `TELIUM_SERVER_NAME` on an established server.** It is part of every account ID. [Why the account domain matters](/self-hosting/domain-delegation/#how-it-works).

## Storage

Everything lives in Docker named volumes, prefixed with the project name `telium`:

| Volume | Holds | Notes |
|---|---|---|
| `telium_telium-data` | database, media, keys, cold archive | The data. |
| `telium_telium-backups` | archives, backup key | Separate from the data, but still on this machine. |
| `telium_sfu-state` | SFU keys | Voice profile only. |
| `telium_caddy-data` | certificates | Proxy profile only. |
| `telium_updater-state` | held releases, pin override | Safe to lose. |

**`docker compose down -v` deletes every one of them, data included.** Plain `docker compose down` keeps them.

Once the server has created the backup key, copy it out of the container, then move it somewhere safe that is not this machine:

```sh
docker compose cp server:/var/backups/telium/backup.key ./telium-backup.key
```

See [Backups](/self-hosting/backups/) for what the archives protect against and how to restore. To keep uploads off the VPS disk, see [Store uploads in S3-compatible storage](/self-hosting/s3-media-storage/).

## Installed with the old installer?

Boxes set up with `deploy/standalone/install.sh` (everything in `/opt/telium`, updated by `telium-update.timer`) keep working as they are, and their updater keeps running. You don't need to move. If you want to, move the data with a [backup and restore](/self-hosting/backups/) rather than by renaming volumes.

## Troubleshooting

| Symptom | Check |
|---|---|
| `required variable TELIUM_… is missing a value` | `.env` is missing that line, or is not in the same directory as `compose.yml` |
| The server restarts in a loop | `docker compose logs server`: an invalid storage value, or `telium-server check` found a dangerous setting |
| `Pool overlaps with other one on this address space` | Another network already uses `172.31.241.0/28`. Change the `subnet` and every `ipv4_address` in `compose.yml`, then set the new gateway in `.env`, quoted like this: `TELIUM_TRUSTED_PROXIES='"172.31.242.1"'` |
| Every user shares one rate limit | Your proxy reaches the server some other way than the published port, for example from another Docker network. Put its address in `TELIUM_TRUSTED_PROXIES` |
| Clients cannot connect | `public_base_url`, HTTPS, and WebSocket forwarding — see [Exposing your server](/self-hosting/exposing/) |
| Nothing updates | `docker compose exec updater telium-update --status`, then `docker compose logs updater` |
| Port 80 or 443 already in use | The `proxy` profile is on while another proxy runs on the box; take `proxy` out of `COMPOSE_PROFILES` |
| Calls connect but carry no audio | Your SFU's media ports (TCP 7881, UDP 3478, UDP 50000–60000) are firewalled, or its names are Cloudflare-proxied |
