# Webhooks

Planned November 10, 2026. This scopes "Webhooks for Home Assistant, n8n and others" in [features.md](features.md), and replaces the outline that was in [platform.md](platform.md#webhooks). The first pull request (the engine, the Webhooks page and server card, and the recipe events) was built on November 10, 2026. The second (the rest of slice 1: imports, tidy-up, Review, the plan, meals, the list and the pantry, and gathering) was built on November 11, 2026; cooking, timers and the daily heads-ups are still planned.

## Goal

A household admin pastes an address from Home Assistant or n8n into Merran, picks the events they want, and from then on that tool hears about what happens in the kitchen as it happens: a recipe added, tidy suggestions waiting, cooking started, a timer done, the list changed, tonight's dinner. They build the automation from the guide alone, with nothing to write beyond the receiver, and they can check every delivery came from their Merran.

It's built first for three kinds of automation, chosen with the user on November 10, 2026:

- **The kitchen reacting to cooking:** Home Assistant turns on the hood fan or the kitchen lights when cooking starts, and says on the speakers when a timer is done.
- **Daily heads-ups:** "tonight's dinner is Lemon Chicken", "time to start dinner", "the spinach should be used soon", pushed to phones or a wall display.
- **Workflow glue in n8n:** when a recipe is added or imported, or tidy suggestions are ready, start a flow that posts to Discord, saves to Notion or asks someone to review.

Mirroring the shopping list item by item into another app was considered and left for later (see [Later](#later)), so list events say what changed in numbers, not each item.

## Decisions

| Decision | Choice | Why |
|---|---|---|
| Where events come from | Services call one `record()` inside the transaction that makes the change | A change that rolls back sends nothing, a restart loses nothing, and the event knows exactly what happened. Reading events off the routes (as live updates do) only knows a path was called, and misses jobs and MCP. Reading them off the database is at the wrong level: a row changed, not "the list went to Kroger" |
| Live updates | Keep their path-based middleware for now; moving them onto `record()` is a follow-up | Changes the October 2026 plan that one stream feeds both. Until the follow-up they can disagree in one way only: a page refreshes for a change no webhook hears about |
| Whose webhooks | The household's, managed by its owners and admins. Server-level webhooks come later on the same engine | Everything asked for is household data; server events need their own page and permissions |
| Cooking | Cook view tells the server when cooking starts and ends and about each timer; the server keeps its own copy of each timer and sends `timer.finished` itself | The server hears nothing from cook view today except Made it, so the kitchen couldn't react; a timer kept on the server goes off on time even when the tablet sleeps |
| Format | Standard Webhooks: `webhook-id`, `webhook-timestamp` and `webhook-signature` headers, a `whsec_` secret, and a `type`, `timestamp`, `data` body | Receivers can check deliveries with an existing library in any language |
| What a payload carries | Ids, names, titles and links, and the few numbers that matter (servings, times, counts), never whole recipes | A leaked delivery log reveals little; the receiver fetches more through the API with its own key |
| Who did it | Every event says who (`by`), how (`via`) and, through the API, with which key | An n8n flow that changes the list can ignore the `list.changed` it caused, instead of looping |
| Gathering busy events | Plan, list and pantry changes are gathered for 30 seconds into one event | Checking off 30 things at the store shouldn't make 30 deliveries |
| Imports | Recipes from an import of another app or a Merran archive don't each send `recipe.created`; `import.finished` says how many. Links, even many at once, send one each | Moving 500 recipes over from Mealie shouldn't start 500 flows |
| Background runs | Nutrition, photo and food-matching runs don't send `recipe.updated` | They touch hundreds of recipes nobody edited; they may get their own "run finished" events later |
| Retries | Immediately, then after 5 seconds, 5 minutes, 30 minutes, 2 hours, 5 hours, 10 hours and 10 hours: about 27 hours | The schedule Standard Webhooks recommends; it rides out a night of Home Assistant being down |
| Giving up | When a delivery runs out of tries, or the receiver answers `410 Gone`, the webhook pauses and its admins are told | A receiver that's gone shouldn't be called for ever |
| The address | Sealed in the secrets table, with only its host kept in the clear for lists and logs | A Home Assistant webhook's address is its password: whoever has it can trigger the automation |
| The home network | Refused unless the server admin allows it, for every household or chosen ones; checked when saved and again on every send | Home Assistant is usually on the home network, but on a shared server any household could otherwise make Merran call local machines |
| Managing webhooks | In the app only, never with API keys | Admin actions stay closed to keys in 0.1 ([platform.md](platform.md#api-keys)) |
| Belonging | To the household; it remembers who made it and keeps working if they leave | The kitchen's automations shouldn't break when one person moves out |
| Export | Left out of the household export | They hold secrets, like AI keys |
| `MERRAN_OUTBOUND=minimal` | Turns webhooks off too, once that setting is built ([operations.md](operations.md)) | Like reading followed sites, a household chose them but Merran sends them on its own |
| How many | Up to 10 webhooks a household | Enough for every tool in a home; a bound on what one household can make the server send |
| Ruled out | A sentence in each payload ("Kyle added Lemon Chicken") | It would need the server to translate; Home Assistant and n8n templates make their own from the fields |
| Gathered per person (November 11, 2026) | A gathering window gives one event for each who (`by`, `via`, `key`), not one for the household | `by` stays exact, and an n8n flow can still ignore the change it caused. One person checking off 30 things still makes one event |
| Gathering re-arms (November 11, 2026) | A change made while the merge job runs puts that job back in the queue, 30 seconds on | The runner already runs a job started over while it runs again from its first try. The merge job runs one at a time across the server (`concurrency: 1`), so two merges never take the same rows |
| Gathered events count `changed` (November 11, 2026) | A meal's recipe, side, note or servings; a list item's name, amount, aisle or list; a pantry item's amount, aisle, name or use-by. Reordering a meal's dishes counts as `moved` | Without it, swapping tonight's dish or fixing an amount would send nothing. Marking meals made or Didn't isn't a plan change: it's `meal.cooked` and `meal.skipped` |
| What `plan.changed` covers (November 11, 2026) | Every add, move and removal, whatever did it: the autoplan (beside `plan.autoplanned`), applying a proposal, Repeat last week, Clear, Undo, and Made it when it adds a meal or moves one from the pool (beside `meal.cooked`) | A receiver that mirrors the plan needs every change, not only the ones people made by hand |
| Undo restores (November 11, 2026) | Putting meals back sends `plan.changed` but never `meal.cooked` or `meal.skipped` again. Setting a meal back to planned sends nothing. Undo on the list sends `list.changed` but never `list.completed` | Undo puts things back as they were; it isn't a second time cooking or shopping |
| Meals are in the Plan area (November 11, 2026) | `meal.cooked` and `meal.skipped` sit under Plan in the picker. Cooking, its own area, arrives with the sessions and timers | There's nothing else in Cooking yet, and an area with two events isn't worth a heading |
| What ends a shopping trip (November 11, 2026) | `list.completed` is sent when the last unchecked item on a list is checked off, however that's done (except Undo), and when Put away (`POST /api/list/put-away`) clears a list that still has unchecked items. A list that was finished already gets nothing when it's put away, so a trip sends one. Clear checked isn't the end of a trip | Automations say "the shopping list is done" once, whether the last thing was ticked in the store or the list was put away |
| Imports that fail send nothing (November 11, 2026) | `import.finished` is sent when an import runs to its end. One that fails as a whole, or is stopped, shows on its page and in Jobs. Archive imports always report `failed: 0`, because any recipe that fails fails the whole import. A collection's import is a link batch marked with its kind, and sharing several links at once is a `links` batch | A failed import isn't news a flow can act on; the person sees it where they started it |
| Tidy-ups send `tidy.ready` (November 11, 2026) | Automatic tidy-ups send it like the ones started by hand. A run that's stopped sends nothing | The suggestions are waiting in Review either way |
| Background work says Merran did it (November 11, 2026) | A cooking note turned into an edit is `by: null`, `via: "merran"`, and so are link batches, app imports and tidy runs, which finish in jobs | The spec says so for background work; the person who started it isn't who finished it |
| Walmart reports when the extension is done (November 11, 2026) | The server hears from the extension one product at a time, so a new route, `POST /api/stores/walmart/filled`, takes the run's totals and records `list.sent`. An extension too old to call it sends no `list.sent` for Walmart. For Kroger, the web passes how many basket lines had no product, which the server hasn't seen because the page leaves them out | The server can't tell when a Walmart fill ends any other way |
| Housekeeping sends nothing (November 11, 2026) | Merging duplicate list lines (the food re-keying job, Same as), moving items when a list is removed, and the gathered rows themselves. Gathered rows aren't in the deliveries log, and the daily clean-up clears them with the rest after 30 days | None of it is something that happened in the kitchen |

## How events are made

### `record()`

One function, in `apps/server/src/services/webhooks/`, that every feature calls when something worth telling happens:

```ts
await record(em, householdId, {
  type: "recipe.created",
  actor, // who did it, how, and with which key
  data: { recipe: recipeRef(recipe), source: "link", sourceUrl },
})
```

It's called with the transaction's entity manager, so it's part of the change. It first asks whether any active webhook in the household wants that event (from a small cache per household, cleared whenever its webhooks change). If none does, it does nothing: a household without webhooks pays nothing. Otherwise it saves the event to `webhook_events`, and a row in `webhook_deliveries` and a delivery job for each webhook that wants it, all in the same transaction.

### The catalog

Every event is declared once, in `packages/shared/src/webhooks/events.ts`: its name, its area (recipes, cooking, plan, list, pantry, webhooks) and its slice. Its payload is a Zod schema on the server. The OpenAPI spec's `webhooks` section is generated from them, so the API reference shows each event with its payload like a route ([open-source.md](open-source.md)), and the settings page draws its checkboxes from the same list. Labels and descriptions are in `en.json`.

### The envelope

```json
{
  "type": "recipe.created",
  "timestamp": "2026-11-10T18:04:12.511Z",
  "data": {
    "household": { "id": "0193…", "name": "The Johnsons" },
    "by": { "id": "0192…", "name": "Kyle" },
    "via": "api",
    "key": { "id": "0193…", "name": "Merran extension" },
    "recipe": {
      "id": "0193…",
      "slug": "lemon-chicken",
      "title": "Lemon Chicken",
      "url": "https://merran.example.com/recipes/lemon-chicken"
    },
    "origin": "link",
    "sourceUrl": "https://example.com/lemon-chicken"
  }
}
```

- `via` is `app` (signed in), `api` (an API key or OAuth connection on the REST API), `mcp` (an AI app through `/mcp`) or `merran` (Merran on its own: a schedule, a job, a timer going off). `key` is the key or connection for `api` and `mcp`, and null otherwise.
- `by` is null when Merran did it on its own, including work it does in the background, such as importing a batch of links. Cooking events also carry `cook`, the person cooking, which stays set when Merran ends a session or a timer goes off.
- Who did it is kept for each request (an `AsyncLocalStorage` set by a middleware after sign-in), so `record()` knows without every service passing it along.
- Links (`url`) are built from `MERRAN_PUBLIC_URL`, and are null without it.
- The event's id (`msg_` and a UUID) is the `webhook-id` header. It stays the same on every try, so a receiver can drop a delivery it's already had.
- Deliveries can arrive out of order; `timestamp` is when it happened.

### Gathering

`plan.changed`, `list.changed` and `pantry.changed` are gathered. Each change still records a small event, marked as gathered, and the first one queues a keyed job 30 seconds later (`webhooks.gather:<household>:<type>`; the job runner's keys make sure there's one). That job merges the household's gathered events of that type into one, which is sent like any other. The counts are exact, because nothing is added up in place. Each who (`by`, `via`, `key`) gets their own event.

How it holds together:

- **A change made while the merge job runs re-arms it.** The job goes back in the queue, 30 seconds on, so what arrives during a merge is sent in the next one and nothing is left behind.
- **A change that finds a queued merge job writes to it,** holding that row until the change's transaction commits, so the runner can't take the job mid-change and miss a part that hasn't been committed yet. The trade-off: on Postgres, a gathered record inside a transaction holds the merge job's row lock until it commits. So features record gathered events as late in a transaction as they can, and two transactions that record two gathered types in opposite orders while both merge jobs are queued could deadlock. It's rare, and one of the requests fails.
- **A household without webhooks pays nothing.** Payloads that cost queries (counting what's left on a list, finding a week's days) are built only after `wantsEvent` says a webhook wants the event.
- **Counts follow the writes.** A plan edit that changes a meal's list lines is counted step by step: lines taken off, then added again, is `removed: 1, added: 1`, or `changed: 2` on a line shared with another meal.
- **A known race:** two phones checking off a list's last two rows at the same moment may each see one left, and then no `list.completed` is sent.

## Events

### Slice 1: what the server already knows

| Event | When | Carries |
|---|---|---|
| `recipe.created` | A recipe is added: typed in, imported from a link, a page, text, photos, a video, the extension or a share, or applied from a proposal | The recipe; its origin (`manual`, `link`, `video`, `text`, `photo`, `assistant`: pages, the extension and shares arrive as `link`, as `createRecipe` knows them); its source link |
| `recipe.updated` | Someone saves edits, applies a tidy-up or proposal, saves a swap, restores a version, or changes the photo, diets or what can be left out | The recipe; which parts changed (`details`, `ingredients`, `steps`, `tags`, `photo`, `diets`); nothing is sent when nothing changed. Stars, cooking notes, tags changed on many recipes at once and renamed tags don't send it |
| `recipe.deleted` | A recipe goes to Recently deleted. Deleting it for good sends nothing more | The recipe |
| `recipe.restored` | A recipe comes back from Recently deleted | The recipe |
| `import.finished` | A batch of links, an import from Mealie or another app's files, a Merran archive, or a collection finishes | What kind; how many were added, skipped and failed; a link to the import |
| `tidy.ready` | Tidy up finishes, for one recipe or a run of many, with suggestions waiting | How many recipes have suggestions; up to 10 of them; a link to Review |
| `review.waiting` | Something new waits in Review that didn't come from your own chat: an AI app's proposal over MCP, or a cooking note turned into an edit | Where it came from (`mcp`, `cook_note`); how many; the recipe if there is one; a link to Review |
| `plan.changed` | Meals added, moved, changed or removed (gathered) | The days touched and the weeks whose pool was touched; how many were added, moved, changed and removed; who |
| `plan.autoplanned` | The weekly autoplan ran, on its schedule or by hand | The week; how many meals it planned |
| `meal.cooked` | A meal is marked made anywhere: cook view, the plan, Today's "Did you make these?", or a recipe made off the plan | The day and meal; the recipe; servings; whether it was planned |
| `meal.skipped` | A planned meal is marked Didn't | The day and meal; the recipe |
| `list.changed` | Items added, checked off, unchecked, changed or removed (gathered) | Each list touched, with how many are left and checked; how many were added, checked off, unchecked, changed and removed; who |
| `list.completed` | The last item on a list is checked off, or Put away clears a list that still has unchecked items | The list; how many items were bought and how many were left |
| `list.sent` | A list goes to a store's cart (Kroger, or Walmart through the extension) | The store; how many items were sent and how many weren't found |
| `pantry.changed` | Things put away, used up, moved, changed or removed (gathered) | How many were added, used up, moved, changed and removed; who |
| `webhook.test` | **Send a test** | The webhook's name; who sent it |

### Slice 2: cooking

| Event | When | Carries |
|---|---|---|
| `cooking.started` | Someone leaves Get ready in cook view, or reopens it straight into the steps | The session; the cook; the recipe; the planned meal, if any; servings |
| `cooking.ended` | Made it, leaving cook view, or no word from cook view for 30 minutes with no timer running | The session; the cook; the recipe; the outcome (`made`, `stopped` or `timed_out`); minutes cooking |
| `timer.started` | A timer starts in cook view | The session; the cook; the recipe; the timer's id, label, length and when it ends |
| `timer.extended` | **+1 minute** | The same, with the new end |
| `timer.finished` | The timer's time is up. Sent by the server | The same |
| `timer.cancelled` | A timer is cancelled before it goes off | The same |

```json
{
  "type": "timer.finished",
  "timestamp": "2026-11-10T18:42:00.004Z",
  "data": {
    "household": { "id": "0193…", "name": "The Johnsons" },
    "by": null,
    "via": "merran",
    "key": null,
    "cook": { "id": "0192…", "name": "Kyle" },
    "session": { "id": "0193…" },
    "recipe": { "id": "0193…", "slug": "lemon-chicken", "title": "Lemon Chicken", "url": "https://merran.example.com/recipes/lemon-chicken" },
    "timer": { "id": "t-4f2a", "label": "Simmer the sauce", "seconds": 600, "endsAt": "2026-11-10T18:42:00.000Z" }
  }
}
```

### Slice 3: scheduled heads-ups

| Event | When | Carries |
|---|---|---|
| `day.summary` | Once a day, at the time on the Webhooks page (07:00 unless changed), in the household's time zone | The day; each meal planned with its time, if it has one, and its dishes; what's left in the week's pool; what to use soon; how many items are on the list |
| `meal.time_to_start` | When it's time to start cooking a meal that has a time: the slot's time minus its longest dish's total time | The day and meal; when it's served; when to start; each dish with its recipe and total time |
| `pantry.use_soon` | With the daily run, when things come into the use-soon window (within 2 days of their use-by, `USE_SOON_DAYS`) since the last one | Each item: its name, where it is, its use-by day |

```json
{
  "type": "day.summary",
  "timestamp": "2026-11-10T13:00:00.112Z",
  "data": {
    "household": { "id": "0193…", "name": "The Johnsons" },
    "by": null,
    "via": "merran",
    "key": null,
    "date": "2026-11-10",
    "meals": [
      {
        "meal": "dinner",
        "time": "18:00",
        "dishes": [
          { "entryId": "0193…", "title": "Lemon Chicken", "recipe": { "id": "0193…", "slug": "lemon-chicken", "title": "Lemon Chicken", "url": "https://merran.example.com/recipes/lemon-chicken" }, "totalMinutes": 45 }
        ]
      }
    ],
    "pool": [],
    "useSoon": [{ "id": "0193…", "name": "Spinach", "place": "Fridge", "useBy": "2026-11-11" }],
    "list": { "items": 12 }
  }
}
```

## Delivery

### Signing

Each delivery is signed as Standard Webhooks describes:

- `webhook-id`: the event's id.
- `webhook-timestamp`: when it was sent, in seconds.
- `webhook-signature`: `v1,` and the base64 HMAC-SHA256 of `{id}.{timestamp}.{body}`, keyed with the secret's bytes (the part after `whsec_`, base64-decoded).

The secret is `whsec_` and 32 random bytes, sealed in the secrets table, so `merran rotate-secret` covers it. Admins can show it whenever they need it, and **Rotate secret** makes a new one. For 24 hours after a rotation each delivery carries both signatures, space-separated as the format allows, so a receiver can change over without missing one. The guide tells receivers to refuse timestamps more than 5 minutes off.

n8n can check the signature with the `standardwebhooks` package in a Code node. Home Assistant's webhook trigger checks nothing; its webhook id, in the address, is the secret, and the guide says so.

A webhook may also have up to five headers of its own, sealed like the secret: for n8n's Header Auth, or a token a reverse proxy wants. They can't replace `content-type`, `user-agent`, `host`, `content-length` or the `webhook-` headers. Since November 10, 2026, each needs a value, on one line in the characters fetch can send (tabs, visible ASCII and the rest of Latin-1), and the headers that only apply to one connection (`connection`, `keep-alive`, `transfer-encoding`, `te`, `trailer`, `upgrade` and the two `proxy-` ones) are refused: fetch would refuse or drop them, and every delivery would fail without anyone seeing why. Since November 11, 2026, `expect` is refused too, as fetch refuses to send it at all, and sending leaves out any refused header saved before, so one can't fail every delivery. Changing the headers sends every value again, as they're never shown; the form asks for each.

### Sending

- A POST of the JSON, from `Merran/<version> (+https://merran.app)`, through `public-fetch.ts`, so the rules on home-network addresses are the ones imports follow. It needs a way to send a body exactly as signed, rather than its own `JSON.stringify`.
- 10 seconds to answer. Redirects aren't followed: a 3xx is a failure.
- Any 2xx is delivered. The first 1 KB of the answer, its status and how long it took are kept.
- `410 Gone` pauses the webhook at once.
- The delivery job (`webhooks.deliver`, its payload only the delivery's id) runs two at a time across the server, fewer than the runner's four places. When looking for due work, the runner leaves out kinds already running as many as they may, so a pile of deliveries for a receiver that hangs can't keep imports, plans and schedules waiting (decided November 10, 2026).
- `record()` saves the event, its deliveries and their jobs in one flush, so a delivery is never left waiting without a job, even when the change it's part of isn't in a transaction.

### Retries

The job runner gains an optional retry schedule for each kind of job, in place of its usual 30 seconds doubling to at most 30 minutes, three tries. Webhook deliveries use the Standard Webhooks schedule: immediately, then 5 seconds, 5 minutes, 30 minutes, 2 hours, 5 hours, 10 hours and 10 hours. Eight tries over about 27 hours. A delivery interrupted by a restart is tried again, as every job is.

### Pausing

- While a delivery is being retried, its webhook shows **Failing**, with the last error.
- When a delivery runs out of tries, or gets a `410`, the webhook is **Paused**: nothing new is queued for it, and its waiting deliveries stop.
- Its household admins see it on the Webhooks page, and get an email if the email module is set up. It goes in the audit log once there is one.
- **Resume** starts sending new events, and offers to resend what failed in the last day. It clears the last error too.
- Only an active webhook pauses, so two last tries finishing together pause it once and send one email, and one paused by hand stays paused by hand.

### The deliveries log

Each webhook shows its last 30 days of deliveries: the event, when it happened, how many tries, the status, the answer's status code, how long it took, the first 1 KB of the answer and the exact body sent. A failed try shows its error and, under it, the answer, which is where a receiver like n8n says what was wrong. NUL characters are left out of the answer kept, since Postgres can't store them. Each has **Resend**. One still being tried can't be resent, unless no job is left to try it, as after a crash. Send a test tries its delivery with no job, so since November 11, 2026 a test waiting in its first 15 seconds (the 10 to answer, and 5 more) counts as still being tried, and isn't sent twice. The daily clean-up job (`jobs.cleanUp`) clears events and deliveries older than 30 days. While a webhook is open, its state and log refresh every few seconds.

## The home network

- A server setting in Settings → Webhooks → Whole server, **Webhooks to the home network**: Off (the default), Every household, or Chosen households, picked from the server's households. `MERRAN_WEBHOOKS_HOME_NETWORK=off|all|chosen` sets it from the environment and locks it.
- **When a webhook is saved,** a household that isn't allowed must give an address that leads only to public addresses, looked up then (`checkPublicLink`). Otherwise it's refused with: "This address is on your home network. The server admin can allow that in Settings → Webhooks → Whole server." When the person saving it is the server admin, which is usual on a server with one household, a button allows it right there.
- **On every send,** a household that isn't allowed goes through the public agent, which refuses private addresses whenever the name is looked up, so a name that starts pointing home later is refused too. An allowed household's deliveries use the home agent.
- **Link-local addresses** (`169.254.0.0/16`, `fe80::/10`, IPv4 ones inside IPv6, and `169.254.0.0/16` through NAT64), where most cloud metadata services answer, are refused even for an allowed household (decided November 11, 2026): on saving, an address that is one or whose name looks up to one, with "Webhooks can't reach link-local addresses, like 169.254.169.254."; on every send, through a home agent whose lookup drops them (the fetcher's `refuseLinkLocal`). The server admin's own addresses, like their Mealie's, aren't held to this. A few metadata services answer elsewhere (AWS's opt-in IPv6 `fd00:ec2::254`, Alibaba's `100.100.100.200`), so allowing the home network on a cloud server still trusts that household with them.
- Addresses must be `http` or `https`, with no user name or password in them (use a header), and at most 2,000 characters. Plain `http` is allowed, since Home Assistant on a home network usually has no certificate.
- The guide says to use Home Assistant's IP address or a real host name: `homeassistant.local` often doesn't resolve inside Docker.

## The page

A **Webhooks** page in Settings, after Apps and devices. Moved there from the Household page on November 10, 2026: webhooks connect the household to other tools rather than describe the household, they'll grow with the later slices, and each settings page holds either your settings or the household's, so Apps and devices (yours) wasn't the place.

- **This household**, for owners and admins, shown when the module is on. Members don't see it.
- **Whole server**, for the server admin: the switch that turns webhooks on and off, and the home-network choice. It shows even while webhooks are off, so they can be turned back on; a household admin's half then says webhooks are turned off for every household.

- **The list:** each webhook's name, the host it sends to, how many events it wants, its state (**Working**, **Failing** or **Paused**) and its last delivery.
- **Add webhook** and editing open in a dialog on larger screens and a drawer on mobile: a name, the address, the events as checkboxes grouped by area with a line on each, or **Everything, including events added later**, and the extra headers. Each event's line says what sends it, like "Moved to Recently deleted." (`eventHints` in `en.json`), and is its checkbox's description for screen readers. After saving, the secret is shown with a copy button.
- **Each webhook** opens to its deliveries log, **Send a test**, **Pause** or **Resume**, **Rotate secret**, **Show secret** and **Delete**, which asks first.
- **Send a test** is sent at once, even to a paused webhook, tried once, and its answer shown. It's logged like any delivery, but it's never retried and never pauses the webhook.
- **Daily summary at**, a time, arrives with slice 3, for every webhook that wants `day.summary`.

## The API

Signed-in owners and admins only, never API keys, in `apps/server/src/http/routes/households/current/webhooks/`:

- `GET /api/households/current/webhooks`, `POST /api/households/current/webhooks`
- `GET`, `PATCH` (including pausing and resuming) and `DELETE /api/households/current/webhooks/{webhookId}`
- `POST /api/households/current/webhooks/{webhookId}/test`
- `GET /api/households/current/webhooks/{webhookId}/secret`, `POST /api/households/current/webhooks/{webhookId}/secret/rotate`
- `GET /api/households/current/webhooks/{webhookId}/deliveries`, paged with `limit` and `offset`, with the `total`, as other lists are
- `POST /api/households/current/webhooks/{webhookId}/deliveries/{deliveryId}/resend`

The server admin's setting goes through `PATCH /api/settings/server`, like the others. Every event and its payload is in the spec's `webhooks` section.

## Data

- **`webhooks`**, household-scoped: a name; the host in the clear; references to the sealed address, secret, previous secret (with when it stops being sent) and headers; the events it wants, or everything; its state (`active`, `paused`), why and when it paused; who made it (null if they're deleted); created and updated.
- **`webhook_events`**, household-scoped: the id (`msg_…`), the type, the payload, whether it's gathered and whether it's been merged (`gathered` and `merged`, added with the second pull request), an optional key unique in the household (so a scheduled event is sent once: `day.summary:2026-11-10`, `meal.time_to_start:2026-11-10:dinner`) and when it happened.
- **`webhook_deliveries`**, household-scoped like every table with household data (the schema test insists): the event, the webhook, its state (`waiting`, `delivered`, `failed`, `stopped`), tries, the last status code, the first 1 KB of the last answer, how long it took, the last error, and when it was delivered.

The `key` column arrives with slice 3, which is the first to need it. One migration for SQLite and one for Postgres for each slice that adds tables or columns.

## The module and its settings

A `webhooks` module in `apps/server/src/modules/webhooks/`: its settings (`settings.ts`, and `modules/settings.ts`), its status and the `webhooks` capability. Its jobs are listed in `services/jobs/handlers.ts` and its routes under `http/routes/`, like every module's; the addresses it calls are the ones households chose. Nothing calls out until a household adds a webhook. Its settings:

- `webhooks.enabled` (`MERRAN_WEBHOOKS`), a switch, on by default: off hides the page, refuses the routes, records nothing and leaves saved webhooks as they are. A delivery whose next try comes while it's off is stopped, and isn't sent when it's turned back on; each can be sent again with **Resend**.
- `webhooks.homeNetwork` (`MERRAN_WEBHOOKS_HOME_NETWORK`): `off`, `all` or `chosen`.
- `webhooks.homeNetworkHouseholds`: the chosen households, picked in Settings → Webhooks → Whole server; not from the environment.

## Cooking sessions and timers

Slice 2. The routes, in `apps/server/src/http/routes/cooking/sessions/`:

| Route | Cook view calls it when | What happens |
|---|---|---|
| `POST /api/cooking/sessions` with the recipe, the planned meal if any, and servings | Someone leaves Get ready, or cook view reopens straight into the steps | A session starts; `cooking.started` |
| `PATCH /api/cooking/sessions/{sessionId}` with servings, if they changed | Every 5 minutes while cook view is open and on screen, and when servings change | The session's last word is now |
| `PUT /api/cooking/sessions/{sessionId}/timers/{timerId}` with the label and the seconds left | A timer starts, or gets **+1 minute** | `timer.started` the first time, `timer.extended` after |
| `DELETE /api/cooking/sessions/{sessionId}/timers/{timerId}` | A timer is cancelled before it goes off | `timer.cancelled`. Dismissing a finished one changes nothing |
| `POST /api/cooking/sessions/{sessionId}/end` | Someone leaves cook view without Made it; sent with `navigator.sendBeacon` on `pagehide` too | `cooking.ended`, `stopped` |
| `POST /api/recipes/{recipe}/made` gains an optional session | Made it, as today | `meal.cooked`, then `cooking.ended`, `made` |
| `GET /api/cooking/sessions` | Never: it's for Home Assistant | Who's cooking now, what, and their running timers |

- **Timers are sent as seconds left,** and the server works out when they end, so a device whose clock is off doesn't put them off.
- **The server sends `timer.finished`.** Each timer has a keyed job (`cooking.timerDone`, key `timer:<id>`) at its end; **+1 minute** moves it and cancelling removes it.
- **Sessions end on their own.** A job every 5 minutes ends a session with no word from cook view for 30 minutes and no timer still running, as `timed_out`, and any session still open after 12 hours. So the hood fan doesn't stay on all night.
- **Cook view's reports never get in the way of cooking.** A call that fails is dropped, and nothing is saved up to send when it's back online: "started cooking", an hour late, is no use to anyone. The session id is kept with cook view's place in the recipe, so a reload carries on with it; if it's ended meanwhile, a new one starts.
- **Guests cooking from a shared link never report.** Their cooking is theirs alone, as it is now ([recipe-sharing.md](recipe-sharing.md)).
- **Two devices are two sessions,** even for one recipe.
- **Sessions are recorded whether or not a webhook wants them,** so `GET /api/cooking/sessions` works for a Home Assistant sensor without webhooks. The server already hears about cooking from Made it.
- **Permissions:** API keys may read sessions with plan read access, and start and change them with plan write access, for a kitchen display of someone's own.
- **Data:** `cooking_sessions`, household-scoped (the cook, the recipe, the planned meal, servings, started, last heard from, ended, the outcome) and `cooking_timers` (the session, its id from cook view, the label, when it ends, finished or cancelled). They're for what's happening now, not a history, so the daily clean-up clears them after 30 days.

## Scheduled heads-ups

Slice 3. One job, `webhooks.schedule`, every 5 minutes, looks only at households with an active webhook that wants `day.summary`, `meal.time_to_start` or `pantry.use_soon`, and works in each household's time zone (`householdClock`):

- **`day.summary`** once the household's time has passed today, once a day.
- **`meal.time_to_start`** for each of today's slots with a time (`plan_slot_times`), at the slot's time minus its longest dish's `totalMinutes`, or prep and cook minutes added up when there's no total. Slots whose dishes have no times are skipped, as is the week's pool, which has none. Each slot sends once a day, and never more than 15 minutes late: a meal planned after its start time passed says nothing.
- **`pantry.use_soon`** with the daily run, listing what came into the window since the last one sent; nothing when nothing did.

The event keys in `webhook_events` make sure each goes once, however the job's runs fall. Prep reminders ("take the chicken out") use the same scheduler once Notifications is built.

## Build order

Four pull requests. Each brings its own `en.json` strings, migrations, regenerated API clients (`openapi`, then the web and extension `api` scripts), docs and guides.

1. **`feat: webhooks`:** `record()`, the three tables, signing, delivery and the retry schedule in the runner, pausing, the deliveries log, the module and its home-network setting, the Webhooks page, `webhook.test` and the recipe events. The site guide, `integrations/webhooks.md`, with Home Assistant and n8n examples.
2. **`feat: more webhook events`:** the rest of slice 1, and gathering.
3. **`feat: cooking and timer webhooks`:** slice 2.
4. **`feat: daily heads-ups by webhook`:** slice 3.

## Tests

On SQLite and Postgres (`test:all`):

- **Signing** against Standard Webhooks' published test vectors, with the `standardwebhooks` package checking signatures in the tests only.
- **Delivery** to a receiver started on `127.0.0.1` in the test, with the home network allowed: the body sent is the body signed, headers, a 2xx, a timeout, a 3xx, a `410`.
- **Retries** on a fake clock: the whole schedule, then pausing; resuming and resending.
- **The home network:** refused when saved and when sent, for a household that isn't allowed; a name that resolves home after saving; allowed for every household and for chosen ones; link-local addresses refused even then.
- **Households stay apart:** a webhook never hears another household's events, and the routes are covered by the generated isolation tests.
- **`record()`** does nothing with no webhook that wants the event, and a change that rolls back sends nothing.
- **Gathering:** 30 changes in a window make one event, with exact counts.
- **Each event** is recorded by the change that should send it, and its payload matches its schema; imports of other apps and background runs don't send per recipe.
- **Cooking:** a session from start to each ending, timers finishing, being extended and cancelled, sessions timing out, guests never recording.
- **The schedule:** a summary at the household's time across a daylight saving change, each event sent once.

The page is checked in the dev household. Real Home Assistant and n8n automations are tried by hand, from the guide.

## Docs that change with each pull request

- [features.md](features.md): the Webhooks row's status and notes.
- [platform.md](platform.md#webhooks): kept short, pointing here.
- The site: `integrations/webhooks.md` (new: setting one up, every event with a sample, checking signatures in JavaScript and Python, retries and pausing, the home network, Home Assistant and n8n examples), `run/configuration.md` for the home-network setting (`pnpm --filter @merran/docs settings:generate`), `api/index.md` for where webhooks are, the roadmap's Webhooks line, and cook view's guide for what it reports.
- [operations.md](operations.md): the webhooks row of what leaves the server.

## Later

- **Server webhooks** for the server admin, on the same engine: an update is available, a job keeps failing, someone signed up, a backup finished.
- **Each list item on its own** (`list.item.added`, `.checked`, `.removed`), for mirroring the list into another app.
- **Prep reminders** as an event, with Notifications.
- **Live updates driven by `record()`,** so the two can't disagree.
- Members joining and leaving; stars after cooking; nutrition and photo runs finishing.
