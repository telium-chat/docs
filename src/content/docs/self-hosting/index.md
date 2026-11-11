---
title: Self-host Telium
description: Choose between a homeserver and a voice relay, then follow one installation guide.
---

There are two services you can host. **You can run either without running the other.**

| Service | What it does | Install |
| --- | --- | --- |
| **Homeserver** | Hosts accounts, messages, communities and files. Can be private or accept public signups. | [Homeserver setup](/self-hosting/production/) |
| **Voice relay (SFU)** | Carries audio, video and screen sharing. Can serve only trusted servers or anyone on the network. | [SFU setup](/self-hosting/sfu/) |

## Homeserver

1. [Choose native or Docker installation](/self-hosting/production/).
2. [Finish setup](/self-hosting/after-setup/): register, set administrator access, verify backups and updates.
3. If you want strangers to create accounts, follow the [public homeserver checklist](/self-hosting/public-server/) **before opening registration**.

For an existing website such as `example.com`, you can run the server at `chat.example.com` while keeping usernames at `@name:example.com`. Set this up [before the first account is created](/self-hosting/domain-delegation/).

## Voice relay (SFU)

Use the [native SFU installer](/self-hosting/sfu/#install-with-the-script) or the [standalone Docker SFU guide](/self-hosting/sfu-docker/). Neither requires a homeserver.

**Private** means only the homeservers you trust can use the relay. **Public** means other Telium servers can use its capacity. You choose during setup or in the SFU configuration.

For configuration, storage, recovery and other operations, use the **Advanced operations** section in the sidebar.