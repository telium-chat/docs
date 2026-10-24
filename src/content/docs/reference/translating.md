---
title: Translating
description: How Telium's client catalogues are laid out, how to add a language or a string, and the message pattern syntax.
sidebar:
  order: 5
---

The client ships English (the source) and nine translations: German, Japanese, Arabic, French, Spanish, Portuguese, Simplified Chinese, Russian and Korean. Every catalogue holds every English key, but much of the text is a machine-assisted first draft that no person has reviewed yet. `web/src/lib/i18n/catalog/stamps.json` records which keys a reviewer has accepted.

## Layout

```text
web/src/lib/i18n/
  catalog/en/*.js      English, one file per namespace (app, auth, chat, common, errors, perms, security, ...)
  catalog/en/index.js  assembles namespaces; throws on a duplicate key or a key in the wrong file
  catalog/<tag>.js     one file per translation
  catalog/stamps.json  reviewed keys per language
  catalog/index.js     loading, fallback, completeness(tag)
  locale.js            LOCALES table, resolveLocale
  format.js            ICU MessageFormat subset parser
  intl.js              numbers, dates, sizes, durations, relative times
  errors.js            server error code to errors.<code> message
  pseudo.js            pseudolocales xx-long, xx-kana, xx-rtl
  react.jsx            useT, useLocale, Trans
```

The first segment of a key names its file: `auth.login.title` lives in `auth.js`. Translate interface text only. Names, messages and other user content arrive as placeholder values; leave them alone.

## Adding a language

1. Add an entry to `LOCALES` in `web/src/lib/i18n/locale.js`. Use the shortest accurate tag (`pt`, not `pt-BR`, unless the region is what differs):

   ```js
   { tag: 'fr', endonym: 'Français', dir: 'ltr', load: () => import('./catalog/fr.js') },
   ```

2. Create `web/src/lib/i18n/catalog/fr.js` exporting `messages` (or a default export) with keys taken from English.
3. Partial catalogues work: missing keys render in English. Translate whole keys, never half a pattern, and delete keys English no longer has.

A machine translation is a fine first draft, as long as a person reads it before it counts as reviewed. Track review with the status script, from `web/`:

```sh
node scripts/i18n-status.mjs --missing            # untranslated keys by namespace
node scripts/i18n-status.mjs --stale              # translated keys whose English changed, or never reviewed
node scripts/i18n-status.mjs --accept fr --ns common   # record a namespace as reviewed
```

`--only TAG` limits the report to one language. `--strict` exits non-zero when a language has keys English lacks.

:::caution
Run `--accept` only for text you have read. It records a claim that a person checked the translation.
:::

## Adding a string

- In components use `useT()`. In callbacks, or for text sent to the OS, clipboard or network, use `t()`.
- One key per sentence. Never build a sentence from fragments; word order differs between languages.
- Pass numbers, dates and sizes as values (`{n, number}`, `{at, date, medium}`), not preformatted strings.
- Comment each English key: what it is for, what each placeholder holds, and what must not change. If one English word covers two meanings, give each its own key.
- Migrate a file completely, then add it to `MIGRATED` in `web/src/test/i18n-coverage.test.js`.
- Use logical CSS properties (`margin-inline-start`, `text-align: start`), not physical ones.

## Pattern syntax

| Pattern | Rule |
| --- | --- |
| `{name}` | Move it freely. Never rename it. |
| `{count, plural, =0 {...} one {# item} other {# items}}` | Arms must match `Intl.PluralRules` for the language. `offset:1` is supported. |
| `{state, select, a {...} other {...}}` | `other` is required. |
| `{n, number}`, `{n, number, compact}`, `{size, bytes}` | Formatted through `Intl`. Styles are listed in `intl.js`. |
| `{at, date, medium}`, `{at, time, short}`, `{at, relative}` | Formatted through `Intl`. |
| `<b>...</b>` | Tags map to components the code supplies. `<` followed by an ASCII letter always starts a tag. |
| `'{'` and `''` | A literal brace and a literal apostrophe. An apostrophe right before `{`, `}` or `#` starts a quoted run, so use `’` there. |

## Behavior

- **Fallback:** a key missing from the active language falls back to English. A key English lacks renders as its last segment in sentence case, is logged once, and is recorded in `missedKeys()`. Tests assert that list is empty.
- **Errors:** the server sends a stable `code` with its `message` (registry: `server/src/errcodes.rs`). The client shows `errors.<code>` if it exists, then the server's message, then a fallback key or `errors.generic`. Some auth errors are vague on purpose; keep them vague.
- **Security copy:** `auth`, `perms` and `security` hold warnings. Do not soften them, and do not translate the recovery key format.
- **Service worker:** `web/src/sw.js` cannot import the catalogue. `lib/serviceworker.js` posts its strings to it, and `sw.js` keeps an inline English fallback.
- **Right-to-left:** the client sets `lang` and `dir` on the document and wraps values in the opposite direction in FSI/PDI marks.

## Checks

```sh
cd web
npx vitest run src/test/i18n.test.js            # resolution, fallback, plurals, quoting, Intl, bidi
npx vitest run src/test/i18n-coverage.test.js   # no prose in migrated files, keys used match keys defined, patterns parse
npx vitest run src/test/i18n-layout.test.jsx    # pseudolocale layout
npx vitest run src/test/sw-strings.test.js      # service worker strings match the catalogue
cargo test --manifest-path ../server/Cargo.toml --test error_codes
```

To check layout by hand, switch to a pseudolocale with `setLocale(installPseudo('xx-long'))`. `xx-long` pads text by about 40%, `xx-kana` uses non-Latin script, and `xx-rtl` forces right-to-left. Pseudolocales do not appear in the language picker.
