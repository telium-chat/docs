# Documentation style guide

This is a maintenance guide, not public documentation.

## Write for the person doing the task

- Lead with what the reader can accomplish, prerequisites, and the shortest supported procedure.
- Use plain words. Explain homeserver, guild and SFU once. Avoid slogans, filler and paragraphs that only announce "This page covers…".
- Put important warnings **next to the decision** they affect. Don't bury registration defaults, permanent server names, ports, TLS or backup-key loss in a long table.
- Separate an optional service from a required one: you can run a homeserver without an SFU, and an SFU without a homeserver.
- Make private and public operation different explicit choices. Directory listing and signup recommendations are also separate choices.
- Show the command, the expected result, and what to try when it fails. Use working, consistent examples.
- Keep user instructions short; preserve wire formats and exhaustive configuration keys in reference pages.
- Link to a single authoritative guide rather than repeating setup steps across pages.

## Check accuracy

Treat shipped installer scripts, configuration examples, executable route definitions and tests in [telium-chat/telium](https://github.com/telium-chat/telium) as the source of truth. Do not document unmerged behavior as available.

Check the **native** and **Compose** onboarding paths independently: they differ in registration and first-admin bootstrap. Verify SFU ports, Docker publish rules, proxy expectations, and release/updater paths against the current implementation.

For security claims, separate guild text, encrypted DMs, guild SFU calls, metadata and IP visibility. Never imply that encryption provides anonymity.

## Before merging

Run `bun install --frozen-lockfile && bun run build`; fix all broken local links and headings. Read the rendered page as a newcomer, not as the engineer who wrote the feature. For installer changes, confirm that instructions still match a clean installation and a rerun that preserves user data.

When renaming a heading, update inbound anchor links. When deprecating a procedure, point to the replacement rather than leaving two conflicting walkthroughs.
