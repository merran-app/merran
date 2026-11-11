---
title: Webhooks
description: Tell Home Assistant, n8n and other tools when things happen in your kitchen, and check that each message came from your Merran.
sidebar:
  order: 7
---

A webhook is an address Merran sends a message to when something happens. Add one from Home Assistant, n8n or any tool that can receive a web request, pick the events you want, and that tool hears about them as they happen.

Merran sends these events:

| Event                                  | When                                                                       |
| -------------------------------------- | -------------------------------------------------------------------------- |
| [`recipe.created`](#recipecreated)     | A recipe is added                                                          |
| [`recipe.updated`](#recipeupdated)     | A recipe is changed                                                        |
| [`recipe.deleted`](#recipedeleted)     | A recipe goes to Recently deleted                                          |
| [`recipe.restored`](#reciperestored)   | A recipe comes back from Recently deleted                                  |
| [`import.finished`](#importfinished)   | An import runs to its end                                                  |
| [`tidy.ready`](#tidyready)             | Tidy up finishes with suggestions waiting                                  |
| [`review.waiting`](#reviewwaiting)     | Something new waits in Review                                              |
| [`plan.changed`](#planchanged)         | Meals are added, moved, changed or removed (gathered)                      |
| [`plan.autoplanned`](#planautoplanned) | The autoplan plans a week                                                  |
| [`meal.cooked`](#mealcooked)           | A meal is marked made                                                      |
| [`meal.skipped`](#mealskipped)         | A planned meal is marked Didn't                                            |
| [`list.changed`](#listchanged)         | Things on a list are added, checked off, changed or removed (gathered)     |
| [`list.completed`](#listcompleted)     | The last thing on a list is checked off, or it's put away with things left |
| [`list.sent`](#listsent)               | A list goes to a store's cart                                              |
| [`pantry.changed`](#pantrychanged)     | Things are put away, used up, moved, changed or removed (gathered)         |
| [`webhook.test`](#webhooktest)         | Someone chooses **Send a test**                                            |

Cooking and timers, and a daily summary, are still to come. A webhook set to **Everything, including events added later** hears them when they arrive.

## Before you start

- You need to be an **Owner** or **Admin** of the household. Members don't see webhooks.
- A server admin can turn webhooks off for the whole server, with the **Let households send webhooks** switch in **Settings → Webhooks → Whole server** or `MERRAN_WEBHOOKS=false`. Then households don't see the **Webhooks** page, and saved webhooks are kept for later.
- Set the server's public address (`MERRAN_PUBLIC_URL`) if you want each recipe's `url` in the messages. Without it, `url` is `null`.
- Webhooks are managed in the app only. API keys can't add, change or read them.
- A household can have up to 10 webhooks, and each can have up to 5 extra headers.

## Add a webhook

1. Open **Settings → Webhooks**. A server admin sees the household's webhooks under **This household**.
2. Choose **Add webhook**.
3. Enter a **Name**, like `Home Assistant`, so you can tell it apart in the list.
4. Enter the **Address** the other tool gave you. It must start with `http://` or `https://`, can't have a user name or password in it (use a header instead), and is sealed like the server's other secrets once saved.
5. Under **Events**, tick the ones you want, or choose **Everything, including events added later**. Each event has a line saying what sends it.
6. If the tool wants a token or password in a header, choose **Add a header** under **Extra headers** and fill in its name and value. Each value goes on one line, and headers that can't be sent with a request, like `Connection`, `Transfer-Encoding` or `Expect`, can't be added. Header values stay sealed: to change the headers later, fill in every value again, and Merran asks for any you leave empty.
7. Save it. Merran shows **Here's the secret**: copy it into the tool that checks signatures. You can show it again later with **Show secret**.
8. Open the webhook and choose **Send a test**. Merran sends a `webhook.test` event once and shows the answer.

Each webhook in the list shows its name, the host it sends to, how many events it wants, and its state:

- **Working**: deliveries are arriving.
- **Failing**: a delivery didn't go through and Merran is trying again.
- **Paused**: Merran has stopped sending. See [Retries and pausing](#retries-and-pausing).

Open a webhook to see its **Deliveries**, and to **Edit**, **Pause** or **Resume**, **Rotate secret**, **Show secret** or **Delete** it.

## The home network

Home Assistant usually lives on your home network, which Merran refuses by default: on a server shared with others, any household could otherwise make Merran call machines on your network. A server admin allows it in one of two ways:

- In **Settings → Webhooks → Whole server**, set **Webhooks to the home network** to **Off** (the default), **Every household** or **Chosen households**, and pick the households. Or set `MERRAN_WEBHOOKS_HOME_NETWORK` to `off`, `all` or `chosen`, which locks the setting in the app.
- When the server admin adds a webhook for a household that isn't allowed yet, the form shows **Allow the home network for this household**, so on a server with one household it takes one tick.

Without permission, saving an address on the home network fails with "This address is on your home network. The server admin can allow that in Settings → Webhooks → Whole server." Merran checks again on every send, so a name that starts pointing at your home network later is refused too.

Even with permission, a webhook can't reach a link-local address, like `169.254.169.254`, where a cloud server's metadata service hands out its keys. Saving one fails with "Webhooks can't reach link-local addresses, like 169.254.169.254.", and a name that leads to one is refused when Merran sends.

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

To say something when a shopping trip is over, tick **A list is finished** (`list.completed`) and use:

```yaml
alias: Shopping list is done
triggers:
  - trigger: webhook
    webhook_id: merran-list-done-4d8e2b6a1c07
    allowed_methods:
      - POST
    local_only: true
conditions:
  - condition: template
    value_template: "{{ trigger.json.type == 'list.completed' }}"
actions:
  - action: tts.speak
    target:
      entity_id: tts.home_assistant_cloud
    data:
      media_player_entity_id: media_player.kitchen
      message: "The shopping list is done"
```

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

### Gathered events

Plan, list and pantry changes are gathered: `plan.changed`, `list.changed` and `pantry.changed` wait 30 seconds and are sent as one event for each person, so someone checking off 30 things at the store sends one `list.changed`, not 30. The counts in it are exact. Each person gets their own event, so `by`, `via` and `key` stay true, and a flow can still ignore the change it caused. A change made while the 30 seconds are running starts them again, so an event is sent 30 seconds after the last change.

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

### import.finished

Sent when an import runs to its end: a batch of links, a collection, an import from Mealie or Paprika, or a Merran archive. `kind` is `links`, `collection`, `app` or `archive`, and `app` says `mealie` or `paprika` for an `app` import, or is `null`. `added`, `skipped` and `failed` count recipes. `import` is the job, which you can also see in **Jobs**, and `url` is its page in Merran.

An import that fails as a whole, or that you stop, sends nothing: it shows on its page and in **Jobs**. An archive import always says `failed: 0`, because one recipe that fails fails the whole import. It's sent as Merran's own work (`by` is `null`, `via` is `merran`), because the import finishes in the background.

```json
{
  "type": "import.finished",
  "timestamp": "2026-11-10T19:12:30.402Z",
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
    "import": {
      "id": "0199e8b0-5a10-7a01-8b00-00000000000b"
    },
    "kind": "links",
    "app": null,
    "added": 11,
    "skipped": 1,
    "failed": 0,
    "url": "https://merran.example.com/recipes/import/0199e8b0-5a10-7a01-8b00-00000000000b"
  }
}
```

### tidy.ready

Sent when Tidy up finishes with suggestions waiting in Review, whether it was started by hand, for one recipe or many, or ran on its own. `count` is how many recipes have suggestions, and `recipes` names up to 10 of them. A run that's stopped sends nothing. Tidy runs are Merran's own work, so `by` is `null` and `via` is `merran`.

```json
{
  "type": "tidy.ready",
  "timestamp": "2026-11-10T19:20:08.117Z",
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
    "count": 12,
    "recipes": [
      {
        "id": "0199e8b0-5a10-7a01-8b00-000000000006",
        "slug": "lemon-chicken",
        "title": "Lemon Chicken",
        "url": "https://merran.example.com/recipes/lemon-chicken"
      },
      {
        "id": "0199e8b0-5a10-7a01-8b00-000000000007",
        "slug": "garlic-rice",
        "title": "Garlic Rice",
        "url": "https://merran.example.com/recipes/garlic-rice"
      }
    ],
    "url": "https://merran.example.com/recipes/review"
  }
}
```

### review.waiting

Sent when something new waits in Review that didn't come from your own chat: a proposal from an AI app connected with [MCP](../mcp/), or a cooking note that became an edit. `source` is `mcp` or `cook_note`, and `recipe` is the recipe it's about, or `null`. A cooking note turned into an edit is sent as Merran's own work.

```json
{
  "type": "review.waiting",
  "timestamp": "2026-11-10T19:31:46.870Z",
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
    "source": "cook_note",
    "count": 1,
    "recipe": {
      "id": "0199e8b0-5a10-7a01-8b00-000000000006",
      "slug": "lemon-chicken",
      "title": "Lemon Chicken",
      "url": "https://merran.example.com/recipes/lemon-chicken"
    },
    "url": "https://merran.example.com/recipes/review"
  }
}
```

### plan.changed

Sent when meals are added, moved, changed or removed, whatever did it: someone in the app, the autoplan, a proposal, **Repeat last week**, **Clear**, **Undo**, or **Made it** when it adds a meal or moves one out of the pool. It's [gathered](#gathered-events), so someone filling a whole week sends one.

`days` are the days touched, earliest first, and `pools` are the weeks whose pool was touched, each by its first day. `added`, `moved`, `changed` and `removed` count meals: `moved` is a meal on another day or at another meal, or with its dishes in another order, and `changed` is a meal whose recipe, side, note or servings changed.

Marking a meal made or **Didn't** isn't a plan change: it sends [`meal.cooked`](#mealcooked) or [`meal.skipped`](#mealskipped). **Undo** puts meals back and sends this event, but never `meal.cooked` or `meal.skipped` again.

```json
{
  "type": "plan.changed",
  "timestamp": "2026-11-10T19:45:02.331Z",
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
    "days": ["2026-10-15", "2026-10-16"],
    "pools": ["2026-10-11"],
    "added": 2,
    "moved": 1,
    "changed": 0,
    "removed": 0
  }
}
```

### plan.autoplanned

Sent when the autoplan plans a week, on its schedule or when someone runs it. `week` is the week's first day, `meals` is how many meals it planned, and `url` is that week in the plan. It also sends `plan.changed` for the meals it added.

```json
{
  "type": "plan.autoplanned",
  "timestamp": "2026-11-10T19:50:00.000Z",
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
    "week": "2026-10-18",
    "meals": 5,
    "url": "https://merran.example.com/plan?week=2026-10-18"
  }
}
```

### meal.cooked

Sent when a meal is marked made, wherever that happens: cook view, the plan, Today's **Did you make these?**, or a recipe made off the plan. `planned` says whether the meal was on the plan before, and `servings` how many were made, or `null`. `date` is the meal's day, or the first day of the week for a meal in the pool, and `recipe` is `null` for a meal that's only a note. Setting a meal back to planned sends nothing, and **Undo** never sends this again.

```json
{
  "type": "meal.cooked",
  "timestamp": "2026-11-10T22:41:19.275Z",
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
    "entryId": "0199e8b0-5a10-7a01-8b00-00000000001b",
    "date": "2026-10-15",
    "meal": "dinner",
    "pool": false,
    "title": "Lemon Chicken",
    "recipe": {
      "id": "0199e8b0-5a10-7a01-8b00-000000000006",
      "slug": "lemon-chicken",
      "title": "Lemon Chicken",
      "url": "https://merran.example.com/recipes/lemon-chicken"
    },
    "side": {
      "id": "0199e8b0-5a10-7a01-8b00-000000000007",
      "slug": "garlic-rice",
      "title": "Garlic Rice",
      "url": "https://merran.example.com/recipes/garlic-rice"
    },
    "servings": 4,
    "planned": true
  }
}
```

### meal.skipped

Sent when a planned meal is marked **Didn't**. Its body is the same as `meal.cooked`'s, without `servings` and `planned`. Setting a meal back to planned sends nothing, and **Undo** never sends this again.

```json
{
  "type": "meal.skipped",
  "timestamp": "2026-11-10T22:44:51.902Z",
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
    "entryId": "0199e8b0-5a10-7a01-8b00-00000000001b",
    "date": "2026-10-15",
    "meal": "dinner",
    "pool": false,
    "title": "Lemon Chicken",
    "recipe": {
      "id": "0199e8b0-5a10-7a01-8b00-000000000006",
      "slug": "lemon-chicken",
      "title": "Lemon Chicken",
      "url": "https://merran.example.com/recipes/lemon-chicken"
    },
    "side": {
      "id": "0199e8b0-5a10-7a01-8b00-000000000007",
      "slug": "garlic-rice",
      "title": "Garlic Rice",
      "url": "https://merran.example.com/recipes/garlic-rice"
    }
  }
}
```

### list.changed

Sent when things on a list are added, checked off, unchecked, changed or removed. It's [gathered](#gathered-events), so someone checking off 30 things sends one. `lists` has each list touched with how many things are `left` and `checked` now. `changed` counts things whose name, amount, aisle or list changed.

Merging duplicate lines and moving things when a list is removed send nothing, and **Undo** sends this event but never [`list.completed`](#listcompleted).

```json
{
  "type": "list.changed",
  "timestamp": "2026-11-10T17:52:33.640Z",
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
    "lists": [
      {
        "id": "0199e8b0-5a10-7a01-8b00-00000000001c",
        "name": "Groceries",
        "left": 8,
        "checked": 14
      }
    ],
    "added": 0,
    "checked": 14,
    "unchecked": 0,
    "changed": 0,
    "removed": 0
  }
}
```

### list.completed

Sent when the last unchecked thing on a list is checked off, however that's done, or when **Put away** clears a list that still has unchecked things. `bought` is how many things on it were checked off, and `left` how many were still unchecked when it was put away. A list that was finished already sends nothing more when it's put away, so one trip sends one. **Clear checked** and **Undo** don't send it.

```json
{
  "type": "list.completed",
  "timestamp": "2026-11-10T17:58:10.114Z",
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
    "list": {
      "id": "0199e8b0-5a10-7a01-8b00-000000000025",
      "name": "Costco"
    },
    "bought": 9,
    "left": 0
  }
}
```

### list.sent

Sent when a list goes to a store's cart: Kroger's, or Walmart's through the [browser extension](../browser-extension/). `store` is `kroger` or `walmart`, `sent` is how many things went to the cart, and `notFound` how many the store had no product for. For Walmart, the extension tells Merran when its fill is done, so this arrives when the run ends. An extension too old to report that sends no `list.sent` for Walmart.

```json
{
  "type": "list.sent",
  "timestamp": "2026-11-10T18:05:27.356Z",
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
    "store": {
      "id": "kroger",
      "name": "Kroger"
    },
    "sent": 23,
    "notFound": 2
  }
}
```

### pantry.changed

Sent when things are put away, used up, moved to another place, changed or removed. It's [gathered](#gathered-events). `added` is things put away, `usedUp` is things marked **Used up**, and `changed` counts things whose amount, aisle, name or use-by date changed.

```json
{
  "type": "pantry.changed",
  "timestamp": "2026-11-10T18:40:12.009Z",
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
    "added": 6,
    "usedUp": 2,
    "moved": 0,
    "changed": 1,
    "removed": 0
  }
}
```

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

While paused, nothing new is sent to it, and its waiting deliveries stop. The household's admins see it in **Settings → Webhooks**, and get an email if email is set up on the server. **Resume** starts sending new events again, and **Resume and resend** also resends what failed in the last day. You can **Pause** a webhook by hand too.

Turning webhooks off for the whole server, with the **Let households send webhooks** switch in **Settings → Webhooks → Whole server** or `MERRAN_WEBHOOKS=false`, stops deliveries waiting for a retry too: one whose next try comes while webhooks are off is **Stopped**, and isn't sent when they're turned back on. Each can be sent again with **Resend** in the webhook's **Deliveries**.

Open a webhook's **Deliveries** to see the last 30 days: the event, when it happened, how many tries it took, its status, the answer's status code, how long it took, the first part of the answer and the exact body sent. When a try failed, Merran's error shows above the answer, where a tool like n8n usually says what was wrong. While the webhook is open, its state and deliveries keep up on their own.

**Resend** sends a delivery again from its first try. One still **Trying** can't be resent while Merran is trying it, but one left **Trying** with nothing trying it, as can happen after a crash, can.

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
| "This address is on your home network…" when saving | A server admin allows it in **Settings → Webhooks → Whole server**. See [The home network](#the-home-network).                                               |
| The test fails for a Home Assistant name            | Use its IP address instead of `homeassistant.local`.                                                                                                         |
| The test works, but a real event never arrives      | Check the webhook wants that event under **Edit**, and that it isn't **Paused**.                                                                             |
| Signatures never match                              | Check the whole body as received, the secret from **Show secret**, and that the receiver's clock is within 5 minutes. After a rotation, both work for a day. |
| **Webhooks** isn't in Settings                      | You need to be an **Owner** or **Admin**, and a server admin may have turned webhooks off.                                                                   |
