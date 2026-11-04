# Telium docs

Source for [docs.telium.chat](https://docs.telium.chat/), built with [Starlight](https://starlight.astro.build).

```sh
bun install
bun run dev      # http://localhost:4321/
bun run build    # dist/, fails on broken internal links
```

Pages live in `src/content/docs/`. A push to `main` deploys.

## Writing docs people can skim

Prefer a page that works for someone who only reads the first screen:

1. **Answer the decision first.** Say whether the feature is optional and what the safe default is.
2. **Put the shortest working path first.** A runnable command, the next action, and how to verify success.
3. **Separate choices from details.** Use a three-row comparison when there are multiple deployment paths; put full config tables and protocol details after the quick path.
4. **Name costs and trust boundaries.** Especially for hosting: opt-in vs default, private vs publicly usable, metered bandwidth, exposed ports, and what an operator can learn.
5. **Cross-check behavior against `telium-chat/telium`.** Don't promise a feature, automatic fallback or self-hosting mode that the current server/installer does not implement.
6. **Use descriptive headings and links.** Each step should be useful in isolation; avoid forcing new operators through architecture explanations before the install.

Run `bun run build` before opening a docs PR; the build catches broken internal links.

The code is at [telium-chat/telium](https://github.com/telium-chat/telium).
