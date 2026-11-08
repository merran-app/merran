# Swap planned meals and reorder dishes: implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a planned dish swap places with another dish, and let a meal's dishes (and the pool's, per meal type) be reordered, by drag, picker and menu, with Undo.

**Architecture:** Two new actions on `POST /plan/entries/bulk`, `swap` and `order`, handled in `bulkPlan` inside its transaction, answering `{ entries, before }` so the existing `/plan/restore` is Undo. The web app places dishes optimistically through `placeEntries` in `drag/optimistic-move.ts`, adds a shared "meal already has dishes" prompt used by drag and the picker, an insertion line for reordering computed by a tested pure function, and Move up / Move down menu items.

**Tech Stack:** Hono + zod-openapi, MikroORM, vitest (server); React, TanStack Query, Base UI / shadcn, `node --test` (web); i18next.

**Spec:** `docs/superpowers/specs/2026-11-08-swap-and-reorder-meals-design.md`

## Global Constraints

- Swaps are dish for dish. Bulk **Move** of several selected dishes never swaps.
- A swap exchanges `date`, `meal`, `anyDay` and `position` only; recipe, side, servings, note, status, `cookedAt`, `listedAt`, `pantryUsed`, variants and `why` stay with each dish. No list or pantry changes.
- `swap` refuses (400, nothing changed) unless `ids` is exactly two dishes on the plan in different meals. Message: "Swap needs two meals in different places".
- `order` refuses (400) ids in different meals; dishes in that meal not named follow in their current order.
- The pool reorders only within one meal type.
- Words people read go in `apps/web/src/locales/en.json`. Exact copy: "Swap with {{name}}", "Move alongside", "Move up", "Move down", "Drop to put it here", "Swapped {{a}} and {{b}}.", "Moved {{name}} up.", "Moved {{name}} down.", "Moved {{name}}.", "{{when}} already has dishes", and the drag announcement "Moving {{name}}. Drop on a meal, the any-day pool, or between this meal's dishes. Press Escape to cancel."
- Prompts use `@/components/ui/dialog` (it becomes a drawer on phones). Never a dialog-only component.
- Readable code per AGENTS.md: expanded control flow, named handlers. Run `pnpm format` from the root before each commit.
- The `api` scripts fail on this machine via `pnpm dlx`; run them in PowerShell with `$env:pnpm_config_cache_dir` set to a folder in `.local/`.

## Review Focus

1. **A live update moves a dish between the drag starting and the drop** (another household member). Expected: the swap or reorder is computed from the current cache and the server's answer wins; Undo still restores the snapshot. Pinned by the `order` test "dishes not named keep their order after the named ones" (Task 2).
2. **Swapping a dish with one in another week through the picker.** Expected: both land in each other's weeks, and the optimistic update tolerates the other week not being cached. Pinned in Task 4's test "swap with an uncached dish moves only the cached one and rolls back".
3. **Swapping a pool lunch with Wednesday dinner.** Expected: the pool dish becomes Wednesday *dinner* (where it was dropped), and the dinner goes into the pool still a dinner, last among the pool's dinners. Swapping two pool dishes is refused. Pinned by Task 1's pool tests.
4. **Undo after the swapped dishes were changed again** (e.g. marked cooked). Expected: restore puts back locations from the snapshot as moves already do; covered by existing restore behaviour, asserted in Task 1's undo test.
5. **Reordering with one dish, or dropping in the same place.** Expected: no request, no toast. Pinned by Task 5's `reorderFor` tests returning `null`.

---

### Task 1: Server `swap` action

**Files:**
- Modify: `apps/server/src/services/plan/plan.ts` (`BulkAction` ~line 516, `bulkPlan` ~line 525)
- Modify: `apps/server/src/http/schemas/plan.ts` (`PlanBulkSchema` ~line 271)
- Modify: `apps/server/src/http/routes/plan/entries/bulk/post.ts`
- Test: `apps/server/src/http/routes/plan/plan.test.ts` (new `describe("swapping meals")`)

**Interfaces:**
- Produces: `BulkAction` gains `{ action: "swap" }`. Bulk body `{ ids: [a, b], action: "swap" }` → `200 { entries: PlanEntry[2], before: PlanEntrySnapshot[2] }`, or `400` with code `bad_swap`.

- [ ] **Step 1: Write the failing tests**

In a new `describe("swapping meals")` using the file's `add`, `plan`, `clearAll` helpers:

```ts
test("trades places and keeps everything else", async () => {
  await clearAll()
  const tuesday = addDays(week, 1)
  const thursday = addDays(week, 3)
  const first = await add({ date: tuesday, meal: "dinner", note: "Leftovers" })
  const soup = await add({
    date: tuesday, meal: "dinner", recipe: "tomato-soup",
    withRecipe: "garlic-rice", servings: 6,
  })
  await kyle.patch(`/api/plan/entries/${soup.id}`, { status: "skipped" })
  const bread = await add({ date: thursday, meal: "lunch", recipe: "soda-bread" })
  const res = await kyle.post("/api/plan/entries/bulk", {
    ids: [soup.id, bread.id], action: "swap",
  })
  expect(res.status).toBe(200)
  const after = await plan()
  const byId = (id: string) => after.find((entry: { id: string }) => entry.id === id)
  expect(byId(soup.id)).toMatchObject({
    date: thursday, meal: "lunch", anyDay: false, position: 0,
    status: "skipped", servings: 6, withRecipe: { slug: "garlic-rice" },
  })
  expect(byId(bread.id)).toMatchObject({
    date: tuesday, meal: "dinner", anyDay: false, position: 1,
  })
  expect(byId(first.id)).toEqual(first)
  await kyle.post("/api/plan/restore", { entries: (await res.json()).before })
  const restored = await plan()
  expect(restored.find((entry: { id: string }) => entry.id === soup.id))
    .toMatchObject({ date: tuesday, meal: "dinner", position: 1 })
})

test("swaps a pool meal with a dated one", async () => {
  // pool lunch L ↔ Wednesday dinner D (pool already has a dinner P at 0):
  // L becomes Wednesday dinner at D's old position; D goes into the pool
  // as a dinner (date = week, anyDay true, meal "dinner") at position 1.
})

test("refuses two pool meals", async () => {
  // pool lunch ↔ pool dinner → 400 bad_swap
})

test("leaves the list and the pantry alone", async () => {
  // A dish put on the list (POST /api/list/from-plan) swapped: GET /api/list
  // items and GET /api/pantry are deep-equal before and after.
})

test.each([
  ["one meal", 1], ["three meals", 3],
])("refuses %s", async (_, count) => { /* 400, code bad_swap, plan unchanged */ })

test("refuses a meal that isn't on the plan", async () => {
  // ids [real, crypto.randomUUID()] → 400 bad_swap, real unchanged
})

test("refuses two meals in the same place", async () => {
  // both Tuesday dinner → 400 bad_swap
})
```

Fill in the sketched bodies with the same helpers and `expect` style; the assertions named in the comments are the requirement.

- [ ] **Step 2: Run to verify they fail**

Run: `pnpm --filter @merran/server test -- plan.test.ts -t "swapping meals"`
Expected: FAIL (schema rejects `action: "swap"` with 400 validation, not `bad_swap`).

- [ ] **Step 3: Implement**

- `PlanBulkSchema.action`: `z.enum(["remove", "move", "status", "swap", "order"])` (add `order` now so Task 2 only adds behaviour), plus a refine: `action !== "swap" || ids.length === 2` → message "Swap needs two meals in different places", path `["ids"]`.
- `BulkAction`: add `| { action: "swap" }` (Task 2 adds `order`).
- In `bulkPlan`, before the `for` loop: when `action.action === "swap"`, require `entries.length === 2`, that they aren't in the same slot (same `date`, `meal`, `anyDay`), and that at least one isn't `anyDay`; otherwise `throw new AppError("invalid", "bad_swap", "Swap needs two meals in different places.")`. Capture both places first. A dish going to a dated place takes its `date`, `meal`, `anyDay` and `position` exactly. A dish going into the pool takes the pool's `date` and `anyDay: true`, keeps its own `meal`, and gets `nextPosition(tx, { date, meal, anyDay: true })`. Don't go through `change()`, which would append dated dishes too. Skip the per-entry loop for swap. The shopping/cooking `followPlan`/`followCooking` calls after the loop stay, as for moves.
- The route maps `action === "swap"` to `{ action }`, and its `description` adds: "Swap two meals' places, or put one meal's dishes in order."

- [ ] **Step 4: Run to verify they pass**

Run: `pnpm --filter @merran/server test -- plan.test.ts`
Expected: PASS, including the existing move tests.

- [ ] **Step 5: Commit**

```bash
pnpm format
git add apps/server/src
git commit -m "Swap two planned meals' places in one bulk action"
```

### Task 2: Server `order` action

**Files:**
- Modify: `apps/server/src/services/plan/plan.ts`, `apps/server/src/http/schemas/plan.ts`, `apps/server/src/http/routes/plan/entries/bulk/post.ts`
- Test: `apps/server/src/http/routes/plan/plan.test.ts` (new `describe("putting a meal's dishes in order")`)

**Interfaces:**
- Consumes: Task 1's schema enum.
- Produces: `BulkAction` gains `{ action: "order" }`. Body `{ ids, action: "order" }` → `200 { entries, before }` where `entries` are every dish in that meal, in order, and `before` snapshots them all; `400` code `bad_order`.

- [ ] **Step 1: Write the failing tests**

```ts
test("saves the new order", async () => {
  // three Tuesday dinners a, b, c → order [c, a, b] → positions c0 a1 b2;
  // restore(before) → a0 b1 c2
})
test("dishes not named keep their order after the named ones", async () => {
  // a, b, c, d; order [c, a] → c0 a1 b2 d3
})
test("orders the pool within a meal type", async () => {
  // pool lunches x, y and pool dinner z; order [y, x] → y0 x1, z untouched
})
test("refuses dishes from different meals", async () => {
  // Tuesday dinner + Wednesday dinner → 400 bad_order, nothing changed
})
```

- [ ] **Step 2: Run to verify they fail**

Run: `pnpm --filter @merran/server test -- plan.test.ts -t "in order"`
Expected: FAIL.

- [ ] **Step 3: Implement**

In `bulkPlan`, for `order`: refuse with `AppError("invalid", "bad_order", "Put dishes in order one meal at a time.")` unless every found entry shares `date`, `meal` and `anyDay`. Load the rest of that slot (`tx.find(PlanEntry, { date, meal, anyDay }, { orderBy: { position: "asc" }, populate: POPULATE })`), build the order as the named entries in `ids` order followed by the others in their current order, and assign `position = index`. `before` and `entries` cover the whole slot so Undo restores every position. No `followPlan`/`followCooking` changes are needed (location within a slot doesn't affect them), but keep the shared calls harmless.

- [ ] **Step 4: Run to verify they pass**

Run: `pnpm --filter @merran/server test -- plan.test.ts`
Expected: PASS.

- [ ] **Step 5: Regenerate the API and commit**

```bash
pnpm --filter @merran/server openapi
```
Then in PowerShell: `$env:pnpm_config_cache_dir = "$PWD\.local\pnpm-cache"; pnpm --filter @merran/web api; pnpm --filter @merran/extension api`. Confirm the two `schema.d.ts` files match (`git diff --stat`).

```bash
pnpm format
git add apps/server apps/web/src/lib/api/schema.d.ts apps/extension
git commit -m "Put a meal's dishes in order in one bulk action"
```

### Task 3: `test:all` on Postgres

- [ ] **Step 1:** `pnpm --filter @merran/server db:test-postgres`, then `pnpm --filter @merran/server test:all`. Expected: PASS. If Docker won't start, say so in the PR rather than skipping silently.

### Task 4: Optimistic swap and order in the cache

**Files:**
- Modify: `apps/web/src/features/plan/drag/optimistic-move.ts`
- Test: `apps/web/src/features/plan/drag/optimistic-move.test.ts`

**Interfaces:**
- Produces:
  - `optimisticSwap(client: QueryClient, a: string, b: string, partner?: Place): Promise<() => void>`, which places each where the server will (Task 1's rule: exact place on a day; into the pool keeping its meal, last among that meal) and returns rollback.
  - `optimisticOrder(client: QueryClient, ids: string[]): Promise<() => void>`, which gives `ids` positions 0…n-1 and the slot's other cached dishes the following positions in their current order, and returns rollback.

- [ ] **Step 1: Write the failing tests** (`node:test`, the file's `entry` and `read` helpers)

```ts
test("swaps two cached meals and rolls back only them", async () => { /* a pool dinner ↔ b Tue lunch pos 1: a → Tue lunch pos 1; b → pool, meal "lunch", last among pool lunches; c untouched; rollback restores a and b */ })
test("swap with an uncached dish moves only the cached one and rolls back", async () => { /* b not in any range */ })
test("orders a slot, the unnamed after", async () => { /* a0 b1 c2, order [c] → c0 a1 b2; rollback → a0 b1 c2 */ })
```

- [ ] **Step 2:** `pnpm --filter @merran/web test`. Expected: FAIL (not exported).

- [ ] **Step 3: Implement** both with `placeEntries`, as `optimisticMove` does. When `b` isn't cached, `partner` gives its place (the picker passes it from its fetched occupants). `Place` is the file's existing type; export it.

- [ ] **Step 4:** `pnpm --filter @merran/web test`. Expected: PASS.

- [ ] **Step 5: Commit** `git commit -m "Show swaps and reordering at once, rolling back on failure"`

### Task 5: Insertion index and line, as pure functions

**Files:**
- Create: `apps/web/src/features/plan/drag/insertion.ts`
- Create: `apps/web/src/features/plan/drag/insertion.test.ts`
- Modify: `apps/web/package.json` (`test` script: add `src/features/plan/drag/insertion.test.ts`)

**Interfaces:**
- Produces:
  - `type Box = { left: number; top: number; width: number; height: number }`
  - `insertionIndex(boxes: Box[], point: { x: number; y: number }): number`. `boxes` are the *other* dishes in reading order; the result is in 0…boxes.length.
  - `insertionBar(boxes: Box[], index: number): Box`, the bar to draw, 3px thick.
  - `reorderFor(ids: string[], moving: string, index: number): string[] | null`, the new order with `moving` inserted at `index` among the others, or `null` when that equals `ids` or `ids.length < 2`.

- [ ] **Step 1: Write the failing tests**

```ts
const stacked = [0, 46, 92].map((top) => ({ left: 0, top, width: 200, height: 40 }))
test("stacked: before, between, after", () => {
  assert.equal(insertionIndex(stacked, { x: 50, y: 10 }), 0)
  assert.equal(insertionIndex(stacked, { x: 50, y: 30 }), 1)
  assert.equal(insertionIndex(stacked, { x: 50, y: 70 }), 2)
  assert.equal(insertionIndex(stacked, { x: 50, y: 200 }), 3)
})
const grid = [
  { left: 0, top: 0, width: 200, height: 40 },
  { left: 210, top: 0, width: 200, height: 40 },
  { left: 0, top: 50, width: 200, height: 40 },
]
test("grid: reading order", () => {
  assert.equal(insertionIndex(grid, { x: 50, y: 20 }), 0)
  assert.equal(insertionIndex(grid, { x: 150, y: 20 }), 1)
  assert.equal(insertionIndex(grid, { x: 260, y: 20 }), 1)
  assert.equal(insertionIndex(grid, { x: 350, y: 20 }), 2)
  assert.equal(insertionIndex(grid, { x: 150, y: 60 }), 3)
})
test("bar: horizontal when stacked, vertical in a row", () => {
  assert.deepEqual(insertionBar(stacked, 1), { left: 0, top: 41.5, width: 200, height: 3 })
  assert.deepEqual(insertionBar(grid, 1), { left: 203.5, top: 0, width: 3, height: 40 })
})
test("reorderFor", () => {
  assert.deepEqual(reorderFor(["a", "b", "c"], "a", 2), ["b", "c", "a"])
  assert.equal(reorderFor(["a", "b", "c"], "b", 1), null)
  assert.equal(reorderFor(["a"], "a", 0), null)
})
```

- [ ] **Step 2:** `pnpm --filter @merran/web test`. Expected: FAIL.

- [ ] **Step 3: Implement.** The rule for `insertionIndex`: count the boxes the point is past. A box is passed when `point.y > box.top + box.height`, or when the point is within its rows (`point.y >= box.top`) and it shares a row with another box (same `top`) and `point.x > box.left + box.width / 2`, or it shares none and `point.y > box.top + box.height / 2`. `insertionBar` centres the bar in the gap before `boxes[index]` (or after the last), vertical when that box shares a row with its neighbour, horizontal otherwise.

- [ ] **Step 4:** `pnpm --filter @merran/web test`. Expected: PASS.

- [ ] **Step 5: Commit** `git commit -m "Work out where a dragged dish goes among a meal's dishes"`

### Task 6: Plan actions and words

**Files:**
- Modify: `apps/web/src/features/plan/use-plan-actions.ts`
- Modify: `apps/web/src/locales/en.json` (`plan.drag`, plus new `plan.swapped`, `plan.reordered`)

**Interfaces:**
- Consumes: Task 4's `optimisticSwap` and `optimisticOrder`.
- Produces on `usePlanActions()`:
  - `swap(entry: PlanEntry, other: PlanEntry): Promise<boolean>`, with toast "Swapped {{a}} and {{b}}." and Undo (`undoable(..., before, true)`), or "Couldn't save the move. The meal is back where it was." on failure.
  - `reorder(entry: PlanEntry, ids: string[], how: "up" | "down" | "drag"): Promise<boolean>`, with toast `plan.reordered.up | down | drag`.

- [ ] **Step 1:** Add keys to `en.json`: `plan.drag.swapWith` "Swap with {{name}}", `plan.drag.occupiedTitle` "{{when}} already has dishes", `plan.drag.occupied` "Swap {{name}} with one of them, or put it alongside them.", `plan.drag.dropBetween` "Drop to put it here", update `plan.drag.pickedUp`, `plan.swapped` "Swapped {{a}} and {{b}}.", `plan.reordered.up` "Moved {{name}} up.", `.down` "Moved {{name}} down.", `.drag` "Moved {{name}}.", `plan.moveUp` "Move up", `plan.moveDown` "Move down".
- [ ] **Step 2:** Implement `swap` and `reorder` beside `bulk`, sharing its run, rollback and toast handling by extracting a named helper rather than duplicating it.
- [ ] **Step 3:** `pnpm --filter @merran/web typecheck`. Expected: PASS.
- [ ] **Step 4: Commit** `git commit -m "Plan actions for swapping and reordering, with Undo"`

### Task 7: Shared "already has dishes" prompt, used by drag and the picker

**Files:**
- Create: `apps/web/src/features/plan/drag/occupied-prompt.tsx`
- Modify: `apps/web/src/features/plan/drag/meal-drag.tsx` (replace the inline `Dialog`)
- Modify: `apps/web/src/features/plan/change-meal-dialog.tsx` (`MoveMealsDialog.move`)

**Interfaces:**
- Produces: `OccupiedPrompt({ entry, occupants, when, busy, onSwap, onAlongside, onCancel }: { entry: PlanEntry; occupants: PlanEntry[]; when: string; busy: boolean; onSwap: (other: PlanEntry) => void; onAlongside: () => void; onCancel: () => void })`, an always-open `Dialog`, with buttons stacked full width: one `Swap with {name}` per occupant, `Move alongside`, `Cancel`.

- [ ] **Step 1:** Build `OccupiedPrompt` and use it in `MealDragProvider`; `onSwap` calls `actions.swap(pendingEntry, other)`.
- [ ] **Step 2:** In `MoveMealsDialog`, when `ids.length === 1`, the destination is dated and its meal is known: fetch occupants with `queryClient.fetchQuery(planQuery(date, date))`, filtered to that meal and excluding the dish. If there are any, close the picker and show `OccupiedPrompt`; `onSwap` calls `actions.swap(entry, other)`, passing the uncached partner's place to `optimisticSwap` (Task 4). Otherwise move as today. `MoveMealsDialog` needs the entry, so it takes `entry?: PlanEntry` from its single-dish callers (`MealDragHandle`, Move or change).
- [ ] **Step 3:** `pnpm --filter @merran/web typecheck`. Then check by hand in the dev server: drag onto an occupied dinner offers each swap; the picker to another week's occupied lunch offers the swap; at phone width both open as drawers.
- [ ] **Step 4: Commit** `git commit -m "Offer to swap with each dish when a meal already has some"`

### Task 8: Drag to reorder, with the insertion line

**Files:**
- Modify: `apps/web/src/features/plan/drag/meal-drag.tsx`
- Modify: `apps/web/src/features/plan/meal-tile.tsx` (tile root gets `data-meal-dish={entry.id}`)

**Interfaces:**
- Consumes: Task 5's `insertionIndex`, `insertionBar`, `reorderFor`; Task 6's `actions.reorder`.

- [ ] **Step 1:** In `MealDragProvider`, the dragged dish's group is `entries` in the same slot (`sameSlot`) with the same `meal`, in position order. When `destinationAt` is the source's own slot and the group has 2+ dishes, read the other dishes' boxes from `[data-meal-dish]` elements (`getBoundingClientRect`), keep `insertAt = insertionIndex(boxes, point)` in state, and render a `pointer-events-none fixed` bar at `insertionBar(boxes, insertAt)` with the `plan.drag.dropBetween` label. `MealDropZone` accepts its own slot in this case without the outline.
- [ ] **Step 2:** On drop in the own slot: `const order = reorderFor(groupIds, source.id, insertAt)`; if not null, `actions.reorder(source, order, "drag")`.
- [ ] **Step 3:** `pnpm --filter @merran/web typecheck`; check by hand: reorder three dinners by mouse and at phone width by touch; reorder pool dinners in the 2-column grid; dropping in place does nothing; Undo puts them back; Escape cancels.
- [ ] **Step 4: Commit** `git commit -m "Drag a dish to a new place among its meal's dishes"`

### Task 9: Move up and Move down in the menus

**Files:**
- Modify: `apps/web/src/features/plan/meal-tile.tsx` (`MealMenuItems`)

- [ ] **Step 1:** `MealMenuItems` gets the dish's group ids (from the `MealTile` caller via a new `group: string[]` prop; the day card and pool card already have the entries). After **Move or change**, show **Move up** unless it's first, and **Move down** unless it's last. Neither shows when the group has fewer than two dishes. They call `actions.reorder(entry, reorderFor(group, entry.id, index ± 1)!, "up" | "down")`.
- [ ] **Step 2:** `pnpm --filter @merran/web typecheck`; check both the **More** menu and the right-click menu by hand.
- [ ] **Step 3: Commit** `git commit -m "Move a dish up or down from its menus"`

### Task 10: Docs and final checks

**Files:**
- Modify: `docs/features.md` (Planning: "Quickly move planned meals…" row)
- Modify: `docs/shopping-and-planning-feedback.md` (under "Rearrange meals after automatic planning")
- Modify: `apps/docs/src/content/docs/docs/use/planning.md`

- [ ] **Step 1:** features.md row notes: swaps with a dish already in a meal (drag or picker) and reordering by drag or Move up / Move down are built ([#45](https://github.com/merran-app/merran/issues/45)); drop "direct swaps remain planned".
- [ ] **Step 2:** The decision doc gets a paragraph dated November 8, 2026: swaps are dish for dish; the prompt offers each dish; the pool reorders within a meal type; bulk Move never swaps.
- [ ] **Step 3:** The planning guide describes swapping and reordering, quoting `en.json` labels exactly. No "not released" wording.
- [ ] **Step 4:** Run `pnpm typecheck`, `pnpm format:check`, `pnpm --filter @merran/server test`, `pnpm --filter @merran/shared test`, `pnpm --filter @merran/web test`, `pnpm docs:build`. All pass.
- [ ] **Step 5: Commit** `git commit -m "Document swapping meals and reordering dishes"`
