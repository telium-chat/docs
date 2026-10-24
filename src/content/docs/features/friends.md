---
title: Friends and presence
description: Friend requests, blocks, presence and mutual friends across Telium servers, and what each one reveals.
sidebar:
  order: 2
---

Friends, blocks, presence and mutual friends work across servers without a shared friendship database. Each account home stores its own user's side of every relationship.

## Relationship states

Your home keeps one row per peer, in one of four states:

| State | Meaning |
| --- | --- |
| `pending_out` | You sent a request. |
| `pending_in` | You received a request. |
| `accepted` | You are friends. |
| `blocked` | You blocked this account. |

For a friend on another server, your home commits its own row first, then sends a signed relay so the peer's home updates its row. During an outage the two sides can disagree for a while; the relay retries with backoff. If two people request each other, both requests settle into a friendship.

## Routes

| Method and path | Action |
| --- | --- |
| `GET /_telium/v1/friends` | List your relationships. |
| `POST /_telium/v1/friends` | Send a request. |
| `POST /_telium/v1/friends/{user_id}/accept` | Accept a request. |
| `DELETE /_telium/v1/friends/{user_id}` | Remove a friend or cancel or decline a request. |
| `PUT` / `DELETE /_telium/v1/friends/{user_id}/block` | Block or unblock. |
| `GET /_telium/v1/friends/mutual/{user_id}` | Mutual friends with another account. |

## Limits

| Limit | Value |
| --- | --- |
| Friends plus pending requests per account (blocks excluded) | 1000 |
| Incoming pending requests per account | 200 |
| Incoming pending requests from one server | 50 |
| Outgoing request rate | Burst of 10, then one every six seconds |

Over the incoming limits, the sender sees "that account is not taking new requests". Before a request is created, your home checks that the target exists and is active. A deactivated or moved account returns an error, and a move names the new address.

## Blocks

A block is private to your home. The blocked person's home is told only that the relationship ended, never that it was a block, so it keeps working when their server is hostile or offline. Unblocking does not restore the old friendship. You cannot send a request to someone you have blocked until you unblock them.

## Presence

Only accepted friends receive your presence through your home. Pending requests and blocked accounts do not. Guild members see your presence inside guilds you share, which is separate from friendship.

Your public profile page shows presence only if your settings allow it. See [Rich presence](/docs/features/rich-presence/) for activity status.

## Mutual friends

Your friend list never leaves your home. To find mutuals with Bob, your home sends each server that hosts one of your friends a signed question naming only you and Bob. That server answers with its own accounts that have accepted both of you. Your home then drops any answer that is not on your friend list or not hosted on the server that answered.

The lookup still reveals some things:

- Each server you ask learns that you looked at Bob, and when. There is one request per server domain in your friend list.
- A friend can appear as a mutual to a stranger without being asked. Only blocks limit it: you get no mutuals for someone you blocked, and Bob's home returns none of its accounts if Bob blocked you.
- A server that answers learns nothing about friends who are not mutual.

Pending requests do not count as mutual friends. The profile loads mutuals only when you open that section, and an unreachable server shows as unavailable instead of zero.

## Mutual guilds

The client asks only the guild servers of guilds you are already in whether the other person is a member there. Neither account home is asked for a guild list.

## Migration

Moving your account to another server carries all relationship rows, including blocks. See [Migration](/docs/federation/migration/).
