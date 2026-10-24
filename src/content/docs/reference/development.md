---
title: Development
description: Repository layout, how to build and test each component, and conventions for changes that cross boundaries.
sidebar:
  order: 4
---

The repository is a monorepo of separate builds, not one build graph. Build and test the component you change, plus any component on the other side of a boundary you touched.

## Layout

| Path | Stack | Purpose |
| --- | --- | --- |
| `server/` | Rust, Axum, SQLx, SQLite | Homeserver: identity, guild and media roles, federation |
| `web/` | React 19, Vite, Kumo, Tailwind | Shared client and browser build |
| `web/electron/` | Electron, Node | Desktop shell, native bridges, Rich Presence |
| `web/src-tauri/` | Rust, Tauri 2 | Android shell |
| `sfu/` | Rust, LiveKit | SFU front end and control plane (own Cargo workspace) |
| `telium-protocol/` | Rust library | Signing and protocol primitives shared by server and SFU |
| `sdk/bot/` | JavaScript | Bot SDK |
| `site/` | Astro | Public website and server registry |

Toolchains: Rust 1.85+ for the server, Bun for the web client and site.

## Homeserver

```sh
cd server
cargo run -- init     # writes telium.toml
cargo run -- serve
cargo test
```

Migrations live in `server/migrations/`. Never reuse a migration number that has landed. A migration makes the release impossible to roll back past (see [Upgrades](/docs/self-hosting/upgrades/)).

Wire-format changes (server-to-server requests, gateway frames, bundles, signed documents) follow [Compatibility](/docs/reference/compatibility/): adding a field is fine, removing or retyping one is not.

`server/telium.example.toml` is the annotated config reference. Document any new operator option there.

## Web client

```sh
cd web
bun install
bun run dev      # http://localhost:5173
bun run test     # Vitest
bun run build
```

:::caution
Use `bun run test`. A bare `bun test` runs Bun's own test runner and skips the Vitest config.
:::

The dev server proxies Telium paths to `TELIUM_ORIGIN` (default `http://localhost:8448`). Set it to reach another homeserver instead of hard-coding a URL.

Tests in `web/src/test/` run against a fake protocol server (`fake-server.js`) and fake WebRTC. For security-sensitive input handling, add focused unit tests at the validation boundary as well.

## Desktop

```sh
cd web
bun run desktop:install
bun run desktop:dev
bun run desktop:build:linux      # AppImage
bun run desktop:build:windows    # NSIS installer
```

Desktop is Electron. Tauri is used only for Android.

Keep the renderer locked down (`contextIsolation`, `sandbox`, `webSecurity` on). If a standard browser API is enough, keep the feature in shared code. If native help is needed, expose the narrowest preload method and validate its input in the main process. A feature that works under Vite may still fail in the packaged AppImage, so test packaged builds for anything that depends on packaging. See [`web/electron/README.md`](https://github.com/telium-chat/telium/blob/main/web/electron/README.md).

## Android

```sh
./build-android.sh                                      # debug APK
TELIUM_ANDROID_BUILD_TYPE=release ./build-android.sh    # release, unsigned
```

Requirements and options are on [Clients](/docs/start/clients/#build). Release signing uses a key kept off workstations. To exercise signing locally, make a throwaway key with `scripts/create-android-keystore.sh` and sign with `apksigner`.

Treat Android WebView as its own runtime. Keyboard insets, resume, Back, audio focus and native permissions do not behave like a desktop browser.

## SFU and protocol crate

```sh
cd sfu && cargo test
cd telium-protocol && cargo test
```

Changes to signed token semantics usually need matching changes and tests in `telium-protocol` and the server, since the shared crate exists to stop byte-level signing drift between them. Add to `telium-protocol` only what several Rust components must agree on exactly. See [`sfu/README.md`](https://github.com/telium-chat/telium/blob/main/sfu/README.md).

## Site

```sh
cd site
bun install
bun run build
bun run validate    # server registry validation
```

The site is static. Do not add trackers, remote fonts or third-party runtime requests.

## Releases

Each build has its own tag family:

| Tag | Builds | Publishes |
| --- | --- | --- |
| `server-v<version>` | Server image and native x86_64/aarch64 tarballs | GitHub release, `server-v<version>` and `server-latest` image tags, a `deploy/releases.json` entry |
| `desktop-v<version>` | Electron for Linux and Windows | GitHub release with both packages, the signed client manifest, updater metadata |
| `android-v<version>` | Tauri Android ARM64 | GitHub release, plus the rolling `android-latest` |

To cut a server release:

```sh
scripts/bump-server-version.sh 0.2.0
```

The script edits `server/Cargo.toml` and `Cargo.lock`, commits `Release server 0.2.0`, and prints the tag command. `--security`, `--breaking` and `--notes "..."` add trailers to the annotated tag. After the bump commit is on `main`:

```sh
git tag -a server-v0.2.0 -m "Telium Server 0.2.0"
git push origin server-v0.2.0
```

The release workflow refuses a tag whose commit is not on `main` or whose `server/Cargo.toml` version disagrees with the tag. Dispatch it with `dry_run` to test the build without publishing. Signing and publishing details are in [Updates](/docs/self-hosting/updates/) and [Supply chain](/docs/self-hosting/supply-chain/).

## Conventions by boundary

**Server and API.** Add authorization tests for new or changed routes. For server-to-server routes, cover replay, signature and error behavior.

**Federation.** Test local and remote cases, and test an unreachable peer and retries, not only two live servers. Keep origin, audience and signature checks intact.

**Client state.** Decide which kind each piece of state is: server-authoritative, synced preference, device-local preference, local security checkpoint or secret, or disposable cache. Unsent content, provider credentials and machine-local settings do not belong in account sync.

**User-visible text.** Follow [Translating](/docs/reference/translating/#adding-a-string).

**Native bridges.** Keep browser security on. Validate the calling frame and every URL, path, token, type and size. Do not expose generic fetch, filesystem or shell primitives.

**Crypto and identity.** Preserve domain separation and canonical encodings. Test rollback, replay and fork cases, not only success.
