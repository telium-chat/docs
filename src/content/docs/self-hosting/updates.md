---
title: Updates
description: How a Telium homeserver learns about new releases, how the container and native updaters install them, and how clients update.
sidebar:
  order: 10
---

This page covers the server's version check, the two box-side updaters in `deploy/`, how releases are numbered, and how clients find their own updates. The server never installs anything itself. An updater script, your config manager or a person does the installing.

## Server version check

The server reads a release manifest and reports how far behind it is in the startup log, the admin console and `GET /_telium/v1/admin/version`.

```toml
[updates]
check = true
manifest_url = "https://raw.githubusercontent.com/telium-chat/telium/main/deploy/releases.json"
check_interval_secs = 21600   # 6 hours
retry_secs = 1800
timeout_secs = 10
stale_after_days = 14         # warn
urgent_after_days = 45        # urgent
manifest_public_key = ""      # empty: signatures are not checked
manifest_signature_url = ""   # empty: <manifest_url>.sig
```

A missed release flagged `security`, or one that drops the protocol version you run, is urgent at once. A manifest that keeps failing to load turns from a notice into a warning after `stale_after_days`.

Set `manifest_public_key` to pin the release signing key. The server then rejects a manifest whose Ed25519 signature over `telium-release-manifest-v1 sha256=<hex>` does not verify. See [Supply chain](/self-hosting/supply-chain/).

### Deployment count

Separately, `[usage]` sends one POST a day to `count_url` (default `https://count.telium.chat/ping`) with a random server id and the number of active accounts:

```json
{ "id": "<random ULID>", "users": 42 }
```

Set `usage.report = false` to turn it off.

## Releases

A server release is a `server-v<major>.<minor>.<patch>` tag. Each one publishes a container image, static Linux binaries for x86_64 and aarch64, and an entry in `deploy/releases.json`, signed as `releases.json.sig`. A commit nobody tagged is not a release.

Updaters move to the highest version in the manifest, compared numerically, so `0.10.0` is newer than `0.9.0`. `server-latest` is a rolling image tag and GitHub release that always points at the highest version. Manifest artifact URLs point at the versioned release, so their bytes never change.

A manifest entry:

```json
{
  "version": "0.2.0",
  "commit": "<40 hex>",
  "released_at": 1792736525000,
  "security": false,
  "summary": "…",
  "image": "sha256:…",
  "protocol": 1,
  "min_protocol": 1,
  "artifacts": {
    "server-linux-x86_64":  { "url": "https://…/server-v0.2.0/telium-server-linux-x86_64.tar.gz",  "sha256": "…", "size": 13095324 },
    "server-linux-aarch64": { "url": "https://…/server-v0.2.0/telium-server-linux-aarch64.tar.gz", "sha256": "…", "size": 12148903 }
  }
}
```

Each release's notes say whether you can roll it back. A release that added a migration or changed the state format cannot be undone by running the old binary; see [Upgrades](/self-hosting/upgrades/).

## The two updaters

| | Container (`update.sh`) | Native (`update-native.sh`) |
|---|---|---|
| Runs from | `telium-update.timer`, every 60 s | `telium-update-native.timer`, 2 min after boot then every 5 min |
| Config | `/opt/telium/update.conf` | `/etc/telium/update.conf` |
| Trusts | the registry digest | the manifest's sha256, optionally signature-pinned through `[updates]` |
| Holds a release that | carries the image label `chat.telium.release.breaking=true` | has `breaking` in the manifest, or fails `telium-server check` with the new binary |
| Installs by | `docker compose up -d server` | `backup now`, atomic swap, `systemctl restart`, wait for the unit |
| Rolls back by | pinning the old image | restoring the backup it took |

Neither updater writes `telium.toml`. Both drop the release's `telium.example.toml` next to it so you can diff what a release added. Both stop and report when a release needs a person, and leave it pulled or staged.

### `update.conf`

| Key | Values |
|---|---|
| `TELIUM_UPDATES` | `automatic` (default) installs. `manual` fetches and reports, and waits for `--now`. |
| `TELIUM_PIN` | Empty, or what to hold at. Container: a full image reference or a `sha256:` digest, applied as a compose override (`compose.pin.yml`). Native: a release version such as `0.2.0`, or a commit. |
| `TELIUM_PIN_REASON` | Why the pin exists. A pin without one is still honoured but reported as an error on every run. |
| `TELIUM_UPDATE_WINDOW` | Empty, or `HH:MM-HH:MM` local time, which may wrap midnight. Restarts happen only inside it, security releases included. A malformed value is ignored with a warning. |
| `TELIUM_MANAGE_COMPOSE` | Container only. `yes` (default) lets the updater reconcile `compose.yml`. |
| `TELIUM_ARTIFACT` | Native only. Empty picks `server-linux-<uname -m>`; other architectures stop with an error. |
| `TELIUM_SERVER_BIN`, `TELIUM_CONFIG`, `TELIUM_UNIT`, `TELIUM_SERVICE_USER` | Native only. Defaults `/usr/local/bin/telium-server`, `/etc/telium/telium.toml`, `telium-server.service`, `telium`. |
| `TELIUM_MANIFEST_URL` | Native only. Overrides `[updates] manifest_url`. |

### Container updater

`deploy/install.sh` installs it (see [Install with Compose](/self-hosting/install-docker/)). `compose.yml` follows the `server-latest` tag. Each run pulls, stops if the digest did not move, reconciles `compose.yml`, then restarts the server.

A release can ship a new `compose.yml`. The updater keeps the last shipped copy in `/opt/telium/.baseline/` and compares three files:

| Situation | Result |
|---|---|
| The release did not change `compose.yml` | Nothing. |
| The release changed it and you never edited yours | Yours is replaced, and the log says so. |
| Both changed | Yours is left alone, the new file is written to `compose.yml.dist`, and a warning repeats on every run. The image is still deployed. |

After merging `compose.yml.dist` by hand:

```sh
/opt/telium/update.sh --config-resolved
```

Other commands:

```sh
/opt/telium/update.sh --status              # mode, pin, window, anything waiting
/opt/telium/update.sh --now                 # take a held or manual release
journalctl -u telium-update.service -n 50   # what each run did
```

On the container path `--now` does not bypass the update window. Old images are pruned after a week, so pin an older digest within that time for a quick rollback.

### Native updater

```sh
install -Dm755 deploy/update-native.sh /usr/local/sbin/telium-update-native
install -Dm644 deploy/telium-update-native.service /etc/systemd/system/telium-update-native.service
install -Dm644 deploy/telium-update-native.timer  /etc/systemd/system/telium-update-native.timer
systemctl daemon-reload && systemctl enable --now telium-update-native.timer
```

It asks the installed binary (`telium-server updates check`), so it reads the same `[updates]` manifest and pinned key as the server. Then it:

1. downloads the artifact and checks its sha256 and that the binary names the expected commit;
2. runs the staged binary's `check` against your live config;
3. holds for a breaking release, manual mode or the window (`--now` overrides all three);
4. runs `backup now` as the service user and refuses to continue if no archive was written;
5. copies the old binary to `<bin>.previous`, renames the new one into place, restarts the unit and waits up to 30 s for it.

It refuses to move backwards, even when pinned, because an older binary cannot open a migrated database. If the unit does not come back, it leaves the new binary installed and prints the restore command. Read `journalctl -u telium-server` before putting `<bin>.previous` back: if the release migrated the database, the old binary will refuse it and you need `telium-server restore latest --yes` instead.

`update-native.sh --status` and `--now` behave like the container versions.

## Clients

Clients ask their publisher for updates, never a homeserver. The update URL and the public key are compiled in from `VITE_TELIUM_UPDATE_URL` and `VITE_TELIUM_UPDATE_PUBLIC_KEY`. A build without both makes no update request. Configured clients check at startup and every 6 hours.

The settings footer shows the publisher state:

| State | Meaning |
|---|---|
| `configured` | URL and key set. |
| `unkeyed` | Only one of them set. A build mistake; such a build is never offered an install. |
| `unconfigured` | Neither set. Normal for development builds and the web bundle a homeserver serves. |

| Runtime | Delivery | Banner action |
|---|---|---|
| Electron desktop | `install` | Download, check SHA-256, install and restart |
| Browser | `reload` | Reload |
| Android | `store` | Link to the release page |
| Tauri desktop, distro package, self-built | `package` | Update it the way you installed it |

A homeserver can only refuse a client, with gateway close code `4015` (`PROTOCOL_INCOMPATIBLE`), which shows an urgent banner. See [Compatibility](/reference/compatibility/).

Dismissing the banner snoozes it for 3 days for an ordinary release, 8 hours when a missed release is security-relevant, and 1 hour after a `4015`. A staged update shows a Restart banner that cannot be dismissed.

The changelog button in the rail fetches `CHANGELOG.md` from the repository (unsigned, display only) at most every 6 hours. `VITE_TELIUM_CHANGELOG_URL` changes where it fetches from.

### Client manifest

The update URL serves `client-releases.json` with `client-releases.json.sig` beside it. It keeps the last 8 releases.

```json
{
  "kind": "telium.client_releases",
  "version": 1,
  "channel": "stable",
  "generated_at": 0,
  "releases": [{
    "version": "0.4.0",
    "released_at": 0,
    "security": true,
    "summary": "…",
    "page": "https://…",
    "artifacts": {
      "desktop-linux-x86_64-appimage": { "url": "https://…", "sha256": "<64 hex>", "size": 0 }
    }
  }]
}
```

Artifact keys are `desktop-linux-<arch>-appimage`, `desktop-windows-x86_64`, `desktop-tauri-<os>-<arch>` and `android-apk`. The signature is Ed25519 over `telium-client-manifest-v1 sha256=<hex>`. The same key signs the server manifest under a different prefix, so one signature cannot pass as the other.

### Publishing for a fork

1. Generate a key with `node scripts/sign-release-manifest.mjs keygen` and keep the seed in a secret store.
2. Pick an HTTPS location for `client-releases.json` and its `.sig`.
3. Build the clients with `VITE_TELIUM_UPDATE_URL` and `VITE_TELIUM_UPDATE_PUBLIC_KEY` set. Clients built earlier never check.
4. Build, sign and verify the manifest:

   ```sh
   node scripts/sign-client-manifest.mjs build --out client-releases.json --version 0.4.0 \
     --previous ./previous-client-releases.json \
     --artifact desktop-linux-x86_64-appimage=./Telium_x86_64.AppImage=https://downloads.example/desktop-v0.4.0/Telium_x86_64.AppImage
   node scripts/sign-client-manifest.mjs sign client-releases.json
   node scripts/sign-client-manifest.mjs verify client-releases.json client-releases.json.sig "$TELIUM_RELEASE_PUBLIC_KEY"
   ```

   `sign` reads `TELIUM_RELEASE_SIGNING_KEY`, `TELIUM_RELEASE_PUBLIC_KEY` and `TELIUM_RELEASE_KEY_ID` from the environment. Add `--security` to `build` when the release fixes a security problem.
5. Publish the manifest, signature and artifacts somewhere readable without signing in. A private GitHub repository makes every check and download fail.
6. Check the settings footer of a fresh build reports `configured`.
