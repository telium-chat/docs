---
title: Install with Cloudflare Tunnel
description: Run a Compose homeserver without opening inbound HTTP ports.
sidebar:
  order: 4
---

Use this only if you already use Cloudflare Tunnel and want Docker Compose. The tunnel carries homeserver HTTP and WebSockets. **It does not carry SFU UDP media.**

## Requirements

- Linux with Docker, Compose v2 and systemd
- A Cloudflare-managed hostname
- An ordinary operator account with `sudo`

## 1. Install the tunnel kit

```sh
git clone https://github.com/telium-chat/telium.git
cd telium
sudo ./deploy/install.sh chat.example.com
```

The kit is installed in `/opt/telium`, with an automatic updater and preserved configuration files. It requires a Cloudflare Tunnel token before the tunnel service can start.

## 2. Connect Cloudflare Tunnel

In Cloudflare's tunnel dashboard, route `chat.example.com` to **`http://172.31.240.3:8448`** (the server container's address on the kit network). Then create the local token file:

```sh
read -rsp 'Cloudflare Tunnel token: ' TOKEN; printf '\n'
sudo install -m 600 /dev/null /opt/telium/tunnel.env
printf 'TUNNEL_TOKEN=%s\n' "$TOKEN" | sudo tee /opt/telium/tunnel.env >/dev/null
unset TOKEN
```

The prompt hides the token and keeps it out of shell history. Restrict access to `tunnel.env` and never commit it to Git.

```sh
cd /opt/telium
sudo docker compose up -d
sudo docker compose ps
curl -fsS https://chat.example.com/.well-known/telium/server
```

## 3. Register and secure it

The tunnel kit's config starts with open registration. Register your operator account through [telium.chat](https://telium.chat), verify your admin access, then set `[registration] open = false` in `/opt/telium/telium.toml` and recreate the server container.

Check [backups and updates](/self-hosting/after-setup/) before inviting users. The tunnel provider may have a lower HTTP upload limit than Telium.

## Using your website domain for accounts

If your website stays at `example.com` but you want accounts like `@you:example.com`:

1. Install the kit with **`chat.example.com`**, the tunnel hostname.
2. Before registering, edit `/opt/telium/telium.toml`:

```toml
server_name = "example.com"
public_base_url = "https://chat.example.com"
```

3. Recreate the server and [publish `/telium.txt` on your website](/self-hosting/domain-delegation/). Keep the website's DNS pointing at its original host.

## Troubleshooting

| Problem | Check |
| --- | --- |
| No public connection | Tunnel token and the `http://172.31.240.3:8448` route |
| Rate limits shared by all users | `rate_limit.trusted_proxies` needs the tunnel peer `172.31.240.2` |
| Upload returns HTTP 413 | Your tunnel provider's upload limit |
| SFU calls fail | A tunnel cannot carry SFU media; host the relay on reachable TCP/UDP ports |

**Next:** [After setup](/self-hosting/after-setup/).