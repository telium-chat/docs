---
title: Run a public homeserver
description: Prepare limits, moderation and reliability before opening Telium signups.
---

A public homeserver lets strangers create accounts. **You can operate a private server without joining the directory or accepting public signups.**

## Before you open registration

- [ ] Finish the [homeserver installation](/self-hosting/production/) and [post-install checks](/self-hosting/after-setup/).
- [ ] Confirm that your intended account domain works from outside your network. Set [domain delegation](/self-hosting/domain-delegation/) **before** the first account.
- [ ] Claim an administrator account and secure its recovery details. On native installs, the first signup is *not* automatically an admin.
- [ ] Save backups and the backup key off the host; complete a [restore test](/self-hosting/backups/).
- [ ] Publish an operator contact that you actually monitor.
- [ ] Decide how you will handle abuse, reports, bandwidth and outages.

## Set media limits

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

## Open registration

After testing in private mode, edit the installation's `telium.toml`:

```toml
[registration]
open = true

[moderation]
abuse_contact = "abuse@YOUR-DOMAIN"
```

Replace the contact address and restart/redeploy the server. The default native installer asks for this choice; you do **not** need to temporarily open registration just to create the first administrator. If you need to stop new accounts later, set `open = false` again. Existing accounts remain usable.

From an unrelated device, register a non-admin test account. Check federation, calls, uploads and the server control plane. The advertised API response at `/_telium/v1/capabilities` should reflect your signup policy.

## Get onto the public server list

1. Open [telium.chat/list](https://telium.chat/list) and choose **A homeserver**.
2. Supply your **account identity domain** (after the `:` in user IDs), not necessarily the physical API hostname.
3. Complete the public checks, add an operator contact and submit.
4. After review, look for the server at [telium.chat/servers](https://telium.chat/servers).

The directory is **not** automatic signup recommendations. You can appear publicly without agreeing to take referred beginners.

### If you want automatic signup recommendations

Opt in on your listing *and* set:

```toml
[registration.recommendations]
accepting = true
referral_weight = 1
```

Eligibility also depends on health, compatibility and observation history; review [the current rules](/federation/onboarding/#eligibility). To pause referrals while remaining listed, set `accepting = false`. To stop all new signups, also set `registration.open = false`.

## Operate it

Watch storage and transfer, reports, update status and backup restores. Don't promise capacity based on a guessed accounts-per-VPS figure. Use [Observability](/self-hosting/observability/), [Scaling](/self-hosting/scaling/) and [Disaster recovery](/self-hosting/disaster-recovery/) when traffic grows.