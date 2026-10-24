# Telium docs

Source for [telium-chat.github.io/docs](https://telium-chat.github.io/docs/), built with [Starlight](https://starlight.astro.build).

```sh
bun install
bun run dev      # http://localhost:4321/docs/
bun run build    # dist/, fails on broken internal links
```

Pages live in `src/content/docs/`. A push to `main` deploys.

The code is at [telium-chat/telium](https://github.com/telium-chat/telium).
