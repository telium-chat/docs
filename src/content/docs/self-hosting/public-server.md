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

These values are **an example public policy**, not Telium's compiled defaults:

```toml
[media_policy]
default = "quota"
quota_bytes = "1GiB"
max_file_bytes = "50MiB"
max_expiry_secs = "30d"
default_expiry_secs = "30d"
attachment_max_age_days = "30d"
```

That permits up to 50 MiB per uploaded file and roughly 1 GiB of *stored* media per user, with 30-day attachment retention. The quota is not a monthly bandwidth limit. Files can disappear while messages that referenced them remain; tell users your policy.

New uploads can use an [S3-compatible bucket](/self-hosting/s3-media-storage/) instead of filling VPS disk space. Moving an existing media store needs a separate migration plan. Verify that your proxy or tunnel allows the file sizes you advertise.

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