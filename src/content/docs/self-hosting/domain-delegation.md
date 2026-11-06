---
title: Use your website domain for Telium accounts
description: Keep your website where it already lives, and use a one-line text file to point Telium to your server.
---

Have a website at `example.com`, but want to run Telium at `chat.example.com` and give people addresses like `@alex:example.com`? You can.

**The simple way is to put one text file on your existing website.** You don't need to move the site, create a DNS record, learn JSON, or copy your server's cryptographic keys.

:::caution[Feature rollout]
The `/telium.txt` method requires Telium versions that include the new text-file discovery feature. Until that code has been merged and released, use the [existing `.well-known` method](#existing-well-known-method) instead. This page is the guide for the upcoming simpler setup.
:::

## How it works

| | Example | Purpose |
| --- | --- | --- |
| Your website and **account domain** | `example.com` | People sign up as `@alex:example.com` |
| The actual Telium server | `chat.example.com` | Handles messages, accounts, files and voice signalling |
| The small text file | `https://example.com/telium.txt` | Tells Telium where the server is |

When Telium discovers `example.com`:

1. It checks the existing `/.well-known/telium/server` route for compatibility with older setups.
2. If no usable document is there, it reads the `telium.txt` file on your website.
3. It then fetches **the full, live** `/.well-known/telium/server` response from `chat.example.com`.
4. It verifies the server identifies itself as `example.com` before connecting.

**The website file stays the same** when the server rotates keys, changes capabilities, or updates its public settings. You aren't maintaining a second copy of the server's discovery information.

:::caution[Choose the name before anyone registers]
The account domain is part of permanent addresses like `@alex:example.com`. Don't change `server_name` on a server with existing accounts; use [relocation](/self-hosting/relocation/) instead.
:::

## Step 1: Set up Telium on the subdomain

Install Telium using [native Linux](/self-hosting/install-systemd/#using-your-website-domain-for-accounts), [Docker Compose](/self-hosting/install-docker/#using-your-website-domain-for-accounts), or [Docker with Cloudflare Tunnel](/self-hosting/install-docker-tunnel/#using-your-website-domain-for-accounts). The installation pages have the exact configuration steps for this arrangement.

The settings you want are:

```toml
server_name = "example.com"
public_base_url = "https://chat.example.com"
```

Replace both example domains with yours. Set `server_name` **before the first account is created**. Keep the installed values for bind address, databases and other settings.

Point the DNS record for **`chat.example.com`** at your Telium HTTPS proxy or tunnel. Leave **`example.com`** pointing to the existing website host.

Confirm the server responds correctly:

```sh
curl -fsS https://chat.example.com/.well-known/telium/server
```

It should include `"server_name": "example.com"` and `"api": "https://chat.example.com"`. This full response comes from the running Telium server; you don't need to put it on your website.

## Step 2: Create one tiny file

Using any text editor, create a file named **`telium.txt`** containing one line:

```text
chat.example.com
```

Replace that name with the subdomain where your Telium server runs. You can also write `https://chat.example.com` if you prefer.

No JSON, quotation marks, or additional settings. A normal final newline is fine.

## Step 3: Put it on your website

Publish `telium.txt` at the **root** of the existing website, beside its homepage, so this exact URL works:

```text
https://example.com/telium.txt
```

Use whichever method your website already uses:

### Hosting panel or FTP/SFTP

1. Open your host's **File Manager**, or connect via FTP/SFTP.
2. Find the folder that contains the public website. It might be `public_html`, `www` or another document-root folder.
3. Upload `telium.txt` **directly into that folder**, beside your website's `index.html` or equivalent.
4. Open `https://example.com/telium.txt` in a browser. It should display only your Telium server's hostname.

WordPress and other traditional sites can use this approach if the hosting provider allows arbitrary public files.

### Cloudflare Pages without Git

1. Add `telium.txt` to the **built website folder** you normally upload (beside `index.html`).
2. In the Cloudflare dashboard, use your existing Pages project's **Direct Upload** deployment workflow to upload the entire website folder/ZIP, including `telium.txt`.
3. Open the public URL to verify it.

**Cloudflare Pages serves static files with a permissive CORS header by default**, so you normally don't need a custom `_headers` file for `telium.txt`. You don't need a Worker or Pages Function either.

### A website deployed through Git

1. If your website uses a framework with a `public/` directory (such as Vite or Astro), create `public/telium.txt`. On a plain static site, put `telium.txt` directly in the folder published as the website root.
2. Commit/push as you normally would and let the existing website deployment finish.
3. Open `https://example.com/telium.txt` to verify its contents.

This approach also works with Netlify, Vercel or other static hosts that preserve public files. You don't need to change the rest of the website.

### Other website builders

Find a way to publish a normal, publicly readable text file at `/telium.txt`. Some website builders have a file manager or custom static-asset feature; others cannot serve arbitrary paths.

If your provider can't publish a file at that URL, use a hosting feature that serves a custom route, or the [older `.well-known` approach](#existing-well-known-method) if that is supported. There is no magic DNS setting that makes a missing file appear.

## Step 4: Verify and sign up

From another machine:

```sh
# The website must show a single hostname on a successful HTTPS response.
curl -i --max-redirs 0 https://example.com/telium.txt

# The actual Telium server publishes its complete, live discovery document.
curl -fsS https://chat.example.com/.well-known/telium/server
```

Next open [telium.chat](https://telium.chat), choose to use your own server, enter **`example.com`**, and register. The resulting account should have an address like `@you:example.com`.

If you're opening a [public homeserver](/self-hosting/public-server/), submit **`example.com`**, not `chat.example.com`, to the [public directory](https://telium.chat/list).

## If the file loads in a browser but Telium cannot read it

A cross-origin browser request to `example.com` must be allowed by the website host. A plain text file avoids special JSON headers, but **a different website's JavaScript still needs CORS permission** to read it.

Many hosts handle this automatically. Cloudflare Pages, for instance, normally adds `Access-Control-Allow-Origin: *` to static assets.

If your provider doesn't, configure **only `/telium.txt`** to return:

```text
Access-Control-Allow-Origin: *
```

For example, on Cloudflare Pages with a custom configuration that removes this default, an optional `_headers` entry is:

```text
/telium.txt
  Access-Control-Allow-Origin: *
```

To test the header, run:

```sh
curl -i -H 'Origin: https://telium.chat' https://example.com/telium.txt
```

The response should include `Access-Control-Allow-Origin: *` (or a specific allowed Telium client origin). You do **not** have to set `Content-Type: application/json` or write a JSON document. If your website host doesn't permit cross-origin file reads, the browser client won't be able to resolve the pointer directly; native clients and server-to-server federation aren't subject to browser CORS.

## A few security rules

- The pointer must name **an HTTPS server on the same domain or a subdomain**, such as `chat.example.com`. Pointing to an unrelated domain isn't supported in this simple method.
- Don't write a path, username/password, query string, or multiple lines. The file contains one server hostname.
- The backend's live discovery must claim `server_name = "example.com"`, and its published API address must match the pointer.
- The file is **not an HTTP 301/302 redirect**. It contains a hostname Telium can validate.
- The new method does not replace the Telium server's own `/.well-known/telium/server` endpoint. That stays on the actual server to provide live metadata.

## Existing .well-known method

For deployments using older Telium versions or those that prefer fully explicit control, you can still publish `https://example.com/.well-known/telium/server` on the account domain. The full server's JSON document can be served directly there or reverse-proxied from the backend.

The simplest backwards-compatible static example is:

```json
{
  "server_name": "example.com",
  "api": "https://chat.example.com",
  "gateway": "wss://chat.example.com/gateway/v1",
  "protocol_version": "v1"
}
```

Publish it as an extensionless file at `.well-known/telium/server` with the appropriate `application/json` content type. That is the **old method**, not a required extra step when `telium.txt` discovery is available.

**Important:** If you publish both, the existing `.well-known` JSON has priority. Remove the old file if you want the new text pointer to be used.

**Next:** [Run a public homeserver](/self-hosting/public-server/) to configure media upload limits, retention, registration and directory listing.
