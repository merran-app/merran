---
title: Webhooks
description: Tell Home Assistant, n8n and other tools when things happen in your kitchen, and check that each message came from your Merran.
sidebar:
  order: 7
---

A webhook is an address Merran sends a message to when something happens. Add one from Home Assistant, n8n or any tool that can receive a web request, pick the events you want, and that tool hears about them as they happen.

Merran sends these events:

| Event                                | When                                      |
| ------------------------------------ | ----------------------------------------- |
| [`recipe.created`](#recipecreated)   | A recipe is added                         |
| [`recipe.updated`](#recipeupdated)   | A recipe is changed                       |
| [`recipe.deleted`](#recipedeleted)   | A recipe goes to Recently deleted         |
| [`recipe.restored`](#reciperestored) | A recipe comes back from Recently deleted |
| [`webhook.test`](#webhooktest)       | Someone chooses **Send a test**           |

More events, for cooking, the plan, the list and the pantry, are planned. A webhook set to **Everything, including events added later** hears them when they arrive.

## Before you start

- You need to be an **Owner** or **Admin** of the household. Members don't see webhooks.
- A server admin can turn webhooks off for the whole server, with the **Let households send webhooks** switch in **Settings → Server → Webhooks** or `MERRAN_WEBHOOKS=false`. Then the **Webhooks** card is hidden, and saved webhooks are kept for later.
- Set the server's public address (`MERRAN_PUBLIC_URL`) if you want each recipe's `url` in the messages. Without it, `url` is `null`.
- Webhooks are managed in the app only. API keys can't add, change or read them.
- A household can have up to 10 webhooks, and each can have up to 5 extra headers.

## Add a webhook

1. Open **Settings → Household** and find the **Webhooks** card, after **Invitations**.
2. Choose **Add webhook**.
3. Enter a **Name**, like `Home Assistant`, so you can tell it apart in the list.
4. Enter the **Address** the other tool gave you. It must start with `http://` or `https://`, can't have a user name or password in it (use a header instead), and is sealed like the server's other secrets once saved.
5. Under **Events**, tick the ones you want, or choose **Everything, including events added later**.
6. If the tool wants a token or password in a header, choose **Add a header** under **Extra headers** and fill in its name and value. Header values stay sealed: to change them later, fill in every value again.
7. Save it. Merran shows **Here's the secret**: copy it into the tool that checks signatures. You can show it again later with **Show secret**.
8. Open the webhook and choose **Send a test**. Merran sends a `webhook.test` event once and shows the answer.

Each webhook in the list shows its name, the host it sends to, how many events it wants, and its state:

- **Working**: deliveries are arriving.
- **Failing**: a delivery didn't go through and Merran is trying again.
- **Paused**: Merran has stopped sending. See [Retries and pausing](#retries-and-pausing).

Open a webhook to see its **Deliveries**, and to **Edit**, **Pause** or **Resume**, **Rotate secret**, **Show secret** or **Delete** it.

## The home network

Home Assistant usually lives on your home network, which Merran refuses by default: on a server shared with others, any household could otherwise make Merran call machines on your network. A server admin allows it in one of two ways:

- In **Settings → Server → Webhooks**, set **Webhooks to the home network** to **Off** (the default), **Every household** or **Chosen households**, and pick the households. Or set `MERRAN_WEBHOOKS_HOME_NETWORK` to `off`, `all` or `chosen`, which locks the setting in the app.
- When the server admin adds a webhook for a household that isn't allowed yet, the form shows **Allow the home network for this household**, so on a server with one household it takes one tick.

Without permission, saving an address on the home network fails with "This address is on your home network. The server admin can allow that in Settings → Server → Webhooks." Merran checks again on every send, so a name that starts pointing at your home network later is refused too.

Use Home Assistant's IP address, like `http://192.168.1.20:8123/api/webhook/…`, rather than `homeassistant.local`. That name often doesn't resolve from inside Docker.

## Home Assistant

This automation announces a new recipe. Its webhook trigger gives you the message as `trigger.json`.

1. In Home Assistant, make an automation with a **Webhook** trigger. It shows you the webhook id and the address, `http://<home-assistant-ip>:8123/api/webhook/<webhook id>`.
2. In Merran, add a webhook with that address and tick **A recipe is added** (`recipe.created`).
3. Use this in the automation's YAML, with your own webhook id and speaker:

```yaml
alias: Announce new recipes
triggers:
  - trigger: webhook
    webhook_id: merran-recipes-9f3c1a7e5b2d
    allowed_methods:
      - POST
    local_only: true
conditions:
  - condition: template
    value_template: "{{ trigger.json.type == 'recipe.created' }}"
actions:
  - action: tts.speak
    target:
      entity_id: tts.home_assistant_cloud
    data:
      media_player_entity_id: media_player.kitchen
      message: "A new recipe was added: {{ trigger.json.data.recipe.title }}"
```

The template condition lets one webhook serve several events: only the ones whose `type` it names run the actions. `local_only: true` makes Home Assistant refuse requests from outside your home network, which is where Merran is.

Home Assistant's webhook trigger checks no signature. The webhook id in the address is the secret: whoever has the address can start the automation, so choose a long random id and don't share it. Merran seals the address when it's saved.

## n8n

1. In n8n, add a **Webhook** node. Set **HTTP Method** to `POST` and copy its **Production URL**.
2. In Merran, add a webhook with that address and the events you want.
3. To make n8n refuse anyone but Merran, set the Webhook node's **Authentication** to **Header Auth**, make a credential with a name like `x-merran-key` and a long random value, and add the same name and value in Merran under **Extra headers**.
4. To check each message came from your Merran, add a **Code** node after the Webhook node. Turn on **Raw Body** in the Webhook node's options so the Code node can read the exact text Merran signed. Then check the signature with [`standardwebhooks`](#check-signatures):

```js
const { Webhook } = require("standardwebhooks")

const secret = "whsec_…" // From Show secret. Better: an n8n credential or variable.
const item = $input.first()
// The raw body, exactly as Merran signed it.
const payload = (await this.helpers.getBinaryDataBuffer(0, "data")).toString(
  "utf8"
)

// Throws if the signature or timestamp is wrong, which stops the workflow.
new Webhook(secret).verify(payload, {
  "webhook-id": item.json.headers["webhook-id"],
  "webhook-timestamp": item.json.headers["webhook-timestamp"],
  "webhook-signature": item.json.headers["webhook-signature"],
})

return [{ json: JSON.parse(payload) }]
```

n8n Cloud can't call your home network, and a self-hosted n8n beside Merran may need its container's address rather than `localhost`. If the Code node can't load `standardwebhooks`, a self-hosted n8n needs `NODE_FUNCTION_ALLOW_EXTERNAL=standardwebhooks` and the package installed.

## What each message looks like

Merran sends a `POST` with a JSON body and these headers:

- `content-type: application/json`
- `user-agent: Merran/<version> (+https://merran.app)`
- `webhook-id`: `msg_` and the event's id. It's the same on every try, so a receiver can ignore one it has handled already.
- `webhook-timestamp`: when this try was sent, in seconds since 1970.
- `webhook-signature`: see [Check signatures](#check-signatures).

The body always has the same three parts: `type`, `timestamp` (when it happened, which isn't always when it's sent: deliveries can arrive out of order) and `data`. Every `data` has:

- `household`: its `id` and `name`.
- `by`: who did it, with their `id` and `name`, or `null` when Merran did it on its own.
- `via`: how it was done. `app` is someone signed in, `api` is an API key or an OAuth connection on the REST API, `mcp` is an AI app connected with [MCP](../mcp/), and `merran` is Merran on its own.
- `key`: for `api` and `mcp`, the key or connection used, with its `id` and `name`, and `null` otherwise. A flow that changes things through the API can use `by` and `key` to ignore the event it caused.

Messages carry ids, names, titles and links, never whole recipes. Fetch more through the [API](../../api/) with your own key.

### recipe.created

Sent when a recipe is added: typed in, imported from a link, a page, text, photos or a video, sent from the [browser extension](../browser-extension/) or a share, or applied from a proposal. Links imported many at once send one each, but recipes brought in from another app or a Merran archive don't send it.

`origin` is how it was added: `manual`, `link`, `video`, `text`, `photo` or `assistant`. Pages, the extension and shares arrive as `link`. `sourceUrl` is where it came from, or `null`.

```json
{
  "type": "recipe.created",
  "timestamp": "2026-11-10T18:04:12.511Z",
  "data": {
    "household": {
      "id": "0199e8b0-5a10-7a01-8b00-000000000003",
      "name": "The Riveras"
    },
    "by": {
      "id": "0199e8b0-5a10-7a01-8b00-000000000001",
      "name": "Sam Rivera"
    },
    "via": "api",
    "key": {
      "id": "0199e8b0-5a10-7a01-8b00-000000000009",
      "name": "Merran extension"
    },
    "recipe": {
      "id": "0199e8b0-5a10-7a01-8b00-000000000006",
      "slug": "lemon-chicken",
      "title": "Lemon Chicken",
      "url": "https://merran.example.com/recipes/lemon-chicken"
    },
    "origin": "link",
    "sourceUrl": "https://example.com/lemon-chicken"
  }
}
```

### recipe.updated

Sent when someone saves edits to a recipe, applies a tidy-up or proposal, saves a swap, restores a version, or changes its photo, diets or what can be left out. `parts` says what changed: any of `details`, `ingredients`, `steps`, `tags`, `photo` and `diets`. Nothing is sent when nothing changed. Stars, cooking notes, tags changed on many recipes at once, renamed tags and background nutrition, photo and food-matching runs don't send it.

```json
{
  "type": "recipe.updated",
  "timestamp": "2026-11-10T18:20:41.093Z",
  "data": {
    "household": {
      "id": "0199e8b0-5a10-7a01-8b00-000000000003",
      "name": "The Riveras"
    },
    "by": {
      "id": "0199e8b0-5a10-7a01-8b00-000000000001",
      "name": "Sam Rivera"
    },
    "via": "app",
    "key": null,
    "recipe": {
      "id": "0199e8b0-5a10-7a01-8b00-000000000006",
      "slug": "lemon-chicken",
      "title": "Lemon Chicken",
      "url": "https://merran.example.com/recipes/lemon-chicken"
    },
    "parts": ["ingredients", "steps"]
  }
}
```

### recipe.deleted

Sent when a recipe goes to Recently deleted. Deleting it for good from there sends nothing more.

```json
{
  "type": "recipe.deleted",
  "timestamp": "2026-11-10T18:31:07.640Z",
  "data": {
    "household": {
      "id": "0199e8b0-5a10-7a01-8b00-000000000003",
      "name": "The Riveras"
    },
    "by": {
      "id": "0199e8b0-5a10-7a01-8b00-000000000001",
      "name": "Sam Rivera"
    },
    "via": "app",
    "key": null,
    "recipe": {
      "id": "0199e8b0-5a10-7a01-8b00-000000000006",
      "slug": "lemon-chicken",
      "title": "Lemon Chicken",
      "url": "https://merran.example.com/recipes/lemon-chicken"
    }
  }
}
```

### recipe.restored

Sent when a recipe comes back from Recently deleted. Its body is the same as `recipe.deleted`'s, with `"type": "recipe.restored"`.

### webhook.test

Sent only when someone chooses **Send a test**, and only to that webhook, even when it's paused. It's tried once, never retried, and never pauses the webhook. `webhook` is the webhook it was sent to, and `by` the person who sent it.

```json
{
  "type": "webhook.test",
  "timestamp": "2026-11-10T18:02:55.208Z",
  "data": {
    "household": {
      "id": "0199e8b0-5a10-7a01-8b00-000000000003",
      "name": "The Riveras"
    },
    "by": {
      "id": "0199e8b0-5a10-7a01-8b00-000000000001",
      "name": "Sam Rivera"
    },
    "via": "app",
    "key": null,
    "webhook": {
      "id": "0199e8b0-5a10-7a01-8b00-000000000034",
      "name": "Home Assistant"
    }
  }
}
```

The [API reference](../../api/) lists each event with its full schema.

## Check signatures

Anyone who learns your webhook's address could send it a message. Merran signs every delivery, so a receiver that checks can tell the ones from your Merran. Merran follows [Standard Webhooks](https://www.standardwebhooks.com/), so a library does the checking in most languages. It's worth doing for any receiver that does something you'd mind a stranger starting.

`webhook-signature` is `v1,` and a base64 HMAC-SHA256 of `{webhook-id}.{webhook-timestamp}.{body}`, made from the secret's bytes: the part after `whsec_`, base64-decoded, not the text of the secret. After **Rotate secret**, each delivery carries two signatures, separated by a space, for 24 hours, so you can change the receiver's secret without missing any. A receiver accepts a message if either matches.

Check the body exactly as it arrived, not after parsing it and writing it out again, and refuse a `webhook-timestamp` more than 5 minutes from now. The libraries below do both.

In JavaScript, with `npm install standardwebhooks`:

```js
import { Webhook } from "standardwebhooks"

const wh = new Webhook(process.env.MERRAN_WEBHOOK_SECRET) // whsec_…

export function handle(rawBody, headers) {
  // Throws if the signature is wrong or the timestamp is more than 5 minutes off.
  const message = wh.verify(rawBody, {
    "webhook-id": headers["webhook-id"],
    "webhook-timestamp": headers["webhook-timestamp"],
    "webhook-signature": headers["webhook-signature"],
  })
  console.log(message.type, message.data.recipe?.title)
}
```

In Python, with `pip install standardwebhooks`:

```python
import os
from standardwebhooks.webhooks import Webhook

wh = Webhook(os.environ["MERRAN_WEBHOOK_SECRET"])  # whsec_…

def handle(raw_body: bytes, headers: dict):
    # Raises WebhookVerificationError if the signature is wrong
    # or the timestamp is more than 5 minutes off.
    message = wh.verify(raw_body, headers)
    print(message["type"], message["data"].get("recipe", {}).get("title"))
```

Because deliveries can be tried more than once, a receiver should use `webhook-id` to ignore one it has already handled.

## Retries and pausing

A delivery is delivered when the receiver answers with any `2xx` within 10 seconds. Anything else is a failure: another status, a timeout, a refused connection, or a redirect, which Merran doesn't follow.

After a failure Merran tries again after 5 seconds, 5 minutes, 30 minutes, 2 hours, 5 hours, 10 hours and 10 hours: eight tries in about 27 hours, enough to ride out a night of Home Assistant being down. While it's trying, the webhook shows **Failing**, with the last error.

The webhook becomes **Paused** when:

- a delivery runs out of tries, or
- the receiver answers `410 Gone`, which pauses it at once.

While paused, nothing new is sent to it, and its waiting deliveries stop. The household's admins see it on the **Webhooks** card, and get an email if email is set up on the server. **Resume** starts sending new events again, and **Resume and resend** also resends what failed in the last day. You can **Pause** a webhook by hand too.

Open a webhook's **Deliveries** to see the last 30 days: the event, when it happened, how many tries it took, its status, the answer's status code, how long it took, the first part of the answer and the exact body sent. **Resend** sends one again.

**Send a test** is the exception to all of this: it's sent once, even to a paused webhook, never retried, and never pauses the webhook. The answer shows right away.

## Rotate a secret

**Rotate secret** makes a new secret and shows it. For 24 hours each delivery carries signatures from both the new and the old, so you can update your receiver and not miss a message. **Show secret** shows the current one again whenever you need it.

## What stays private

- The address, the secret and the extra headers are sealed like the server's other secrets. The list shows only the host.
- Messages carry names, ids and titles, not whole recipes.
- Webhooks are left out of the household export, because they hold secrets.
- Nothing is sent until a household adds a webhook.

## Troubleshooting

| What you see                                        | What to try                                                                                                                                                  |
| --------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| "This address is on your home network…" when saving | A server admin allows it in **Settings → Server → Webhooks**. See [The home network](#the-home-network).                                                     |
| The test fails for a Home Assistant name            | Use its IP address instead of `homeassistant.local`.                                                                                                         |
| The test works, but a real event never arrives      | Check the webhook wants that event under **Edit**, and that it isn't **Paused**.                                                                             |
| Signatures never match                              | Check the whole body as received, the secret from **Show secret**, and that the receiver's clock is within 5 minutes. After a rotation, both work for a day. |
| The **Webhooks** card isn't there                   | You need to be an **Owner** or **Admin**, and a server admin may have turned webhooks off.                                                                   |
