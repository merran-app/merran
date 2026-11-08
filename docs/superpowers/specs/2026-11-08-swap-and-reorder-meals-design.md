# Swap planned meals and reorder dishes within a meal

Design agreed November 8, 2026, for [#45](https://github.com/merran-app/merran/issues/45). It extends [Rearrange meals after automatic planning](../../shopping-and-planning-feedback.md#rearrange-meals-after-automatic-planning), which shipped moves in alpha.4 and left direct swaps planned.

## What it's for

After Fill the week or the autoplan, people rearrange the week. Moves exist, but two meals can't trade places: dropping on a dated meal that already has dishes only offers **Move alongside**, so a swap takes three moves. And when a meal has more than one dish, their order can't be changed.

Done means:

- A dish dropped on a meal with dishes can swap with any one of them, in one step, with Undo.
- A meal's dishes, and the any-day pool's, can be dragged into a new order, or moved up and down from a menu.
- Everything moves already have still holds: highlighted destinations, the destination picker as the click and keyboard path, mouse, pen and touch, immediate updates with rollback on failure, and Undo.

Out of scope: dragging a recipe from the picker into a meal ([#46](https://github.com/merran-app/merran/issues/46)), swapping whole days, saved plans, and swapping several selected meals at once.

## Words

- A **meal** is a slot: Tuesday dinner, or one meal type in the week's pool.
- A **dish** is one plan entry in it, with its own recipe or note, side, servings and status. A meal can hold several.

## Behaviour

### Swap

Dragging dish A onto a meal that holds dish B and choosing **Swap with B**:

- A takes B's day, meal, any-day flag and position. B takes A's. Each lands in the other's place in its list.
- Everything else stays with each dish: recipe, side, servings, note, status, `cookedAt`, `listedAt`, `pantryUsed`, shopping variants and `why`.
- Nothing is regenerated. Theme nights aren't enforced, as with **Move or change**. The shopping list and the pantry are untouched.
- Swapping with a dish in the same meal isn't offered: that's reordering.
- **Pool:** a pool dish dropped on a dated meal can swap. The pool dish takes the dated meal's place, meal type included. The dated dish goes into the pool keeping its own meal type, last among that type, as a move into the pool does. Dropping on the pool itself moves, with no prompt, as today, so two pool dishes are never swapped.
- Skipped and cooked dishes can be swapped; their status goes with them.

### Reorder

- Within one meal, the dishes' positions are rewritten 0…n-1 in the new order. Nothing outside that meal changes.
- The pool sorts by meal type, then position. A dish reorders only among pool dishes of its own meal type: the first dinner can't move above a lunch.
- **Move up** is hidden on the first dish of its group and **Move down** on the last. Neither shows when the group has one dish.

### Shared with moves

Changes show at once, with **Undo**. A failed save puts back only the dishes involved and says so. Selection mode turns dragging off. Nothing is added to or taken off the list.

## UI

All in `apps/web/src/features/plan/`, mostly `drag/meal-drag.tsx`, `meal-tile.tsx` and `change-meal-dialog.tsx`. New words go in `locales/en.json`.

### The drop prompt

Replaces today's **Move alongside** prompt and uses the app's `Dialog`, which is already a drawer on phones.

- Title: "Tuesday dinner already has dishes" (the day and meal).
- Buttons, stacked: **Swap with {name}** for each dish already there, then **Move alongside**, then **Cancel**.

### The destination picker

When **one** dish is being moved through the handle's tap or keyboard path and the chosen destination is a dated meal with dishes, it asks the same question with the same buttons. **Move or change** still moves alongside: it saves servings, side and note with the move, and a swap would split that save (ruled while building, November 8, 2026). Bulk **Move** for several selected dishes is unchanged: they go alongside.

### The insertion line

- While a dish is dragged over its own meal, or its own meal-type group in the pool, the tiles there become targets. The pointer's position relative to each tile's middle decides before or after.
- A thin bar in the primary color is drawn in the gap as an overlay, so nothing shifts under the pointer, with a "Drop to put it here" label like the existing drop hints.
- In the pool's 2–3 column grid on wide screens, the line follows reading order and sits beside a tile.
- Working out the insertion index from tile rectangles and the pointer is a small pure function, so it can be tested on its own.
- Dropping where the dish already was does nothing.

### Menus

The dish's **More** menu and its right-click menu get **Move up** and **Move down**, beside **Move or change**, shown as described under Reorder.

### Messages

- Toasts with **Undo**: "Swapped Tacos and Pasta.", "Moved Salad up.", "Moved Salad down.", and "Moved Salad." after dragging to a new place.
- Screen readers hear the same through the existing status region. The drag announcement becomes: "Moving {name}. Drop on a meal, the any-day pool, or between this meal's dishes. Press Escape to cancel."

## API

`POST /plan/entries/bulk` (`changePlanEntries`) gains two actions: `action` is `remove | move | status | swap | order`. Both are added to `BulkAction` in `apps/server/src/services/plan/plan.ts` and handled in `bulkPlan`, inside its transaction.

### `swap`

- `ids` is exactly two dishes, both on the plan, in different meals, at least one of them on a day. Otherwise the answer is 400, "Swap needs two meals in different places", and nothing changes. Unlike the other actions, a missing id isn't passed over: half a swap means nothing.
- A dish going to a day takes the other's `date`, `meal`, `anyDay` and `position` exactly. A dish going into the pool keeps its `meal` and goes last among that meal type. Positions are set directly rather than through `change()`, which would append. The same `followPlan` and `followCooking` calls as a move run afterwards, so cooking and shopping provenance behave as they do for a move.

### `order`

- `ids` are dishes all in one meal (same `date`, `meal` and `anyDay`), in their new order. Ids in different meals get a 400 and change nothing.
- The named dishes get positions 0…n-1. Other dishes in that meal, such as one someone added a moment ago, follow in their current order. A live update never makes a reorder fail.

### Answers and Undo

Both answer as the other actions do, `{ entries, before }`, all or nothing. `before` snapshots already hold `position`, so `/plan/restore` puts a swap or a reorder back exactly, with no change to restore.

The schema (`PlanBulkSchema` in `apps/server/src/http/schemas/plan.ts`) gets refinements for the rules above, and the route's description mentions swapping and ordering.

## The web app's state

- `usePlanActions().bulk` already sends any action. Its toasts get the messages above for `swap` and `order`.
- `drag/optimistic-move.ts` places cached entries by date, meal, any-day and position. Swap and order work out each dish's new place, show it at once, and roll back only those dishes on failure, then refresh from the server on success, as moves do.

## Tests

Server, in `apps/server/src/http/routes/plan/plan.test.ts`, on SQLite and Postgres:

- Swapping two dated dishes trades date, meal and position, and keeps recipe, side, servings, note, status, `cookedAt`, `listedAt` and variants.
- A pool dish swapped with a dated one: the pool keeps the meal type of the dish that went into it.
- A cooked dish swapped keeps its pantry use and status; nothing more is taken from the pantry.
- A listed dish swapped leaves the shopping list as it was.
- Swap is refused with one id, three ids, a missing id, or two dishes in the same meal, and nothing changes.
- Order saves the new positions; unnamed dishes in the meal follow in their old order; ids from different meals are refused.
- `/plan/restore` with `before` puts both a swap and a reorder back exactly.

Web:

- `optimistic-move.test.ts` covers swap and reorder placement, and rollback of only the dishes involved.
- The insertion-index function is tested for stacked and grid layouts.

Then `pnpm typecheck`, `pnpm format:check`, the server and shared tests, `test:all` when Docker's Postgres starts, and a check in the dev server: dragging on desktop and at phone width, the picker, the menus and Undo.

## Keeping everything current

In the same pull request, which closes #45:

- `pnpm --filter @merran/server openapi`, then the web and extension `api` scripts, so both `schema.d.ts` files match.
- `docs/features.md`: the "Quickly move planned meals" row says swaps and reordering are built.
- `docs/shopping-and-planning-feedback.md`: a dated note under "Rearrange meals after automatic planning" recording these decisions: swaps are dish for dish; the pool reorders within each meal type; several selected meals aren't swapped.
- `apps/docs/src/content/docs/docs/use/planning.md`: swapping and reordering, quoting the labels in `en.json` exactly.
