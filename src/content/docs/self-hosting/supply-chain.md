---
title: Supply chain
description: What Telium releases ship, how to verify them, and how the release manifest is signed.
sidebar:
  order: 17
---

This page lists every release artifact, what protects its integrity, and how to verify a download or pin the release-manifest key on your server.

## Release artifacts

| Artifact | Where | Integrity |
| --- | --- | --- |
| Server image | `ghcr.io/telium-chat/telium`, tags `server-v<version>`, `server-latest`, `sha-<commit>` | `sha256:` digest recorded in `deploy/releases.json`; BuildKit SBOM and `mode=max` provenance attached |
| Server native tarballs (x86_64, aarch64) | GitHub release `server-v<version>`, mirrored to `server-latest` | `SHA256SUMS-server`, and the sha256 in the signed `deploy/releases.json` entry |
| Release manifest `deploy/releases.json` | `main` branch, polled by servers | Detached Ed25519 signature in `deploy/releases.json.sig` |
| Linux AppImage | GitHub release `desktop-v<version>` | `SHA256SUMS-linux-x86_64`, and the sha256 in the signed client manifest |
| Windows installer | GitHub release `desktop-v<version>` | `SHA256SUMS-windows-x86_64`, and the sha256 in the signed client manifest |
| Android APK | GitHub releases `android-v<version>` and `android-latest` | Signed with Telium's Android release key, plus `SHA256SUMS-android-arm64` |

The image tags all point at one digest. Use `sha-<commit>` or the digest when you need to know exactly which build ran.

## Verifying a download

Checksums catch a corrupted download. They do not prove the build is honest.

```sh
sha256sum -c SHA256SUMS-server --ignore-missing
```

To inspect the server image's SBOM and provenance:

```sh
docker buildx imagetools inspect ghcr.io/telium-chat/telium:server-v<version> --format '{{ json .SBOM }}'
docker buildx imagetools inspect ghcr.io/telium-chat/telium:server-v<version> --format '{{ json .Provenance }}'
```

The desktop and Android artifacts have no SBOM.

## The signed release manifest

Your server polls `updates.manifest_url` (by default `deploy/releases.json` on `main`) to learn the current release. See [Updates](/docs/self-hosting/updates/).

The signature covers the statement `telium-release-manifest-v1 sha256=<hex of the manifest bytes>`. The verifier checks the statement against the bytes it downloaded before checking the signature, which prevents replaying a signature onto other content. The same key signs `client-releases.json` under a different statement prefix, and the clients refuse an unverified client manifest.

Your server verifies the manifest only when you pin the key:

```toml
[updates]
manifest_public_key = "<url-safe unpadded base64 Ed25519 public key>"
# manifest_signature_url = ""   # empty means manifest_url + ".sig"
```

The default is empty, which means unchecked. With a key set, the server refuses any manifest that fails verification, and it refuses to start if the key is not 32 bytes of url-safe unpadded base64. Get the public key from a channel other than the repository it signs.

:::note
The signature proves who published the release list. It does not prove a release is free of bugs.
:::

## Build inputs

- Every Rust dependency (`server`, `sfu`, `telium-protocol`, `web/src-tauri`) must come from crates.io with an up-to-date `Cargo.lock`.
- Every JavaScript dependency in the Bun lockfiles must be a registry version with a `sha512-` hash. The one exception is `arrpc`, pinned to a commit.
- `cargo audit` and `bun audit` run on dependency changes and weekly. Known vulnerabilities in Cargo crates and high or critical npm advisories block a change unless an expiring, reviewed exemption covers them.
- GitHub Actions are pinned to commit SHAs in most workflows. Base images (`rust:1-slim-bookworm`, `debian:bookworm-slim`, `oven/bun`, `node:22-bookworm-slim`) stay on tags so they pick up OS security fixes; the image digest and SBOM record what shipped.

To run the dependency checks on a checkout:

```sh
node scripts/check-dependency-sources.mjs
node scripts/audit-gate.mjs --report-only
```
