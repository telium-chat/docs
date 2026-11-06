---
title: Use your website domain for Telium accounts
description: Keep your website on Cloudflare Pages while Telium runs on a subdomain, using a simple .well-known file.
---

Want your website at `example.com`, your Telium server at `chat.example.com`, and usernames like `@alex:example.com`? **You can do that.** Your website and your Telium server do not have to run on the same machine or hosting provider.

The trick is a small file at `https://example.com/.well-known/telium/server`. When someone enters `example.com` as their account server, Telium reads that file and discovers where your **actual server** lives.

**Most people with an existing website should start with [Cloudflare Pages: the easy way](#cloudflare-pages-the-easy-way).** No Cloudflare Worker, DNS trick, or special Telium client installation is required for the basic setup.

## What this looks like

| Thing | Example | Where it lives |
| --- | --- | --- |
| Your regular website | `https://example.com` | Cloudflare Pages |
| Your Telium API | `https://chat.example.com` | VPS, home server or Cloudflare Tunnel |
| Your Telium address | `@alex:example.com` | Uses **your website's domain**, not your API's hostname |
| Tiny discovery file | `https://example.com/.well-known/telium/server` | Cloudflare Pages |

The file tells Telium: **“Accounts belong to example.com. Connect to chat.example.com.”** It is not an HTTP 301/302 redirect: the file itself returns JSON. Your normal website keeps working, and you do not route the rest of your traffic through the Telium server.

:::caution[Choose your account domain first]
The part after the colon in `@alex:example.com` is your server's long-term identity. **Set this up before anyone creates an account.** Changing `server_name` on an established server is not a normal configuration edit. See [Relocation](/self-hosting/relocation/) if you already have users.
:::

## Cloudflare Pages: the easy way

These instructions assume you already have a Cloudflare Pages project serving `example.com` and want Telium on `chat.example.com`. If your website uses another static host, the idea is the same.

### Step 1. Make Telium reachable on its subdomain

Set up the Telium server using any of the [production installation methods](/self-hosting/production/). Give the server a public HTTPS address such as `https://chat.example.com`, using Caddy, nginx, or a Cloudflare Tunnel.

Your Telium configuration must distinguish the **account name** from the **connection address**:

```toml
server_name = "example.com"
public_base_url = "https://chat.example.com"
```

The local `bind` value can stay as the install guide provides (for example, `127.0.0.1:8448`). The [native](/self-hosting/install-systemd/#using-your-website-domain-for-accounts), [Compose](/self-hosting/install-docker/#using-your-website-domain-for-accounts), and [tunnel](/self-hosting/install-docker-tunnel/#using-your-website-domain-for-accounts) install pages tell you exactly where to edit these values.

**First check the server itself** (not the Pages website):

```sh
curl -fsS https://chat.example.com/.well-known/telium/server
```

The JSON response should include `"server_name": "example.com"` and `"api": "https://chat.example.com"`. If not, fix `telium.toml` or your server's HTTPS routing before continuing.

### Step 2. Make the discovery file in your website repo

In the **website's Git repository**, create the following path:

```text
public/
  .well-known/
    telium/
      server
```

**Important:** The file is literally named `server`, with **no `.json` extension**. The URL must be `/.well-known/telium/server`, not `/server.json`.

For most frameworks used with Pages (including Astro and Vite), `public/` is the folder for files copied directly into the deployed website. If your Pages project deploys a plain HTML directory without a build, create `.well-known/telium/server` in that deployed directory instead. Your **built output** must contain the folder at its root.

Open the new `server` file and paste:

```json
{
  "server_name": "example.com",
  "api": "https://chat.example.com",
  "gateway": "wss://chat.example.com/gateway/v1",
  "protocol_version": "v1"
}
```

Replace both example domains with yours. Keep the `https://` and `wss://` schemes. Save the file.

**What the fields mean:** `server_name` controls the addresses people register under, `api` is the actual backend, `gateway` is its WebSocket connection, and `protocol_version` describes compatibility with the current v1 protocol. The Telium server must agree with these values.

This is a **minimal static discovery document** intended to demonstrate basic account and server discovery. It does not automatically include the live server's signing keys, protocol capability list, failover or relocation notices, or onboarding preferences. Telium can fetch federation keys separately from its API, but some newer federation features depend on the additional discovery fields. For the **full, future-proof document** on a public server, use [the live Pages Function option](#optional-keep-the-discovery-file-up-to-date-automatically) below instead of maintaining this minimal file indefinitely.

### Step 3. Tell Pages that this file is JSON

An extensionless file might otherwise be served with an unsuitable content type. Add a file named `public/_headers` (or put `_headers` in the root of your site's build output):

```text
/.well-known/telium/server
  Content-Type: application/json; charset=utf-8
  Access-Control-Allow-Origin: *
  Cache-Control: public, max-age=300
```

This applies the headers only to the discovery URL. [Cloudflare documents `_headers` here](https://developers.cloudflare.com/pages/configuration/headers/).

If your site already has a `_headers` file, **append** this rule rather than replacing existing website headers.

### Step 4. Deploy the Pages website

1. Commit and push the new `server` and `_headers` files to the Git branch Cloudflare Pages deploys.
2. Open **Cloudflare Dashboard → Workers & Pages → your Pages project → Deployments** and confirm the deployment finished.
3. Under **Custom domains**, make sure `example.com` is connected to this Pages project. Your regular website should still load.
4. Open `https://example.com/.well-known/telium/server` in a browser. You should see the JSON you wrote, not a 404 page or your site's normal HTML.

You do **not** need to change the DNS record for `example.com` from Pages to your VPS. Only `chat.example.com` needs to point to your Telium API's HTTPS ingress.

### Step 5. Test the real signup path

From a machine outside your server's local network:

```sh
# Must return 200 and JSON, not a redirect.
curl -i --max-redirs 0 https://example.com/.well-known/telium/server

# Must answer from the actual Telium server.
curl -fsS https://chat.example.com/_telium/v1/capabilities
```

Confirm that the first response has `Content-Type: application/json` and that `server_name` and `api` match your configuration.

Then open [telium.chat](https://telium.chat), choose your own server, **enter `example.com` (not `chat.example.com`)**, and create your first account. It should look like `@alex:example.com`.

After that, test a login, a guild, and a friend or invited user on a **different** home server to check federation.

:::tip[Keep the names straight]
If you [list your server publicly](https://telium.chat/list), submit `example.com`, because that is your account domain. Telium's directory will read the `.well-known` file to discover `chat.example.com` automatically.
:::

### Avoid these common mistakes

| Symptom | Likely cause |
| --- | --- |
| `/.well-known/telium/server` returns your homepage | Your SPA fallback caught the request; the extensionless asset wasn't included in the deployed output |
| It downloads as a file or isn't valid JSON | Missing or incorrect `_headers` `Content-Type` rule, or invalid JSON |
| You get 301 or 302 | A redirect rule, canonical-URL rule or `_redirects` file is intercepting this path |
| Discovery returns `@alex:chat.example.com` instead | `server_name` is still set to the API hostname |
| It finds the server but cannot sign in | Check HTTPS and WebSocket access to the `api`/`gateway` URLs, plus registration state |
| API works but federation is missing features | The static minimal document doesn't publish all current protocol/capability fields; use the live option below |

**Don't use a normal redirect rule to point the discovery URL at the backend.** You want to return a JSON document that **names** the backend. A `301` or `302` is a different protocol behavior, and federation code may not follow that redirect. Cloudflare Pages' `_redirects` `200` proxying also does not support proxying external domains: this isn't a way to turn the JSON document into a cross-domain reverse proxy.

## Optional: keep the discovery file up to date automatically

For a **public home server**, serving the **complete live JSON** is better than the minimal static file: the server can publish new signing keys, protocol capabilities, referral settings, failover and relocation information without you editing Pages each time.

Cloudflare Pages can do that using a single **Pages Function**. It leaves the rest of your website static.

### Step 1. Remove the static `server` file

Remove `public/.well-known/telium/server` if you created it above. The Pages Function will now serve that URL.

### Step 2. Create a tiny Pages Function

At the **root of your website repository** (beside `public/`, **not inside it**), create:

```text
functions/
  .well-known/
    telium/
      server.js
```

Put the following code in `server.js`:

```js
export async function onRequestGet() {
  const upstream = await fetch(
    "https://chat.example.com/.well-known/telium/server",
    { headers: { Accept: "application/json" } },
  );

  if (!upstream.ok) {
    return new Response("Telium discovery is temporarily unavailable", {
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

Replace `chat.example.com` with your Telium API address. Pages reads the file's path as the URL route, so this handler responds only at `/.well-known/telium/server`. It **fetches the full live discovery response** from your server without giving the browser a redirect or proxying the rest of the API through your website.

**For the Pages site's other URLs, keep using static files.** Do not add a catch-all Function. If you are using a framework that generates a `_routes.json`, ensure this discovery path actually invokes the Function. The [Pages Functions routing guide](https://developers.cloudflare.com/pages/functions/routing/) describes the matching rules.

### Step 3. Deploy and verify

Commit and push your change, then run the same `curl` tests from [Step 5](#step-5-test-the-real-signup-path). To confirm the response is live, compare the `.well-known` JSON on both domains after a server change.

**Tradeoff:** A Pages Function uses the Cloudflare Workers request quota, unlike a static Pages file. The current Free allowance is shared with Workers (100,000 requests/day), so this is not an unlimited-function option. Only discovery requests need invoke this Function, not every website visit. See [Cloudflare's Functions pricing](https://developers.cloudflare.com/pages/functions/pricing/). If you specifically want **zero function invocations**, keep the static method and maintain it when server metadata or protocol capabilities change.

## Alternative: serve the live document through a traditional proxy

If your website already uses a path-aware proxy such as Caddy, you can serve the live discovery JSON without Cloudflare Pages Functions:

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

The website backend `127.0.0.1:3000` is only an example; replace it with your existing site upstream. This requires the website domain to route through that proxy, so it is **not** the usual choice when `example.com` stays on Cloudflare Pages.

## Frequently asked questions

**Do I need to move my website away from Cloudflare Pages?** No. Your website stays where it is. Only one special path must respond with discovery JSON.

**Is the file a redirect?** Conceptually it directs Telium to the right backend, but technically **no**: it is a JSON document with an `api` URL, not an HTTP redirect response.

**Can `chat.example.com` use Cloudflare Tunnel?** Yes. Tunnel supports homeserver HTTP and WebSocket traffic, including login, guild messages and media uploads within the provider's limits. It does **not** carry SFU or TURN UDP media; see [SFU](/self-hosting/sfu/).

**Can the API use a totally different domain I own?** Standard Telium federation and clients discover the advertised HTTPS API address, but some clients and integrations (including the current JavaScript bot SDK) restrict delegation to the same domain or one of its subdomains to protect credentials. **The safest documented setup is `example.com` → `chat.example.com`.**

**Can I do this after people already registered as `@alex:chat.example.com`?** Do not change `server_name` in place. Their account addresses already have an identity. Use [Relocation](/self-hosting/relocation/) and [Migration](/federation/migration/) instead.

**Next:** If you want to accept strangers' registrations, read [Run a public homeserver](/self-hosting/public-server/) for upload limits, retention, abuse reporting and the listing wizard.
