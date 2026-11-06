---
title: Use your website domain for Telium accounts
description: Keep your existing website anywhere you host it, while running Telium on a subdomain.
---

Already have a website at `example.com`? You can keep it there **and** run Telium at `chat.example.com`, while your users register addresses like `@alex:example.com`. Your website can be hosted on ordinary shared hosting, a website builder, Cloudflare Pages, Netlify, your own web server, or somewhere else.

**You do not need Git, Cloudflare, or a special website framework.** You only need a way to make one URL on your existing website domain return a tiny JSON document.

## Understand the two domains

| | Example | What it does |
| --- | --- | --- |
| **Your account domain** | `example.com` | The name people see in `@alex:example.com` |
| **Where Telium runs** | `chat.example.com` | The real server, which handles sign-in, messaging and uploads |
| **The discovery address** | `https://example.com/.well-known/telium/server` | A small file that tells Telium how to find the real server |

Your website stays at `https://example.com/`. The discovery URL lives **on that same website domain** and contains `"api": "https://chat.example.com"`. This is often called `.well-known` discovery or domain delegation. Think of it as giving Telium directions, **not** sending every website visitor to the chat server.

:::caution[Do this before your first account]
`server_name` becomes part of every user's address. Changing it after accounts exist is not a normal config edit. If you already have users on `@alice:chat.example.com`, see [Relocation](/self-hosting/relocation/) and [Migration](/federation/migration/), rather than changing the setting in place.
:::

## 1. Configure your Telium server

Install Telium using [native Linux](/self-hosting/install-systemd/#using-your-website-domain-for-accounts), [Compose](/self-hosting/install-docker/#using-your-website-domain-for-accounts), or [Compose with Cloudflare Tunnel](/self-hosting/install-docker-tunnel/#using-your-website-domain-for-accounts). Each install page explains how to choose the account domain **before registering**.

In `telium.toml`, the essential values are:

```toml
server_name = "example.com"
public_base_url = "https://chat.example.com"
```

Replace these examples with the real domain and subdomain you control. Leave the other installed config settings in place.

Give `chat.example.com` a working public HTTPS connection, using your normal reverse proxy or tunnel. **Do not change the DNS of `example.com` to point at your Telium VPS** if that domain already serves your website.

Before continuing, check the Telium endpoint directly:

```sh
curl -fsS https://chat.example.com/.well-known/telium/server
```

It should report `"server_name": "example.com"` and `"api": "https://chat.example.com"`. Fix these first if they are wrong.

## 2. Create the discovery file

On your computer, make folders named `.well-known` and `telium`, then a plain text file named exactly `server`:

```text
.well-known/
  telium/
    server
```

**The file has no extension**: not `server.json`, not `server.txt`.

Paste this JSON into `server`:

```json
{
  "server_name": "example.com",
  "api": "https://chat.example.com",
  "gateway": "wss://chat.example.com/gateway/v1",
  "protocol_version": "v1"
}
```

Replace the example domains with yours. Keep `https://` for the API and `wss://` for the gateway. Save it as UTF-8 text, not a word-processing document.

This is a **minimal example** for basic discovery. The live Telium server's own discovery response has more fields: federation keys, precise compatibility information, failover notices and operator settings. For a long-running public server, [serving the full live response](#for-public-servers-keep-discovery-current) is more future-proof. If you publish a static file, update it when your server's published discovery information changes.

## 3. Put the file on your website

The final URL must be **exactly**:

```text
https://example.com/.well-known/telium/server
```

Choose the instructions that match **how you already publish your website**. You do not need to switch hosts.

### Website hosting panel, FTP or SFTP (no Git)

For shared hosting or a conventional website server:

1. Open your hosting provider's **File Manager**, or connect using FTP/SFTP.
2. Find the website's **document root** — the directory whose contents appear at `https://example.com/`. On many cPanel-style setups this is `public_html/`, but yours may differ.
3. **Inside that document root**, create `.well-known/telium/` and upload the extensionless `server` file.
4. Make sure the file is public and readable, and that your web server sends it as `application/json`. If the host assigns `application/octet-stream`, ask the host how to set a content type for this URL.
5. Visit the full HTTPS URL in a browser. If you see your site's home page, a 404, a redirect or a download, check your website's rewrite rules and file-serving settings.

This works for many static sites and traditional PHP/WordPress hosts, **as long as the hosting provider lets you serve a custom file at that exact path**. The document root can contain WordPress or another website application; you don't need to replace it. Some managed website builders do not provide this capability.

### Cloudflare Pages: the easy way

Cloudflare Pages has **two different publishing workflows**. Both can serve this static file:

**A. You upload your site manually (no Git)**

1. Add the `.well-known/telium/server` path to the **folder of website files you upload**, alongside `index.html`. Do not put it in an unrelated Git repository.
2. Add a `_headers` file at the **root of those uploaded website files** to declare the JSON content type (example below).
3. In **Cloudflare Dashboard → Workers & Pages → your Pages project**, create a new **Direct Upload** deployment. Upload your complete built website folder or ZIP, including `.well-known` and `_headers`; choose production and deploy.
4. Verify the file at `https://example.com/.well-known/telium/server`.

A Pages project configured for **Git integration** cannot use the dashboard's drag-and-drop Direct Upload method. Use its existing Git deployment or Wrangler instead. Cloudflare's [Direct Upload guide](https://developers.cloudflare.com/pages/get-started/direct-upload/) covers dashboard uploads.

**B. Your site is deployed from Git**

1. In the website project, add `public/.well-known/telium/server` if your framework copies `public/` into the output (typical for Astro, Vite, and many others). For a plain static website, add `.well-known/telium/server` inside the folder that becomes the deployed site.
2. Add `public/_headers`, or place `_headers` in the build output as appropriate.
3. Commit and push the change through the Git workflow you **already use** for the website. Wait for the Pages deployment, then verify the URL.

**Pages `_headers` example** — put this at the deployed website's root; if you already have `_headers`, append the rule:

```text
/.well-known/telium/server
  Content-Type: application/json; charset=utf-8
  Access-Control-Allow-Origin: *
  Cache-Control: public, max-age=300
```

See [Cloudflare's custom-headers documentation](https://developers.cloudflare.com/pages/configuration/headers/). Keep `example.com` attached to your Pages website; only `chat.example.com` needs to reach the Telium server.

### Other static hosts (Netlify, Vercel, static site builders)

The same file works if your hosting provider serves files from a public output directory:

1. Find the directory that becomes the **root of your published website**.
2. Place `.well-known/telium/server` inside it. For a website built with a framework, that often means putting the file under `public/` or `static/` **before building**, so it is copied into the output.
3. Deploy using the provider's **usual workflow**: upload a folder, use its dashboard, run your build/deploy command, or push to Git.
4. Make sure your host serves the extensionless path directly as JSON. Set a route-specific `Content-Type: application/json` using the provider's supported header configuration if needed.

Some frameworks have a catch-all route that serves `index.html` for unknown paths. Exclude `/.well-known/telium/server` from that fallback if necessary. **Do not rename it to `server.json` to get around the issue**; Telium requests the extensionless path.

### Website builders that cannot upload arbitrary files

Some hosted website builders don't expose a public file directory or custom route handling. In that case, look for a supported feature that makes **one exact HTTPS URL** return JSON (a static asset, custom endpoint, or reverse-proxy rule). If the platform cannot do that, this setup may not work on that domain without a separate DNS/edge routing arrangement.

**A normal `301` or `302` redirect to `chat.example.com` is not a reliable substitute.** Telium and third-party clients may not follow discovery redirects; the result at the account domain needs to be a successful JSON response.

## 4. Test it before registering anyone

From a different machine, replacing the examples:

```sh
# Check the website domain. We deliberately do not follow redirects.
curl -i --max-redirs 0 https://example.com/.well-known/telium/server

# Confirm that the actual Telium API is reachable.
curl -fsS https://chat.example.com/_telium/v1/capabilities

# Compare against Telium's own discovery document.
curl -fsS https://chat.example.com/.well-known/telium/server
```

You want **HTTP 200**, valid JSON (preferably `Content-Type: application/json`), `server_name` matching your account domain, and `api` matching your server's public URL. Both domains must use valid HTTPS.

Next open [telium.chat](https://telium.chat), choose your own server, and enter **`example.com`** — not `chat.example.com`. Create the first account. The address should be `@you:example.com`. Test a second account or a friend on another home server to confirm federation.

**Joining the public directory?** Submit your **account domain** (`example.com`) at [telium.chat/list](https://telium.chat/list). The directory discovers the real API URL from your file.

## For public servers: keep discovery current

The tiny file above is enough to explain the basic mapping but is only a subset of the full Telium document. If your server changes signing keys, capabilities, compatibility versions, referral policy, failover or relocation state, a hand-maintained copy can get stale.

For a public service, choose one of these:

- **A live reverse proxy at the website host.** Serve only `/.well-known/telium/server` from the Telium backend, leaving every other website path alone. This works with a proxy you control, such as Caddy or nginx.
- **An edge/serverless function** supported by your website host, which fetches and returns the backend's complete JSON. This incurs whatever request limits the provider imposes.
- **A static file you update** whenever relevant discovery fields change. The basic static example is the simplest, but you are responsible for maintaining compatibility and notices. To mirror all fields, copy the **full** JSON from the backend's discovery endpoint rather than assuming the minimal example includes everything.

### Live reverse proxy example (Caddy)

If the website and API are served through a Caddy proxy you control, a path-specific route can provide up-to-date discovery without touching the rest of the website:

```caddyfile
example.com {
    handle /.well-known/telium/server {
        reverse_proxy 127.0.0.1:8448
    }

    handle {
        reverse_proxy 127.0.0.1:3000
    }
}

chat.example.com {
    reverse_proxy 127.0.0.1:8448
}
```

Replace `127.0.0.1:3000` with the address of **your existing website**, and use the actual Telium upstream. This example assumes both services are on the same host. A site hosted elsewhere needs a different reverse-proxy topology.

### Optional Cloudflare Pages Function (advanced)

If you specifically use Cloudflare Pages and can deploy Functions through **Git or Wrangler** (not dashboard drag-and-drop), create `functions/.well-known/telium/server.js` in the **website project root**, outside the static output folder:

```js
export async function onRequestGet() {
  const upstream = await fetch(
    "https://chat.example.com/.well-known/telium/server",
    { headers: { Accept: "application/json" } },
  );

  if (!upstream.ok) {
    return new Response("Discovery unavailable", {
      status: 502,
      headers: { "Cache-Control": "no-store" },
    });
  }

  return new Response(upstream.body, {
    status: 200,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Access-Control-Allow-Origin": "*",
      "Cache-Control": "public, max-age=60",
    },
  });
}
```

Remove the static `.well-known/telium/server` file if using this Function, so there is just one source for that route. Replace the backend hostname in the code.

**Restrict Function invocations to that path**, so ordinary static website visits don't consume Functions requests. Put a `_routes.json` file in the website **build output** (or use your framework's equivalent), and ensure it contains these effective rules:

```json
{
  "version": 1,
  "include": ["/.well-known/telium/server"],
  "exclude": []
}
```

If your framework already generates `_routes.json`, **merge** rather than overwrite its routing rules. Pages Functions request quotas apply to the routed calls; check [Cloudflare's deployment requirements](https://developers.cloudflare.com/pages/functions/get-started/) and [routing rules](https://developers.cloudflare.com/pages/functions/routing/). This is optional: there is no need to add Functions merely to use a website domain for Telium.

## Troubleshooting

| What happens | What to check |
| --- | --- |
| `/.well-known` shows your homepage | The file wasn't deployed, or a site-wide rewrite caught it |
| 404 or 403 | Wrong document root, hidden dot-directory restriction, incorrect permissions or host configuration |
| The file downloads | Configure `Content-Type: application/json` for this path |
| HTTP 301 or 302 | Redirect/canonical-host rules are intercepting the discovery path; test the final HTTPS account domain directly |
| The client connects to the wrong server | `server_name` / `api` differs between the file and `telium.toml` |
| Basic sign-in works but a federation feature fails | Static discovery may lack keys, capabilities or other fields; use a full current response |
| You can't create `.well-known` files | Your website provider may not support arbitrary assets; use its custom endpoint feature or a different website setup |

## Frequently asked questions

**Is this a redirect?** In everyday terms, it *points* Telium at another hostname. Technically, it's a JSON document, **not an HTTP redirect**.

**Does the website need to run Telium?** No. Your website serves one file. The backend handles account logins, messages and uploads.

**Do I need Cloudflare or Git?** No. A file manager, FTP/SFTP, manual upload, normal website build or capable web server works.

**Can the backend use Cloudflare Tunnel?** Yes for Telium's HTTP and WebSocket endpoints. A tunnel does not carry SFU/TURN UDP media; see [SFU](/self-hosting/sfu/).

**What if the API is on a completely unrelated domain?** Telium can discover an HTTPS API URL, but some integrations (including the bot SDK) restrict requests to the same hostname or a subdomain for security. `example.com` with `chat.example.com` is the most compatible setup.

**What if I already have accounts at `@alice:chat.example.com`?** Don't edit `server_name` in place. See [Relocation](/self-hosting/relocation/) and [Migration](/federation/migration/).

**Next:** If you are opening signups to strangers, read [Run a public homeserver](/self-hosting/public-server/) for upload limits, retention, moderation and listing.
