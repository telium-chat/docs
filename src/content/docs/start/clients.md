---
title: Clients
description: The Telium browser, desktop and Android clients, how to get or build each one, and how they differ — plus Rhein, a custom third-party client for Linux.
sidebar:
  order: 3
---

Telium has one React client that runs in three shells. The protocol, state and UI code under `web/src/` is shared, so permissions and features come from the server, not the platform.

[Rhein](https://github.com/alpwrk/rhein) is a custom third-party client, built and maintained outside this project. It is listed below for completeness; it is not part of Telium and is not covered by Telium's releases or support.

| Runtime | Shell | Package |
| --- | --- | --- |
| Web | Any modern browser | Hosted at [telium.chat](https://telium.chat), or a build served by your homeserver from `web/dist` |
| Linux desktop | Electron | AppImage, x86_64 |
| Windows desktop | Electron | NSIS installer, x64 |
| Android | Tauri 2 | APK, ARM64 |
| Linux (native) | Rust + GPUI | Third-party: [Rhein](https://github.com/alpwrk/rhein) |

## Downloads

Prebuilt packages are attached to GitHub releases:

| Platform | File |
| --- | --- |
| Windows | [`Telium_Setup_x64.exe`](https://github.com/telium-chat/telium/releases/download/desktop-latest/Telium_Setup_x64.exe) |
| Linux | [`Telium_x86_64.AppImage`](https://github.com/telium-chat/telium/releases/download/desktop-latest/Telium_x86_64.AppImage) |
| Android | [`Telium_arm64.apk`](https://github.com/telium-chat/telium/releases/download/android-latest/Telium_arm64.apk) |

Desktop releases are tagged `desktop-v<version>` and ship with a signed client manifest and updater metadata. Android releases are tagged `android-v<version>`. See [Updates](/self-hosting/updates/).

## Browser

The web client is hosted at [telium.chat](https://telium.chat). It works with every Telium server: open it and sign in with your address (`@alice:your-server.example`). There is nothing to install, updates land without action on your side, and it is built from the same shared `web/src/` code as the desktop and Android shells. No server has to serve a web client for this to work.

### Self-hosted or development

You can also run the client yourself — to keep off Telium's hosting entirely, or to develop it.

Development, from `web/`:

```sh
bun install
bun run dev      # http://localhost:5173, proxies to TELIUM_ORIGIN (default http://localhost:8448)
```

Production:

```sh
bun run build    # writes web/dist
```

Point `[web] dir` at `web/dist` and the homeserver serves the client after its API and discovery routes, or host the build anywhere else and name it with `[web] client_url`. Both keys are optional; see [Web client](/self-hosting/configuration/#web-client).

The web build includes a service worker that precaches assets and supports Web Push where the browser offers it. Allowing notifications and enabling background push are separate choices. See [Notifications](/features/notifications/).

:::caution
A web origin is executable code. If the server that hands you the client is malicious, its JavaScript can read anything the page can. For a threat model that distrusts your home server, use a packaged client or a web origin you trust independently of it — telium.chat is one for a self-hosted server.
:::

## Desktop (Electron)

From `web/`:

```sh
bun install
bun run desktop:install
bun run desktop:dev
bun run desktop:build:linux      # AppImage
bun run desktop:build:windows    # NSIS installer
```

Output goes to `web/dist-electron/`.

The renderer runs with `contextIsolation`, `sandbox` and `webSecurity` on and `nodeIntegration` off. Native features go through narrow preload methods that the main process validates: opening external links, native notifications, window focus events, and [Rich Presence](/features/rich-presence/) (game and media activity via arRPC and MPRIS on Linux, and a media helper on Windows).

Microphone, camera, WebRTC and screen capture stay in Chromium, so desktop calls use the same media code as the browser. On Linux, screen sharing goes through the system picker (PipeWire portals where available).

## Android (Tauri 2)

The Android shell lives in `web/src-tauri/`. It bridges system insets, the software keyboard, Back navigation, app resume (so gateway connections wake promptly), share intents, file pickers, and audio focus and routing for calls.

Screen sharing is not available on Android.

### Build

Requirements: Java 17, the Android SDK and platform tools, the Android NDK, and a Rust toolchain with the `aarch64-linux-android` target. A distro-packaged Rust usually lacks the target and fails with "can't find file for `std`".

From the repository root:

```sh
./build-android.sh                                      # debug, signed with the SDK debug key
TELIUM_ANDROID_BUILD_TYPE=release ./build-android.sh    # release, unsigned
```

The script finds a standard `~/Android/Sdk`, checks the toolchain, installs web dependencies and prints the APK path and SHA-256. `TELIUM_APP_VERSION=<version>` stamps a version into the APK, and `TELIUM_APK_OUT=<path>` copies the result to a chosen filename.

Or from `web/`:

```sh
bun run tauri:android:dev
bun run tauri:android:build          # release APK
bun run tauri:android:build:debug    # debug APK
```

APKs land under `web/src-tauri/gen/android/app/build/outputs/apk/`.

## Rhein (third-party)

[Rhein](https://github.com/alpwrk/rhein) is a custom, third-party Telium client for Linux, built and maintained independently by [@alpwrk](https://github.com/alpwrk). It is not part of the Telium project. It is a native desktop app written in Rust with GPUI, covering chat, encrypted direct messages, and voice and video calls.

Rhein connects to Telium homeservers like any other client, but it ships from its [own repository](https://github.com/alpwrk/rhein) and [website](https://rheinium.cc) on its own schedule. Questions, issues and contributions about Rhein belong on its tracker, not Telium's.

## Connection problems

Each server connection is tracked separately, and the client tells you which one failed and who can fix it.

| State | Cause | You are told to |
| --- | --- | --- |
| Protocol | Gateway close 4015 or 4002 | Update the client (an update banner appears) |
| Auth | Close 4001 or 4004, or an invalid session | Sign in again |
| Offline | The browser reports no network | Check your connection |
| Home server down | Your home server silent for 20 seconds | Contact its operator |
| Guild server down | A guild server silent for 20 seconds | Contact that server's operator |
| Reconnecting | Close 4005, or under 20 seconds | Nothing; the client retries |

The client retries only requests that are safe to repeat, and only on network errors or 502, 503 and 504. Channel messages carry a nonce the server remembers for 5 minutes, so a retry does not post twice. DM sends are not retried automatically.

To reset a misbehaving client, the recovery action clears the cached snapshot and the local settings mirror and keeps your session, drafts and keys. For a bug report, use **Settings → Connected servers → Copy diagnostics**. The output contains no messages, drafts, names or credentials. See [Getting help](/start/getting-help/).

## Synced and local settings

Some settings follow your account. Each value is sealed on your device under a key derived from your recovery keyring before upload, so your home server sees key names, padded sizes and write times, not contents. Synced values include preferences, recent emoji and skin tone, GIF favorites, saved stickers and drafts.

Voice region and Rich Presence toggles stay on each device. Details: [Sync encryption](/security/sync-encryption/).
