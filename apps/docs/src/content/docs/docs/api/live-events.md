---
title: Listen for live changes
description: Consume household-scoped server-sent events and refresh data safely after reconnecting.
---

Merran's `/api/events` stream tells a client which household area changed. It uses server-sent events (SSE), not WebSockets, and does not send complete recipe/list objects. This describes alpha.1; authenticated `ready`, a recipe mutation event, and a fresh connection after disconnect were verified against the release image.

## Before you start

Create an API key with read permission for the areas you need: `recipes`, `plan`, `list`, `pantry`, or `household`. A write permission includes read for that area. Keep bearer keys in a server-side integration or a private local script. Native browser `EventSource` cannot set an arbitrary Authorization header; do not work around that by putting a key in a URL.

## Open a stream

With the environment variables from the [integration tutorial](../practical-integration/):

```bash
curl --no-buffer --fail-with-body --max-time 90 \
  "$MERRAN_URL/api/events?client=recipe-index-demo" \
  -H "Authorization: Bearer $MERRAN_API_KEY" \
  -H 'Accept: text/event-stream'
```

**Expected result:** An `event: ready` frame with the permitted areas, followed by events as relevant data changes. `curl` exits on the deliberate 90-second limit; this timeout alone is not a server failure.

```text
event: ready
data: {"areas":["recipes"]}
```

Open the same household in Merran and edit a recipe. A recipe-reading key should receive a `recipes` event; fetch the affected area again using its normal API. A key that cannot read recipes will not receive that area's changes.

## Interpret frames

| Event                                            | Meaning                                                                                               |
| ------------------------------------------------ | ----------------------------------------------------------------------------------------------------- |
| `ready`                                          | The stream opened; `areas` lists what this connection can hear.                                       |
| `recipes`, `plan`, `list`, `pantry`, `household` | That area changed. Data contains `area` and `by`; refetch rather than treating it as an object patch. |
| `presence`                                       | Signed-in people entered or left a page. API keys are not registered as people viewing a page.        |
| `ping`                                           | Keepalive, sent roughly every 25 seconds; its data can be empty.                                      |

An SSE parser must handle frames split across network chunks, multiple frames in a chunk, and empty ping data. Do not JSON-parse every received chunk as if it were a full event.

For clients that also write data, supply the same client identifier in the stream's `client` parameter and each write's `X-Merran-Client` header. The connection then suppresses echoes of its own changes. Distinct devices should use distinct identifiers; a shared identifier can hide changes from each other.

## Reconnect and recover

The stream does not provide a replay cursor or durable event history. After reconnecting, fetch a fresh snapshot of each permitted area, then continue processing events. Use bounded reconnect backoff, close unused streams, and respect authentication failures and rate limits instead of reconnecting continuously. Coalesce bursts of events so one busy household does not produce unnecessary API requests.

A proxy must pass streaming responses without buffering and allow an idle period longer than the ping interval. Merran sends `Cache-Control: no-cache, no-transform` and `X-Accel-Buffering: no`. See [HTTPS and remote access](../../run/https-and-remote-access/).

If the connection opens but nothing changes, check household scope, permission, the client identifier used on writes, and whether the edited area matches your permissions. If only delayed batches arrive, check proxy buffering. For 401/403, repair the key or permissions before reconnecting.
