# Telium documentation editorial review (2026-11-05)

This is a working checklist for future docs passes. It is **not** a replacement for the published documentation. Review claims against the current code and tests rather than copying old prose. The public docs use Starlight; `bun run build` includes broken-link validation.

## Editorial principles

1. **Start with the reader's task.** Lead with a sentence identifying who the page is for, then the decision or steps. Put data structures, HTTP routes and configuration tables under later "Reference" sections or linked pages.
2. **Explain a term on first use.** Prefer "guild (community)" and "home server (your account server)" before expecting readers to know Telium vocabulary.
3. **Make defaults and optional choices explicit.** E.g. small calls do not need an SFU; a private SFU does not join a public pool; being in a directory does not mean accepting recommended signups.
4. **Never promise privacy without stating the threat model.** Separate message encryption, call encryption and transport protection. State what metadata operators can still see.
5. **Keep one authority for each operational fact.** Install scripts, executable config and protocol code should govern exact ports, paths, commands, signing and limits. Add automated tests where prose is likely to drift.
6. **Use meaningful next-step links.** Every tutorial should say what to do after completion, and every reference should point to the relevant tutorial.
7. **Don't hide hazards behind massive tables.** Risks like open registration, losing the backup key, proxy limits and migrating keys belong near the top.

## Implemented on this branch

- [x] Replaced topic/alphabetical sidebar with reader journeys; all existing pages remain included.
- [x] Reworked landing page for users, operators and developers.
- [x] Added [first steps](src/content/docs/start/first-steps.md) for someone who doesn't host a server.
- [x] Added [after setting up your server](src/content/docs/self-hosting/after-setup.md), covering administrators, registration, backups, updates, testing, storage and directory/SFU decisions.
- [x] Added skim-friendly introductions to guilds, media, public-home onboarding and SFU hosting.
- [x] Added a [public homeserver walkthrough](src/content/docs/self-hosting/public-server.md): first-user experience, operator checks, 50 MiB upload example, quota, 30-day retention, listing wizard and referral opt-in.
- [x] Added [domain delegation](src/content/docs/self-hosting/domain-delegation.md): permanent account identity versus API URL, `.well-known` route, live proxy and verification.
- [x] Moved step-by-step user guidance to the top of voice, DM calls, friends, notifications, watch-together, rich presence and help pages.
- [x] Made the privacy matrix and alpha-stability caveats understandable without reading protocol details.
- [x] Verified in the implementation that SFU guild calls use MLS-based E2EE and corrected contradictory security prose.
- [x] Removed the stale "who can read what" diagram from the architecture page pending regeneration; its outdated SVG assets are still in `public/diagrams/`.

## Next pass — priority 1: correctness and trust

- [ ] **Regenerate `who_reads-light.svg` and `who_reads-dark.svg`.** The visual said an SFU reads guild call media. The current `web/src/lib/guild-call-keys.js`, `server/src/routes/voice/mod.rs`, and `server/tests/api/voice.rs` demonstrate guild-call MLS E2EE on SFUs. Note that mesh calls use peer-to-peer DTLS-SRTP and signalling remains a trust boundary. Don't reintroduce a misleading image.
- [ ] **Audit every security/privacy claim against current tests** (especially threat model, privacy, DMs, guild SFU calls, account recovery and the browser trust boundary). Keep precise distinctions between text, call media, and metadata.
- [ ] **Verify production commands against the released installer**, not just `main`: native vs standalone Compose vs older tunnel kit, updater binary paths, admin commands, and where data and secrets actually land. The install pages were recently revised; preserve their style rather than rewriting them wholesale.
- [x] **Verify defaults/quotas/expiry** against the current `server/telium.example.toml`, `server/src/config.rs` and `server/src/routes/media.rs`. Reference defaults are 100 MiB per file with unlimited total storage when `default = "enabled"` and zero automatic expiry; public-server guide proposes explicit limits. Re-verify after implementation changes.

## Next pass — priority 2: teach use cases, not internals

### Getting started

- [ ] Add screenshots or a short visual flow showing how to pick a home server, register, save a recovery key, join a guild and make a call. Keep UI screenshots versioned and easy to replace.
- [x] Give the alpha/stability page a prominent "What this means for my data" summary.
- [x] Turn getting-help into a short problem picker and ready-to-copy diagnostic checklist.

### Self-hosting

- [ ] Split the 560-line configuration reference into a **common settings** guide and an exhaustive keyed reference. Keep stable anchors for existing links.
- [ ] Add copyable recipes for "private friends-only server", "public account home", and "guild and voice host", with capacity and safety tradeoffs.
- [ ] Make backup verification, offsite key custody, safe upgrades and update status accessible without studying the internals first.
- [ ] Summarize observability and disaster recovery with a short basic runbook; keep incident-specific deep dives.
- [ ] Consolidate overlapping information across `updates.md`, `upgrades.md`, and `supply-chain.md`, keeping their different jobs clear.
- [ ] Clarify `managed-hosting.md` title and audience. It is about **publishing provider catalogues**, not finding a vendor to manage a server.
- [ ] Add a short "What is an SFU?" illustrated primer and examples for private, trusted multi-home, and intentionally public modes.

### Features

- [ ] Separate human instructions from wire detail in `guilds.md`, `dm-calls.md`, `voice-and-video.md`, `media.md` and `notifications.md`. User-facing tops should explain actions, limits and privacy; API/route tables can live below or in reference.
- [ ] Put a "what you'll see in the client" intro before the state machines in `friends.md`.
- [ ] Make screenshots/settings steps the starting point in `rich-presence.md` and `watch-together.md`.
- [ ] Move detailed `bots.md` and `interactivity.md` under the developer-oriented journey, with minimal working code first.

### Federation

- [ ] Build a plain-language example: Alice's account home vs Bob's guild home; who stores which data; what happens when one is offline.
- [ ] Keep **directory listing**, **recommended account-home pool**, and **public voice/SFU directory** visibly distinct. The current onboarding page covers the first two, not the third.
- [ ] Put an account/guild migration decision matrix before the cryptographic sequence.

### Security and privacy

- [x] Add a beginner-facing privacy matrix: guild text, DM text, mesh calls, SFU calls, uploaded files, and metadata.
- [ ] Keep threat-model tables and protocol-specific details for readers who want to inspect guarantees; use plain-language explanations first.
- [ ] Update light/dark diagrams together when encryption or trust assumptions change.

### Developer references

- [ ] Split the very long `reference/api.md` (462 lines) into navigation by task and runnable request examples, with one link to the executable route registry as source of truth.
- [ ] Distinguish required interoperability behavior from implementation-specific examples in federation/protocol pages.
- [ ] Keep translation and development guides contributor-focused; check commands and supported platforms against the repository.

## Verification and maintenance

- [ ] Run `bun install --frozen-lockfile && bun run build` on any docs branch. Starlight's links validator checks local links.
- [x] Added a non-deploying CI workflow for docs branches and PRs so link checks do not require production deployment.
- [ ] Spot-check renderings of the home page, the long self-hosting nav, the new first-steps page and the post-install guide on desktop and mobile.
- [ ] Add lightweight prose/implementation checks for claims that have regressed: guild SFU E2EE, registration default, backup key, install paths, directory vs recommended eligibility and SFU trust.public.
- [ ] Use issue/PR reviews to mark a page's **verified against code version** when a behavioral change touches it.
