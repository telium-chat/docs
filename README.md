# Telium documentation

Documentation source for [docs.telium.chat](https://docs.telium.chat).

The site uses Astro Starlight. Pages live in `src/content/docs/`; navigation is in `astro.config.mjs`.

## Work on the docs

```sh
bun install --frozen-lockfile
bun run build
```

The build checks internal links and anchors. Keep pages task-first, commands copyable, and version-sensitive claims checked against [telium-chat/telium](https://github.com/telium-chat/telium).

See [the editorial guide](DOCS_EDITORIAL_PLAN.md) before changing installation instructions.
