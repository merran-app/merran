# A pantry that keeps itself

November 5, 2026. Planned with the user. Parts 1 and 2 were built on November 6, 2026, and go out in alpha.8, ahead of the rest (decided November 7, 2026). Parts 3 to 5 were built on November 7, 2026, for alpha.8 too. The pantry works, but keeping it right is work: pressing **Put away**, fixing where things went, and noticing what ran out. When it drifts from what's really at home, the list leaves out things you need, which is worse than having no pantry at all. This plan makes the pantry stay roughly right using only moments when you're already in the app: finishing the shopping and finishing cooking.

Five parts, built in this order:

1. **Checking off puts it away**, then a drawer shows where it all went.
2. **It learns where things go**, so that drawer has less to fix each time.
3. **Ran out of anything?**, asked first when cooking is done, before **How did it go?**
4. **Cooking off the plan uses the pantry too.**
5. **Did you make these?** on Today, for past meals nobody marked.

Parts 1 and 2 are about food coming in, and 3 to 5 about food going out. Part 1 fills every household's pantry, and 3 to 5 are what keep it honest.

Thaw reminders on Today, leftovers as portions, and a quick "still got these?" check before **Add from plan** came up in the same conversation. They're for later, once these five are in use.

## What's there today

- Checking something off doesn't put it in the pantry. **Put away** on a list, **Put it all away**, or **Put purchases away and finish** in shopping mode does ([put-away.ts](../apps/server/src/services/pantry/put-away/put-away.ts)). It already puts the food in the fridge, freezer or cupboard with a use-by guess, sets it aside for the meals it was bought for, uses the packs bought from Kroger, skips household things and always-on-hand staples, and records the purchase for usual buys.
- Cooking a planned meal takes the recipe's amounts out of the pantry, using what was set aside for it first, and remembers what it took so marking it not cooked puts that back ([cooking.ts](../apps/server/src/services/pantry/cooking.ts)).
- **I made this** for a recipe with no meal today or in the week's pool sets when it was last made, and nothing else. The pantry isn't touched.
- A planned meal nobody marks stays set aside for six days, then its food counts as free stock for the next list.
- Aisles learn from one move: `FoodPlacement` remembers each food's aisle and list for the household.
- **How did it go?** after the cook view is stars and a note ([cook-notes.tsx](../apps/web/src/features/recipes/cook-notes.tsx)).

## 1. Checking off puts it away

**The setting.** **Settings → Shopping and stores** gets **Put food away when it's checked off**, on to start. With it off, everything works as it does today, **Put away** buttons included. Turning it on puts away anything already checked, so nothing gets cleared without going in. Turning it off leaves what's already in the pantry where it is, and **Put away** skips rows that have already gone in.

**Checking off.** Checking a row puts it in the pantry in the same save. That covers one row, a selection, Undo that checks rows again, and Kroger's **Mark … sent items bought**. It goes in the same way **Put away** works today:

- packs bought from Kroger
- fridge, freezer or cupboard, with a use-by guess (or the remembered place, part 2)
- set aside for the meals it was bought for
- recorded as a purchase
- household things and always-on-hand staples skipped: the purchase is recorded, but nothing goes in the pantry

Each row remembers what it added: which pantry item, how much, whether it made that item or gave an amount to one that had none, the meal shares it brought, and the purchase. Meals already do the same with what cooking took (`pantryUsed`).

**Unchecking** takes exactly that back out: the amount comes off the pantry item, its meal shares go, and the purchase is deleted. When cooking or **Used up** has taken some of it since, unchecking takes back what's left and never goes below zero. If the item is gone, there's nothing to take back. An item that was there with no amount ("have it") before the row gave it one goes back to having none, rather than going. Undo sends what a row put away back from the page, so unchecking leaves alone a pantry item or purchase of another food.

**Other changes to a checked row:**

- Changing its amount changes what went in: the old amount comes out and the new one goes in.
- Deleting it, **Clear checked** and **Clear the list** just tidy the list. The food was bought, so it stays in the pantry. A checked row that never went in goes in first, whichever way it's taken off.
- **Undo** after a clear brings the rows back checked, with what they put away, and adds nothing again.
- A meal taken off the plan after its food was checked works as today: the checked row stays, and what was set aside for the meal is free again.

**What the buttons become.** **Put away** and **Put it all away** are hidden while the setting is on. In shopping mode, **Put purchases away and finish** is hidden, leaving **Finish trip**.

**Receipts.** Receipt reading matches checked rows too. A line matching a row that's already been put away shows as already put away, unticked, so the purchase doesn't go in twice. Ticking it anyway adds it again, for when you really bought two.

**Where did it all go?** A drawer (a dialog on larger screens) that opens on the phone that finished:

- when the last unchecked item on a list is checked
- on **Finish trip** in shopping mode
- on **Clear checked**

It shows once for each batch: rows remember they've been looked over, so finishing and then clearing doesn't show it twice. Nothing to show means no drawer.

What those rows put in is grouped by **Fridge**, **Freezer** and **Cupboard**, each with its amount and use-by date:

- Tap a place to move it there. Moving to the freezer drops the date, as it does today.
- Tap the amount to fix it if you bought a bigger pack. That changes the pantry item, not the list.
- **Freeze some** splits it: say how much goes in the freezer, and the rest stays where it was.

The buttons are **Looks right** and **Open the pantry**.

## 2. It learns where things go

Moving all of something to another place, in the drawer or anywhere in the pantry (one item or a selection), remembers that place for the food. It's a new `storedIn` on `FoodPlacement`, next to the aisle and list it already remembers, and like aisles it learns from one move. Moving it back teaches that instead.

Put away, typed adds and receipts use the remembered place before guessing. A remembered freezer means no use-by date.

**Freeze some** doesn't teach anything, so freezing half a big pack once doesn't send all your chicken to the freezer from then on.

## 3. Ran out of anything?

When cooking is done, the drawer has two steps.

**First, Ran out of anything?** The recipe's foods (its side dish too) show as chips, one per food, in the recipe's order, with always-on-hand staples like oil and salt among them. Water is left out. Under the chips, **Put them on the list** is a switch, on to start. The buttons are **Next** and **Nothing ran out**.

**Next** saves straight away, so skipping the second step loses nothing. Each ticked food:

- is used up at home: every pantry item of it, apart from the freezer, unless the freezer is where cooking took it from. Running out of chicken mid-cook doesn't mean the frozen pack is gone.
- goes on the list, with the switch on, as a plain line for no meal, unless an unchecked line of it, or of a kind of it, is there already. Staples too, which makes this the way a staple gets on the list without you tapping it on the pantry page.

The message says what was used up and put on the list, with **Undo**, which puts the pantry back and takes those lines off the list. Marking the meal not cooked later doesn't bring them back: what ran out really ran out.

**Then, How did it go?** Stars and a note, as today.

**Where it shows:**

- after **Finish** in the cook view, as now
- in the message after marking a meal cooked anywhere else (Plan, Today, or **Made it** in part 5), which offers **How did it go?**

A recipe with no foods to show starts at the second step.

## 4. Cooking off the plan uses the pantry too

When you finish the cook view or press **I made this** and the recipe has no meal today or in the week's pool, Merran adds one to today, already cooked. It goes at the meal that fits the time of day, the way moving a pool meal to today already works, with the servings you cooked. So it takes from the pantry like any cooked meal, shows on the plan and in history, and marking it not cooked puts everything back. A meal of it already cooked today counts instead, so pressing **I made this** twice doesn't cook it twice. API keys use the same route, so they get this too; the assistant and MCP have no tool for it.

## 5. Did you make these?

A card on Today, above **Coming up**, lists recipe meals that are still marked planned from the past six days, and pool meals from a week that's over, for six days after it ends. Six days is how long the pantry keeps food set aside for a meal. Note meals like "eat out" aren't asked about: they take nothing from the pantry.

- **Made it** marks the meal cooked on its own day (at midday in the household's time zone), which takes from the pantry and records it. The message offers **How did it go?**
- **Didn't** marks it skipped, so what was set aside for it shows under **Use soon** as "was skipped". That part already works.
- **Made them all** shows when there are several.

Anyone in the household can answer, and the meal leaves the card on every phone through the live updates. After six days a meal drops off the card, and its food stops being set aside, as it does today.

## How it's built

**Data.** Migrations for SQLite and Postgres:

- `HouseholdSettings` gets `pantry: { putAwayWhenChecked: boolean }`. Absent means on.
- `ShoppingItem` gets `putAway`, JSON or null: the pantry item's id, the amount added, whether the item was made by it or given its first amount by it, the meal shares it brought, the purchase's id, and when it was looked over.
- `FoodPlacement` gets `storedIn`, nullable.
- No change to `PantryItem` or `PlanEntry`.

**One path for checking.** Every way a row's `checked` changes (one row, a selection, Undo's restore, mark bought, and turning the setting on) goes through one service function that puts away or takes back out in the same transaction. That keeps them from drifting. Checking a row that's already checked does nothing, so two phones checking the same row at once put it away once.

**Routes,** following the folders-mirror-paths rule. The paths are a starting point for the build:

- The existing list item, bulk and mark-bought routes put away when they check. Their answers say what went into the pantry, so the web app can refresh both.
- `GET /api/list/put-away`: what checked rows put away that hasn't been looked over, for one list or all. `POST /api/list/put-away/looked-over` marks them.
- `POST /api/pantry/items/{itemId}/split`: **Freeze some** (how much, and where it goes).
- `GET /api/pantry/ran-out?meal=`: the chips, worked out on the server so they're the foods the pantry and the list know. `POST /api/pantry/ran-out`: the foods, the meal, and whether to list them. It answers with what the pantry was and the lines it added, for Undo through the existing restore routes.
- `POST /api/recipes/{recipe}/made` takes the servings cooked, and answers with the meal it cooked, so the cook view can ask what ran out.
- `GET /api/plan/unmarked`: the meals to ask about. Today has no data of its own (it reads the plan), so this is its one new read. Answering uses the plan routes that are already there.
- `PATCH /api/pantry/items/{itemId}` and the pantry bulk route remember a whole move's place.

Then `openapi`, and the web and extension API types.

**Permissions.** A route takes one permission, from the area it belongs to. Checking off stays list write, as **Put away** is today, even though it writes to the pantry. **Ran out** is pantry write, even though it puts foods on the list, as adding a receipt takes things off it.

**Tests,** in the server's route tests on SQLite and Postgres:

- Check and uncheck give back exactly what was there, including when the row joined existing stock, with Kroger packs, and with staples.
- Unchecking after cooking took some takes back only what's left.
- Clear and its Undo; the setting off, on with rows already checked, and off again.
- Receipts don't count a put-away row twice.
- Split, and learning from a whole move but not from a split.
- **Ran out**: the freezer rule, staples on the list, and Undo.
- **I made this** off the plan adds a cooked meal, and marking it not cooked puts the pantry back.
- The six-day window for **Did you make these?**, and pool meals from weeks that are over.

The drawers get checked in the dev server on a phone-sized screen.

## Docs to update when it's built

- [features.md](features.md): the rows for these five parts.
- The site's guides: `use/shopping-and-pantry.md` ("Shop and put purchases away" and receipts), `use/cooking.md` (the two-step drawer, I made this), `use/planning.md` (Did you make these?), and the household settings it names. They quote `en.json`'s labels exactly.
- The homepage's demo shows a **Put away** button (`apps/docs/src/components/landing/main.html`). Check it still fits.
- The API reference comes from `openapi.json`.

## Decisions

Decided with the user on November 5, 2026:

| Decision | Choice | Why |
|---|---|---|
| First round | Parts 1 to 5. Thaw reminders, leftovers as portions and "still got these?" later | Food in, and the food-out checks that keep it honest, before anything that builds on an accurate pantry |
| Who gets auto put-away | A household setting, on by default | Most households want it. Households that don't keep a pantry can turn it off and get today's **Put away** back |
| When food goes in | The moment it's checked, with uncheck taking it back out | The pantry is right on every phone at once, there's no batch step to forget, and no nightly sweep guessing when you're done |
| Fixing places | A drawer once the shopping's done, with **Freeze some** | One look at what went where, when you're unpacking |
| Learning places | One whole move teaches; a split doesn't | Like aisles, without one half-frozen pack teaching the wrong thing |
| Ran out of anything? | Its own step, before **How did it go?** | Asked while it's fresh, and saved even if the stars are skipped |
| What "ran out" uses up | Everything of that food at home except the freezer, unless cooking took from the freezer | Running out mid-cook rarely means the frozen stock is gone |
| Cooking off the plan | Adds a cooked meal to today | Every cooked meal then uses the pantry and can be undone the same way |
| Unmarked meals | Asked about on Today for six days | The same six days the pantry keeps their food set aside |

Decided while building, November 6, 2026:

| Decision | Choice | Why |
|---|---|---|
| Changing a checked row's amount | Changes the pantry item by the difference, keeping its place, date and what cooking took | Taking it all out and putting it away again would lose the place you fixed and what cooking already took |
| Unchecking an item that had no amount before | It goes back to having none, rather than being removed | It was there before the row, so unchecking shouldn't make it vanish |
| What taking back touches | Only the same food | Undo can't be used to take other food out of the pantry |
| Clearing with the setting on | First puts away checked rows that never went in, and so does deleting a checked row or taking several off at once | Households upgrading start with the setting on, and their old checked rows would otherwise be cleared without going in. With a list for each store, the page clears a list by taking its rows off |
| Correcting a checked row's amount after its pantry item was changed by hand to words, "have it" or a unit that doesn't convert | Changes only the purchase and what the row remembers, and leaves the pantry item as it was set | What someone said is at home already counts what the row brought, so adding the row again would count it twice |
| Sending a checked row's same name again | Keeps the row's food | A row from the plan can be a food someone chose for the recipe's line, rather than its name's, and unchecking finds its purchase by that food |
| What teaches a place | Only a real move | Editing an item without moving it says nothing about where the food goes |
| Shopping mode's button | Keeps **Finish trip** | It was already there, and does what plain **Finish** was meant to |

Decided while building parts 3 to 5, November 7, 2026:

| Decision | Choice | Why |
|---|---|---|
| Ran out of something already on the list | No second line: an unchecked line of that food, or of a kind of it, counts | Two lines for the same salt would be noise, and the pantry already counts kosher salt as salt |
| Pool meals on **Did you make these?** | Asked about for six days after their week ends. Their food still stops being set aside when the week ends | A pool meal is dated to its week's first day, so the pantry frees its food as the week ends; changing that would change the list's maths too |
| When a past meal was cooked | A meal on an earlier day counts as cooked on its own day, at midday in the household's time zone, wherever it's marked. A pool meal from a week that's over counts as cooked on that week's last day | **Made it** on Saturday for Tuesday's meal shouldn't say the recipe was last made Saturday |
| **I made this** with today's meal of it already cooked | That meal counts: no second meal, and nothing more taken from the pantry | A second press is far more often a mistake than a second batch |
| Who else uses the made route | API keys only: the assistant and MCP have no tool for it | Corrects part 4, which said they did |

Decided after reviewing parts 3 to 5, November 7, 2026:

| Decision | Choice | Why |
|---|---|---|
| Which meal an off-plan cook goes in | The meal that fits the time of day if the household plans it; otherwise the latest it plans before then, or its first | A household that plans only lunch would never see a dinner on **Plan**, so couldn't mark it not cooked |
| Servings from the cook view, off the plan | Always sent, even at the recipe's own | Today's meal of it may be planned for other servings, and would keep those |
| **Made it** on two phones at once | The second waits for the first and finds its meal cooked | The pantry would otherwise be taken from twice |
| **Ran out** for a meal that isn't cooked | Refused | Running out is something cooking finds out; a planned meal took nothing and may not be made |
