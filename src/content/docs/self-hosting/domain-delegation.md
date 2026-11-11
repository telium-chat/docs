---
title: Use your website domain for account names
description: Keep your website on one host and your Telium API on another.
---

**Example:** Your website stays at `example.com`. Telium runs at `chat.example.com`, but your username is `@alex:example.com`.

This needs **one text file** on the website and **two settings** on the homeserver. No separate web client, new DNS protocol or copied signing keys.

## How it works

The website serves `https://example.com/telium.txt` with one line:

```text
chat.example.com
```

Telium reads that pointer, fetches live discovery from `https://chat.example.com/.well-known/telium/server`, and verifies that the server claims `example.com` as its identity. The text file is **not** an HTTP redirect.

:::caution
Set the account identity **before anyone registers**. `server_name` is embedded in user IDs; changing it on a live server requires [relocation](/self-hosting/relocation/), not a config edit.
:::

## 1. Configure the homeserver

These values must be in the homeserver config:

```toml
server_name = "example.com"
public_base_url = "https://chat.example.com"
```

The exact edit depends on installation: [native](/self-hosting/install-systemd/#using-your-website-domain-for-accounts), [Compose](/self-hosting/install-docker/#using-your-website-domain-for-accounts), or [tunnel](/self-hosting/install-docker-tunnel/#using-your-website-domain-for-accounts). Follow that guide and restart or recreate the service.

Only `chat.example.com` needs DNS pointing to the Telium proxy or tunnel. Leave `example.com` on your existing website provider.

## 2. Publish telium.txt

Create a file named `telium.txt` at your website's **public root**, containing only the API hostname (or an `https://` URL on that hostname). A final newline is fine.

| Website host | Where to put it |
| --- | --- |
| cPanel, traditional web hosting or FTP | Beside your public `index.html`, often inside `public_html/` |
| Astro, Vite or other Git-hosted static sites | `public/telium.txt` or your site's published root |
| Cloudflare Pages direct upload | Include `telium.txt` in the uploaded site folder |
| Website builder | Use its public-files or custom-path feature, if available |

Check `https://example.com/telium.txt` in your browser. **No Worker, DNS TXT record or JSON document is required.** If your host can't serve a file at that exact path, use the alternative below.

## 3. Verify before registration

```sh
curl -i --max-redirs 0 https://example.com/telium.txt
curl -fsS https://chat.example.com/.well-known/telium/server
```

The first response should be HTTP 200 with the hostname on one line; the second should advertise `"server_name": "example.com"` and the live HTTPS API.

Then open [telium.chat](https://telium.chat), select `example.com` as the server and register. For public listing, submit **`example.com`**, not the API subdomain.

## If the browser cannot read the file

Browser clients need **CORS** on the website's text-file response. If necessary, allow cross-origin reads for `/telium.txt` only:

```text
Access-Control-Allow-Origin: *
```

For Cloudflare Pages you can add this to `public/_headers` (or the published root):

```text
/telium.txt
  Access-Control-Allow-Origin: *
```

Test with `curl -i -H 'Origin: https://telium.chat' https://example.com/telium.txt`. Server-to-server requests are not subject to browser CORS.

## Security rules

- The pointer must name an HTTPS endpoint on the **same domain or one of its subdomains**.
- No credentials, query parameters, path or multiple lines.
- The actual server's live discovery must identify the original account domain.
- Keep `/.well-known/telium/server` on the real Telium API. The text pointer is **only** a discovery hint.

## Existing .well-known method

Older clients may use a JSON document at `https://example.com/.well-known/telium/server`. If your hosting supports it, you may serve or reverse-proxy the real discovery document there. The JSON method takes priority if both routes exist. `telium.txt` is supported in current source; ensure any deployed older client you rely on supports it before switching.

**Next:** [Finish setup](/self-hosting/after-setup/) or [prepare for public signups](/self-hosting/public-server/).