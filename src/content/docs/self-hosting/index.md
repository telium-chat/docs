---
title: Self-host Telium
description: Find the right guide to run a homeserver, a voice relay (SFU), or both.
---

You can host a **Telium homeserver** for accounts and communities, a **voice relay (SFU)** to carry audio and video calls, or both. They're separate services, so you don't have to run one to run the other.

## Host a homeserver

A homeserver manages accounts, communities, messages and uploaded files. **Keep registration private** for yourself or invited people, or **open it to the public** so others can create accounts. Private registration doesn't stop your members from participating in other Telium communities.

- **[Set up a homeserver](/self-hosting/production/)** — choose a native Linux or Docker installation and get your server online.
- **[After-setup checklist](/self-hosting/after-setup/)** — check registration, backups, updates and other essentials once it's running.
- **[Run a public homeserver](/self-hosting/public-server/)** — prepare for people you don't know to sign up, including upload limits, file retention and joining the public directory.
- **[Use your website domain for Telium accounts](/self-hosting/domain-delegation/)** — keep your existing website and Telium server on separate hosts while using your website domain for account addresses.

## Host a voice relay (SFU)

An **SFU** forwards voice, video and screen sharing between people in calls. It doesn't host accounts or communities. **Private relays** accept calls only from homeservers you trust; **public relays** can serve other Telium homeservers across the network. Listing a public relay in the directory is a separate, optional step.

- **[Understand SFUs and choose a setup](/self-hosting/sfu/)** — learn how relays work, when you might want one and how to install one directly on Linux.
- **[Run a standalone SFU with Docker](/self-hosting/sfu-docker/)** — deploy a voice relay without installing a homeserver, including guidance for running multiple containers.

:::tip[Do I need to host both?]
No. A homeserver can use available relays from the public SFU directory, and an SFU can serve other homeservers without hosting any accounts of its own.
:::
