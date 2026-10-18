---
title: Telemetry
description: The anonymous daily summary a server can send the Merran project, what's in it, what's kept, and how to turn it off.
sidebar:
  order: 10
---

:::note[From 0.1.0-alpha.2]
Telemetry is offered from 0.1.0-alpha.2. In 0.1.0-alpha.1 the switch exists, but the Merran project wasn't collecting until October 18, 2026, so a server with it on showed a failed **Sending the daily summary** job each day until then. Its summaries arrive now.
:::

Telemetry is off unless the server admin turns it on. When it's on, Merran sends the Merran project one anonymous summary a day, which helps the project see how many servers run Merran, on which versions, and which parts get used. The totals from every server are on the [telemetry totals](../../../telemetry/) page.

## Turning it on or off

- **After setup:** the first time the server admin opens Merran, it asks **Help improve Merran?** Choose **Yes, send it** or **No thanks**. It's asked once; closing it without choosing asks again next time.
- **Any time after:** **Settings → This server → Telemetry**, with the switch **Send an anonymous summary once a day**. **See exactly what's sent** shows the next summary, exactly as it would go.
- **For good:** set `MERRAN_TELEMETRY=off`. Merran doesn't ask, and the switch can't be changed in the app.

Once it's on, the card says when the last summary was sent, or why it wasn't. If the project's receiver can't be reached, Merran tries again the next day; that's not a failed job.

## What's sent

:::note[Not released yet]
The question's **See exactly what would be sent** preview and retry guidance are in development. A failed status request offers **Try again**; it does not enable telemetry. The offer waits while another dialog or a guided tour is open. Receiver availability in the build controls whether telemetry is offered; a temporary network outage alone does not hide the question.
:::

- A random install id, made by your server and not taken from anything. **Make a new id** starts afresh: later summaries can't be linked to earlier ones.
- The Merran version, how it's installed (the Docker image, or from source), the CPU architecture, and the database (SQLite, or Postgres and its major version).
- Which modules are on, each yes or no.
- Which kinds of AI provider have a key anywhere on the server (Anthropic, OpenAI, Google, an OpenAI-compatible address), not the keys or models.
- Counts as ranges, never exact: households (1, 2–5, 6–20, 21 or more), people and recipes.

Never sent: names, usernames, emails, recipes, addresses, keys, or anything anyone typed. The summary goes once a day, some time between 4:41 and 7:41 in the morning, server time.

## What's kept

The project's receiver is open source, in the Merran repository as [`apps/telemetry`](https://github.com/merran-app/merran/tree/main/apps/telemetry), and runs on Cloudflare Workers at `telemetry.merran.app`.

- **One row for your server:** the summary's fields, the day it first reported and the day it last reported. Each summary replaces the last; there's no history of what your server sent.
- **Counted for a week** after its last summary, and **deleted 30 days** after it. **Make a new id**, or turning telemetry off, asks the receiver to delete the old row with the next day's run.
- **Never kept:** your IP address, the request's headers, the time of day, or request logs. Cloudflare sees the address to deliver the request, as any host would.
- **The totals page** shows releases by name, and folds anything fewer than five servers report into "Other".
