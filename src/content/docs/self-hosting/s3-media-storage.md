---
title: Store uploads in S3-compatible storage
description: Keep Telium attachments in an S3-compatible bucket instead of filling your server's disk.
sidebar:
  order: 8
---

**Want to run Telium on a small VPS without using its disk for every attachment?** You can put uploaded files in an S3-compatible object-storage bucket. Your homeserver still handles accounts, messages and the upload/download API; the bucket holds the actual stored media.

This is **optional**. A small private server can keep the default local storage. If you expect many users or attachments, remote media storage may make capacity easier to manage.

:::caution[Already have uploads on this server?]
**Do not simply change `media_store.store` from `local` to `s3` on a server containing important uploads.** Changing the backend does not itself migrate existing files; old attachments may become unavailable. This guide describes setting up the storage backend for a **new server or a server with no important uploads**. For an existing server, arrange and test a migration of both object bytes and their expected keys before switching. Keep a full backup and the original local media until every old attachment has been verified.
:::

## 1. Pick a provider and create a bucket

Any compatible S3 API with AWS Signature Version 4 can work. Options include AWS S3, Backblaze B2, Wasabi, DigitalOcean Spaces, Cloudflare R2 and self-hosted MinIO. You do **not** need Amazon specifically.

In your provider's dashboard:

1. Create a **private** bucket in a region close to your server or users. Do **not** enable public bucket access.
2. Create an access key for this bucket with the permissions needed to list, upload, read and delete objects (`ListBucket`, `PutObject`, `GetObject` and `DeleteObject` or the provider's equivalents).
3. Copy the **S3 endpoint URL**, **bucket name**, **region**, **access key ID**, and **secret access key**. You typically see the secret only once.
4. Check the provider's prices and limits for **stored bytes, outbound bandwidth/egress, API requests, minimum storage duration, and minimum monthly charges**. A low storage price is not the total cost of running a public file host.

You can use one private bucket for media and another for backups, but give each workload restricted credentials. S3-backed **media** and S3-backed **backups** are separate features.

## 2. Configure Telium

Edit the `telium.toml` file created by your installation:

| Installation | Config file |
| --- | --- |
| [Native / systemd](/self-hosting/install-systemd/) | `/etc/telium/telium.toml` |
| [Docker Compose](/self-hosting/install-docker/) | `/opt/telium/telium.toml` |
| [Docker Compose + Cloudflare Tunnel](/self-hosting/install-docker-tunnel/) | `/opt/telium/telium.toml` |

Find or add the following sections, replacing the example values **with your provider's real values**:

```toml
[media_store]
store = "s3"

[media_store.s3]
enabled = true
endpoint = "https://s3.us-east-1.amazonaws.com"
bucket = "your-private-telium-media-bucket"
region = "us-east-1"
prefix = "telium-media/"
access_key_id = "YOUR_S3_ACCESS_KEY_ID"
secret_access_key = "YOUR_S3_SECRET_ACCESS_KEY"
path_style = true
```

- **`endpoint` and `region`:** Use exactly what your provider gives you; they are not necessarily the AWS examples shown above. For example, Cloudflare R2 uses its account-specific S3 endpoint and `region = "auto"`. Some providers need `path_style = false` — use the provider's S3 compatibility instructions.
- **`bucket`:** The private bucket you created.
- **`prefix`:** Optional folder-like object-key prefix; keep it stable once you have uploaded files. If omitted or empty, Telium uses `telium/<server_name>/`.
- **`access_key_id` and `secret_access_key`:** The restricted bucket credentials. **Never commit them to Git, put them in screenshots or paste them into bug reports.** Keep the config readable only by the server administrator and Telium service. For production, prefer [secret-file references](/self-hosting/secrets/) such as `"${file:/path/to/secret}"`, with the path readable by the running server (and mounted into the container for Docker).
- **`enabled = true`:** This turns on the S3 bucket configuration; `store = "s3"` chooses it for uploaded media.

:::note[If you also use S3 for backups]
The global `TELIUM_S3_ACCESS_KEY_ID` and `TELIUM_S3_SECRET_ACCESS_KEY` environment variables **override** credentials configured in S3 sections. If you use separate media and backup buckets, avoid setting those global variables to a key that works for only one bucket. Use per-section credentials or secret-file references instead.
:::

See the [media-store configuration reference](/self-hosting/configuration/#media-store) and [S3 settings](/self-hosting/configuration/#s3-settings) for the full list of fields.

## 3. Check the configuration and restart

For a native installation, you can check the file and restart with:

```sh
sudo -u telium telium-server --config /etc/telium/telium.toml check
sudo systemctl restart telium-server
sudo systemctl status telium-server
```

For a Compose installation (with or without a tunnel), save `/opt/telium/telium.toml` and recreate just the server container:

```sh
cd /opt/telium
sudo docker compose up -d --force-recreate server
sudo docker compose logs --tail=100 server
```

If the service fails to start, check your region/endpoint, bucket name, credentials and network access. For Docker, any secret-file paths in the config must exist **inside the container**, not only on the host.

## 4. Test a real upload

1. Sign into Telium with a test account and upload a small attachment.
2. Download or open it through the Telium client. Do **not** make the bucket public just to test a download.
3. Open the bucket in your provider's dashboard and confirm that a new object appears under the expected prefix.
4. Try an upload larger than your configured [media file-size limit](/self-hosting/public-server/#set-media-limits) to confirm rejection. Remember that your HTTP proxy or Cloudflare Tunnel can impose a **lower** upload limit.
5. Test a disposable file with short expiry. After expiry/cleanup, verify that it is no longer retrievable **and** that the corresponding remote object was removed.

Your server still receives upload and download traffic; S3 does not bypass HTTP request limits or eliminate all local disk use (for example, the database, logs or temporary upload staging).

## 5. Set limits and protect the data

Remote storage is not unlimited free storage. For public servers, set [per-user quotas, maximum file size and automatic expiry](/self-hosting/public-server/#set-media-limits) before allowing strangers to register. Monitor storage usage, request counts, outbound transfer, and the provider bill.

**Remote media is not included in Telium's regular encrypted backup archives.** Enabling `[backup.remote]` uploads those archives to S3; it does **not** back up the contents of your `[media_store.s3]` bucket. Protect the bucket separately with a provider-supported backup/replication or versioning strategy, and test recovery. Keep a copy of your server configuration and backup key off the VPS as well. See [Backups](/self-hosting/backups/#what-an-archive-holds).

Telium removes known objects when their retention/deletion rules run, but the local-filesystem **orphan sweep does not clean up stray S3 objects**. Check bucket usage regularly. Do not apply an arbitrary bucket lifecycle deletion rule unless you understand how it interacts with Telium's retained attachment records.

## Troubleshooting

| Symptom | Check |
| --- | --- |
| Telium cannot connect to the bucket | Endpoint, region, DNS/TLS, credentials, firewall and whether the provider supports S3 Signature V4 |
| `AccessDenied` or `403` | Bucket-scoped permissions, correct keys, and any global `TELIUM_S3_*` environment override |
| `NoSuchBucket` or `404` | Bucket name, endpoint, region and the bucket's existence |
| Config works on host but fails in Docker | Secret files or environment values were not passed into the server container |
| Upload returns HTTP `413` | Reverse proxy/tunnel upload limit, even if Telium's file limit is higher |
| New uploads work, but older ones disappear | Backend was changed without migrating the local objects and their expected keys |
| Bucket grows unexpectedly | Attachment retention/quota policy, uncollected orphan objects, provider object versions and backups/replicas |

**Next:** Go back to the [post-install checklist](/self-hosting/after-setup/) or the [public homeserver guide](/self-hosting/public-server/) to finish registration, moderation, retention and monitoring.
