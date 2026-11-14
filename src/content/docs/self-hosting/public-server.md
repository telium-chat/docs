---
title: Run a public homeserver
description: A step-by-step operator guide to open registration, safe uploads, moderation, scaling and listing your Telium server publicly.
---

A **public homeserver** lets people you do not know create Telium accounts. You can start on one machine, but you are agreeing to run a service people may depend on. This guide is for that job, not for a private server shared with a few friends.

**The short version:** establish your domain and backups, claim the first administrator, set media limits, prepare to handle reports and outages, test from outside your network, and then [list your server](#get-onto-the-public-server-list). You can be publicly listed **without** volunteering for automatic signup recommendations.

:::caution[Do not open signups immediately after installing]
Out of the box, registration is open and media uploads are `enabled` with a 100 MiB per-file limit, **no per-user quota**, and **no age-based attachment deletion**. These are reference defaults, not a suitable budget for every public operator. Configure the policies below before advertising your server.
:::

## 1. Build a server worth depending on

Start with [Running in production](/self-hosting/production/) and [After setting up your server](/self-hosting/after-setup/). Choose the [native install](/self-hosting/install-systemd/) or [Compose](/self-hosting/install-docker/). A small VPS is fine for initial testing; it is **not** an unlimited capacity promise.

Plan for the following before asking strangers to sign up:

- **Stable name and HTTPS.** The `server_name` becomes part of every account ID (`@alice:example.com`). Treat it as a long-lived identity. Put the API behind a properly configured HTTPS proxy or tunnel. If your account domain and server address differ, follow [Use your website domain for Telium accounts](/self-hosting/domain-delegation/) **before creating accounts**.
- **Administration and access.** Register your first admin account yourself, enable the available account security controls, and consider a second trusted operator. See [Server administrators](/self-hosting/server-ownership/).
- **Backups outside the VPS.** Retain the encryption key off-box, copy archives off-box, run a restore drill, and confirm the updater is healthy. See [Backups](/self-hosting/backups/) and [Updates](/self-hosting/updates/).
- **A working abuse contact.** Publish an address you read, define a short acceptable-use policy, and have a process for reports, removals and repeat offenders.
- **Enough disk and transfer budget.** Count uploaded files, database growth, media serving, encrypted backup copies and remote storage requests. Set alerts before disk space is exhausted.

**Keep registration closed while preparing** after your administrator account exists:

```toml
[registration]
open = false
```

On a native install edit `/etc/telium/telium.toml`; with the production Compose kits edit `/opt/telium/telium.toml`. Apply changes using your installation's restart or redeploy procedure. Closing registration does not disable existing accounts.

## 2. Set file sizes, quotas and retention

For a first public deployment, this is a **suggested policy**, not Telium's default:

```toml
[media_policy]
default = "quota"
quota_bytes = "1GiB"
max_file_bytes = "50MiB"
max_total_bytes = "150GiB"     # whole server; size this for your disk (below)
min_free_bytes = "20GiB"       # free space to leave on the media disk
attachment_max_age_days = "30d"
```

| Setting | What users experience |
| --- | --- |
| `default = "quota"` | Uploads are allowed, but each account has a stored-file allowance. |
| `quota_bytes = "1GiB"` | A user can store at most roughly 1 GiB of server-hosted media at a time (subject to current recorded usage). This is **not** a monthly upload bandwidth allowance. |
| `max_file_bytes = "50MiB"` | A single upload cannot exceed 50 MiB. Change it to `"25MiB"` or `"100MiB"` if your budget supports a different limit. |
| `max_total_bytes`, `min_free_bytes` | A limit on the whole server, not on any one person. When it is reached, new uploads fail with a "server storage full" error and existing files still download. See [Size the server-wide limits](#size-the-server-wide-limits) for picking values. |
| `attachment_max_age_days = "30d"` | Attachments are deleted 30 days after upload, even when messages still reference them. Avatars, banners, emoji and stickers are not affected. |

**This is deletion, not just hiding files.** Users lose access to attachments after 30 days; the original message may remain. Describe the retention policy on your signup or community information page. Backup copies can outlive an upload's live expiry according to your backup retention settings.

`attachment_max_age_days` is the simplest way to do this. If you would rather give each upload a lifetime it can see, `default_expiry_secs` sets the lifetime a new attachment gets and `max_expiry_secs` the longest one it may ask for. Like the age rule, both apply only to attachments; avatars, banners and custom emoji keep their files. Uploaders can still pick a shorter lifetime, and guild owners can set shorter limits for their channels.

A server and the destination guild/channel may each impose limits; the **smallest applicable file-size and expiry cap wins**. Guild owners can narrow both in their settings but cannot raise your server-wide ceiling. Profile assets have a separate size limit. Read [the full media settings](/self-hosting/configuration/#media-policy) for allowlists, blocked users and avatars.

:::tip[How much storage does that buy a user?]
At a 50 MiB file limit, a 1 GiB quota fits roughly twenty maximum-sized files **at once**, or many more small images. Files that expire or are deleted release live storage after cleanup. Total capacity depends on users, their actual file sizes, backups, replication and object-store billing — do not multiply quota by user count and treat it as a forecast.
:::

### Size the server-wide limits

Per-account quotas do not cap the server: a few hundred accounts with 1 GiB each can fill any disk. `max_total_bytes` and `min_free_bytes` are the two settings that do, and both are off by default.

The values in the example suit a media disk with about 200 GiB free. Scale them to yours; a reasonable starting point, and what the native installer suggests, is:

- `max_total_bytes`: about three quarters of the free space on the disk that holds `media_dir`.
- `min_free_bytes`: about a tenth of that free space, so the database, logs and temporary upload files have room.

`max_total_bytes` counts the media the server has recorded, not what is on disk, and neither setting accounts for backups, logs, the database or other programs. Keep watching real free space, including `media_dir/tmp`, with [storage monitoring](/self-hosting/observability/).

### Leave room for backups

Backups usually live on the same machine and, by default, copy every media file on every run, so they can take more disk than the uploads themselves. Decide how much media to back up and how many archives to keep before you open signups: see [choosing what media to back up](/self-hosting/backups/#choosing-what-media-to-back-up). Backing up only profile assets saves a lot of space, but then attachments cannot be restored after a disk failure, and your users should know that.


### Where the files live

The server stores media under `media_dir` by default. For growth, Telium also supports **S3-compatible object storage** through `[media_store]` / `[media_store.s3]`. That can separate file capacity from your VPS disk, but it does **not** eliminate upload, download, request or backup costs. Keep bucket credentials private and check the provider's egress and API-request billing.

**Want to set this up?** Start with the [step-by-step S3 media storage guide](/self-hosting/s3-media-storage/) for bucket permissions, a copyable config, restart instructions, and an upload test. Do not switch a populated local media store without a migration plan.

See [Media store configuration](/self-hosting/configuration/#media-store), [Data lifecycle](/self-hosting/data-lifecycle/) and [Storage monitoring](/self-hosting/observability/). Test expiry and reclamation with actual attachments before putting real users on the service. For S3 in particular, do not assume the local-filesystem orphan-file sweep cleans up stray bucket objects.

### Upload problems to test

- Upload a small file and confirm it downloads.
- Try a file just above `max_file_bytes`; it should be rejected rather than accepted.
- Check that the client shows the expiry and usage limit where appropriate.
- Try again after the retention period on a test object; its message may still exist, but the file should not be retrievable.
- If requests fail with HTTP `413` below your configured limit, inspect your reverse proxy or tunnel. Cloudflare's upload cap can be stricter than Telium's. See [Exposing your server](/self-hosting/exposing/).

## 3. Decide who joins and who handles abuse

When the server is ready, change:

```toml
[registration]
open = true

[moderation]
abuse_contact = "abuse@example.com"
```

**Do not copy the example contact address.** Set one that you control and regularly monitor. The contact is advertised in public server capabilities. Tell users what happens to reports and how to contact an operator if their account is locked out.

Telium supports server-wide moderation and upload hash blocklists. Those tools are not a substitute for an operator reviewing reports. Use the **Control plane** in the client for accounts, reports, storage, federation and the audit log; see [Moderation settings](/self-hosting/configuration/#moderation) and [Guild moderation](/features/guilds/).

Have an explicit pause plan: `registration.open = false` stops new signups while you investigate abuse or capacity without automatically removing existing accounts. Separately disable referrals when you need to stop being recommended.

## 4. Test like a new user

From a device **outside** the server's network:

1. Fetch `https://example.com/.well-known/telium/server` (replace with your **account identity domain**). It should return JSON whose `server_name` equals that domain and whose `api` points to your reachable HTTPS backend.
2. Fetch `https://chat.example.com/_telium/v1/capabilities` (replace with the published API address). Confirm `registration_open` and your media limit.
3. Register a **non-admin** test account from [telium.chat](https://telium.chat), not just from a shell or from localhost.
4. Create a guild, invite someone whose account lives on another homeserver, send messages, upload a file, and test a voice call.
5. Check the control plane: reports can reach an operator, storage usage is visible, backups are current and the server survives a restart.

A homeserver can host accounts without hosting an SFU. Small calls work via direct mesh (up to four participants by default); larger guild calls benefit from an SFU. You can keep your SFU private to trusted homeservers or [offer public relay capacity](/self-hosting/sfu/). **The homeserver directory and SFU directory are separate.**

## Get onto the public server list

This is a short process; you do not need to learn Git.

1. Make sure `[registration] open = true` and your public discovery and API endpoints work.
2. Prepare a public name, one-sentence description, physical region, rough account-count range and a working operator contact.
3. Go to **[telium.chat/list](https://telium.chat/list)** and select **A homeserver**.
4. Enter the **account identity domain** (the part after `:` in user IDs), even when the API itself lives on a different hostname. Run the wizard's live check.
5. Fill in your details and submit. The wizard files a listing issue; automation prepares a registry pull request. A maintainer still reviews and merges it.
6. Look for your server on **[telium.chat/servers](https://telium.chat/servers)** after the listing is merged. Probes refresh the publicly measured status roughly hourly.

You can also [submit an entry manually in GitHub](https://github.com/telium-chat/telium/blob/main/site/registry/README.md), editing `site/registry/servers.json`.

:::note[Public listing ≠ automatic beginner signups]
**Directory only:** People who browse the server list may choose you; there is no automatic referral commitment.

**Recommended signup pool:** You must additionally tick the recommendation opt-in in the listing and turn on `registration.recommendations.accepting = true` on your live server. Telium also requires observed history, compatibility, open registration and health: at least seven days of listing/observed age, at least 72 probes and at least 99% measured 30-day uptime under the current rules. You can be listed **long before** you qualify for referrals. [Full eligibility rules](/federation/onboarding/#eligibility).
:::

### If you want automatic signup recommendations

After you have enough spare capacity, enable this:

```toml
[registration]
open = true

[registration.recommendations]
accepting = true
referral_weight = 1
```

You must also opt in on the public listing; these are independent safeguards. `referral_weight` is a small relative preference (bounded 1–3), **not** a guaranteed number of users. For the first public launch, leave it at `1`.

To pause automatic recommendations later:

```toml
[registration.recommendations]
accepting = false
```

The directory can keep showing you; the referral signal updates on its next probe. If you need to stop **all** new accounts, also close registration. Read [Account-home onboarding](/federation/onboarding/) for the exact rules and privacy design.

## 6. Operate it week after week

| Routine | What to watch |
| --- | --- |
| Every day during growth | Reachability, new signups, reports, disk/object-store usage, network transfer and backup success |
| After any change | Outside-network sign-in, discovery, cross-server guild access, a sample upload and the updater |
| Regularly | Restore drills, logs, security releases, unused administrators and the volume of retained attachments |
| When load increases | CPU/RAM, SQLite and I/O performance, storage growth, egress cost, and whether a second operator can help |
| Before retiring the server | Announce downtime or sunset, help users move, preserve data for the published period and update the public listing |

There is no responsible universal "one VPS supports X users" number: file behavior, online concurrency, media origin and federation traffic vary. Measure your own workload before promising an account capacity. Use [Observability](/self-hosting/observability/), [Scaling](/self-hosting/scaling/), [Disaster recovery](/self-hosting/disaster-recovery/) and [Sunset](/self-hosting/sunset/) as you grow.

**Next:** If your account domain is a website but the API runs elsewhere, follow the [one-line `telium.txt` setup](/self-hosting/domain-delegation/). Then [submit your public listing](https://telium.chat/list).
