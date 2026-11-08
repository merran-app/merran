# Mobile Gestures Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Swipe things on the shopping list and pantry items to act on them, and pull to refresh and swipe back from the left edge in the installed app.

**Architecture:** Plain functions for the maths in `apps/web/src/features/gestures/swipe-math.ts`, tested with `node --test`. Three components on pointer or touch events use them: `<SwipeRow>` (used by the list's `ItemRow` and the pantry's `PantryRow`), and `<PullToRefresh>` and `<EdgeBack>`, mounted once in `AppShell`. No new dependencies.

**Tech Stack:** React 19, TanStack Router and Query, Tailwind v4, i18next, `node:test`.

**Spec:** `docs/mobile-gestures.md` (read it first; this plan argues from it).

## Global Constraints

- No new packages. Pointer events (`onPointerDown/Move/Up/Cancel`) for rows; window `touchstart/touchmove/touchend` listeners for pull to refresh and edge back, because they need `preventDefault` on a non-passive `touchmove`.
- Row swipes: touch and pen only (`event.pointerType !== "mouse"`), below 768px only (`useIsMobile()` from `@/hooks/use-mobile`), never while selecting.
- Thresholds, exported from `swipe-math.ts` exactly: `LOCK_PX = 10`, `OPEN_PX = 72`, `COMMIT_FRACTION = 0.5`, `FLICK_PX_PER_MS = 0.5`, `PULL_PX = 64`, `EDGE_START_PX = 20`, `EDGE_BACK_PX = 80`. Vibrate `navigator.vibrate?.(10)` when a swipe crosses the commit line.
- Pull to refresh and edge back: only when `standalone()` (the installed app). Edge back also only `onIos()`. Both are exported from `features/install/install.ts`.
- Only actions that exist already: `useListActions().remove(item)`, `.change(item, { checked })`, `usePantryActions().remove(item)`, `.toList([item.name])`, with their existing messages and Undo.
- Labels the rows show are existing keys: `list.bulk.remove` "Remove", `list.bulk.check` "Check off", `list.bulk.uncheck` "Uncheck", `pantry.usedUp` "Used up", `pantry.bulk.toList` "Add to list". The only new string is `gestures.refreshing` "Refreshing…", in `apps/web/src/locales/en.json`.
- Code style per AGENTS.md: expanded control flow, named handlers, comments in plain English that say why. `pnpm format` from the root before each commit.
- Commit messages: plain English, what and why, ending `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Review Focus

1. **A scroll that starts a little sideways** must stay a scroll: horizontal travel has to pass `LOCK_PX` *and* beat vertical travel before a row moves. (Task 1: `lockAxis` tests.)
2. **The tap that ends a swipe** must not open the row's edit drawer or toggle its checkbox: `<SwipeRow>` swallows the click after any horizontal movement. (Task 2, step 4, checked by hand in Task 3.)
3. **A long press that turns into selecting** mid-gesture must leave the row closed: when `enabled` goes false, `<SwipeRow>` resets to closed and drops the gesture. (Task 2, checked by hand in Task 3.)
4. **An action that fails** (offline, a 500) must leave the row where it was and closed, not stuck open or slid away: the action's promise settles, then the row resets to 0. (Task 2.)
5. **Edge back and row swipes at the left edge:** on the installed iOS app a touch that starts within `EDGE_START_PX` of the left edge belongs to edge back, so `<SwipeRow>` ignores pointer downs there. This reverses the spec's line "not when the touch began on a row that swipes", which would leave back almost unusable on the list and pantry, where rows fill the screen. Task 7 updates the spec. (Task 1: `inEdgeZone` test; Task 2.)

---

### Task 0: Start from current main

- [ ] **Step 1:** `git fetch origin && git rebase origin/main` (main has #78 since this branch started). Expected: clean rebase, since this branch only adds docs.
- [ ] **Step 2:** `pnpm install` in the worktree (there's no `node_modules` here yet). Expected: it finishes without any `minimumReleaseAge` errors.

### Task 1: The maths

**Files:**
- Create: `apps/web/src/features/gestures/swipe-math.ts`
- Create: `apps/web/src/features/gestures/swipe-math.test.ts`
- Modify: `apps/web/package.json` (`test` script: add `src/features/gestures/swipe-math.test.ts`)

**Interfaces:**
- Produces:
  - the constants in Global Constraints
  - `type Axis = "x" | "y"`
  - `lockAxis(dx: number, dy: number): Axis | null`: `null` while `max(|dx|,|dy|) < LOCK_PX`; `"x"` when `|dx| > |dy|`, else `"y"`.
  - `type SwipeSide = "start" | "end"`: `"start"` is a swipe right (the action on the left side), `"end"` a swipe left.
  - `type SwipeEnd = { kind: "close" } | { kind: "open"; side: SwipeSide } | { kind: "commit"; side: SwipeSide }`
  - `swipeEnd(input: { offset: number; width: number; velocity: number; has: { start: boolean; end: boolean } }): SwipeEnd`: `offset` px (positive is right), `velocity` px/ms (positive is right). A side with no action always closes. Commit when `|offset| >= width * COMMIT_FRACTION`, or when a flick (`|velocity| >= FLICK_PX_PER_MS` in the same direction as `offset`) goes past `OPEN_PX`. Open when `|offset| >= OPEN_PX`. Otherwise close.
  - `pastCommit(offset: number, width: number): boolean`: for the buzz.
  - `resist(distance: number): number`: damped pull, `distance <= 0 ? 0 : distance / (1 + distance / 200)` (monotonic, and under `distance`).
  - `pullEnd(distance: number): "refresh" | "cancel"`: `resist(distance) >= PULL_PX`.
  - `inEdgeZone(x: number): boolean`: `x <= EDGE_START_PX`.
  - `edgeEnd(dx: number, dy: number): "back" | "cancel"`: back when `dx >= EDGE_BACK_PX` and `dx > |dy|`.

- [ ] **Step 1: Write the failing tests** in `swipe-math.test.ts`, in the style of `features/plan/drag/optimistic-move.test.ts` (`import { test } from "node:test"`, `assert from "node:assert/strict"`, import `./swipe-math.ts` with its extension):

```ts
test("a small movement isn't a direction yet", () => {
  assert.equal(lockAxis(6, 3), null)
})
test("a scroll that starts a little sideways stays a scroll", () => {
  assert.equal(lockAxis(9, 14), "y")
  assert.equal(lockAxis(12, 12), "y")
})
test("clearly sideways locks to x", () => {
  assert.equal(lockAxis(-14, 5), "x")
})
const has = { start: true, end: true }
test("a short swipe closes", () => {
  assert.deepEqual(swipeEnd({ offset: -40, width: 360, velocity: 0, has }), { kind: "close" })
})
test("past the open line it stays open on that side", () => {
  assert.deepEqual(swipeEnd({ offset: -80, width: 360, velocity: 0, has }), { kind: "open", side: "end" })
})
test("past half the row it commits", () => {
  assert.deepEqual(swipeEnd({ offset: 180, width: 360, velocity: 0, has }), { kind: "commit", side: "start" })
})
test("a flick past the open line commits", () => {
  assert.deepEqual(swipeEnd({ offset: -90, width: 360, velocity: -0.8, has }), { kind: "commit", side: "end" })
})
test("a flick back the other way doesn't commit", () => {
  assert.deepEqual(swipeEnd({ offset: -90, width: 360, velocity: 0.8, has }), { kind: "open", side: "end" })
})
test("a side without an action always closes", () => {
  assert.deepEqual(swipeEnd({ offset: 300, width: 360, velocity: 0, has: { start: false, end: true } }), { kind: "close" })
})
test("the pull resists and refreshes only past the line", () => {
  assert.ok(resist(100) < 100)
  assert.equal(resist(-5), 0)
  assert.equal(pullEnd(60), "cancel")
  assert.equal(pullEnd(120), "refresh")
})
test("the edge zone is the first 20px", () => {
  assert.equal(inEdgeZone(20), true)
  assert.equal(inEdgeZone(21), false)
})
test("going back needs 80px, mostly sideways", () => {
  assert.equal(edgeEnd(79, 0), "cancel")
  assert.equal(edgeEnd(90, 10), "back")
  assert.equal(edgeEnd(90, 120), "cancel")
})
```

- [ ] **Step 2: Run them to see them fail:** `pnpm --filter @merran/web test`. Expected: FAIL, because `swipe-math.ts` doesn't exist.
- [ ] **Step 3: Write `swipe-math.ts`** with the interfaces above. Add a JSDoc comment to each export saying what it decides.
- [ ] **Step 4: Run the tests again:** `pnpm --filter @merran/web test`. Expected: every test passes, including the existing ones.
- [ ] **Step 5: Commit:** "Add the maths for swiping rows, pulling to refresh and swiping back".

### Task 2: `<SwipeRow>`

**Files:**
- Create: `apps/web/src/features/gestures/swipe-row.tsx`
- Create: `apps/web/src/features/gestures/open-row.ts` (which row is open)
- Modify: `apps/web/src/features/install/install.ts` (export `standalone` and `onIos`; no change to what they do)

**Interfaces:**
- Consumes: everything in Task 1's Produces.
- Produces:
  ```ts
  export type SwipeAction = {
    label: string
    icon: IconSvgElement            // from @hugeicons/core-free-icons
    tone: "destructive" | "primary"
    /** Slides the row off before acting: for actions that take it away. */
    leaves: boolean
    onAction: () => Promise<unknown> | void
  }
  export function SwipeRow(props: React.ComponentProps<"li"> & {
    /** Swipe right: shown on the left. */
    start?: SwipeAction | null
    /** Swipe left: shown on the right. */
    end?: SwipeAction | null
    enabled: boolean
    /** Classes for the sliding content, which used to be the row's <li>. */
    contentClassName?: string
  }): JSX.Element
  ```
  `open-row.ts` exports `useOpenRow(id: string): { open: boolean; setOpen(open: boolean): void }`. It's a module-level store read with `useSyncExternalStore`: one id at a time, so opening one row closes the last. It also closes on a `pointerdown` outside any `[data-swipe-row]` element, and on `scroll` (window listeners, added while a row is open).

- [ ] **Step 1: Write `open-row.ts`.**
- [ ] **Step 2: Write `SwipeRow`.** The outer `<li data-swipe-row>` takes `...props` and `ref` (so `ContextMenuTrigger render={row}` can merge onto it), with `relative overflow-hidden touch-pan-y`. Inside it:
  - Two action layers, `absolute inset-y-0` on the left and right, made with `@/components/ui/button` or plain `<button>`. Destructive is `bg-destructive text-white` and primary is `bg-primary text-primary-foreground`. Each has an icon and its label, and is `aria-hidden` with `tabIndex={-1}`: screen readers use the row's menu.
  - The content `<div className={contentClassName}>`, with `translate-x` from state and `transition-transform duration-200` except while dragging.
  - Only render handlers and layers when `enabled && isMobile`. Otherwise render a plain `<li {...props}><div className={contentClassName}>{children}</div></li>`, so desktop markup is the same as now.
- [ ] **Step 3: Write the pointer handlers** as named functions (`begin`, `track`, `finish`, `cancel`):
  - `begin` ignores `pointerType === "mouse"`, and `inEdgeZone(clientX)` when `standalone() && onIos()`. It records the start point and time.
  - `track` locks the axis with `lockAxis`. On `"y"` it lets go (no capture, so the page scrolls). On `"x"` it calls `setPointerCapture` and follows the finger. Past a side with no action, it moves a third as far. It buzzes once when `pastCommit` first becomes true, and keeps the last two samples for the velocity.
  - `finish` applies `swipeEnd`:
    - **close** sets the offset to 0.
    - **open** sets the offset to `±OPEN_PX`, wide enough for the button, and calls `setOpen(true)`.
    - **commit** with `leaves` slides to `±width`, awaits `onAction()` in `try/finally`, then resets to 0 closed. A commit without `leaves` resets to 0 at once and then calls `onAction()`.
- [ ] **Step 4: Swallow the click after a drag.** `onClickCapture`: if this gesture moved on x, `preventDefault` and `stopPropagation`. This stops the tap that ends a swipe from opening the edit drawer or toggling the checkbox. A tap on the revealed button calls the action the same way commit does.
- [ ] **Step 5: Reset when `enabled` turns false** (a long press started selecting): a `useEffect` on `enabled` sets the offset to 0, closes the row and drops the gesture.
- [ ] **Step 6:** `pnpm typecheck`. Expected: no errors.
- [ ] **Step 7: Commit:** "Add a row that swipes to show or do its actions".

### Task 3: Swiping things on the list

**Files:**
- Modify: `apps/web/src/features/list/item-row.tsx` (`const row = (<li …>` ~line 180)

**Interfaces:**
- Consumes: `SwipeRow`, `SwipeAction` (Task 2).

- [ ] **Step 1:** Make `row` a `<SwipeRow>`:
  - **Classes:** the `<li>`'s current classes become `contentClassName`.
  - **`enabled`:** `!selecting`.
  - **`end`:** `{ label: t("list.bulk.remove"), icon: Delete02Icon, tone: "destructive", leaves: true, onAction: () => actions.remove(item) }`.
  - **`start`:** `{ label: item.checked ? t("list.bulk.uncheck") : t("list.bulk.check"), icon: item.checked ? RotateLeft01Icon : Tick02Icon, tone: "primary", leaves: false, onAction: () => actions.change(item, { checked: !item.checked }) }`.
  - **Comment:** update the component's comment to say a swipe does these on a phone.
- [ ] **Step 2:** `pnpm typecheck`. Expected: no errors.
- [ ] **Step 3: Check by hand** in the dev server (DevTools, iPhone size, touch on), in "The Johnsons" on 127.0.0.1:5173:
  - Swipe left past half: the row goes and the "removed" message offers Undo, which brings it back.
  - A short swipe left shows Remove; tap it.
  - A swipe right checks it off, and again unchecks it.
  - A tap after a swipe doesn't open the edit drawer.
  - Scrolling the list with a slightly diagonal finger doesn't move rows.
  - A long press still starts selecting, and rows don't swipe while selecting.
  - At 1024px rows don't swipe and right click still works.
  - Offline (DevTools network), a commit leaves the row in place.
- [ ] **Step 4: Commit:** "Swipe a thing on the list to remove it or check it off".

### Task 4: Swiping pantry items

**Files:**
- Modify: `apps/web/src/features/pantry/pantry-page.tsx` (`PantryRow`, `const row = (<li …>` ~line 510)

- [ ] **Step 1:** Make `row` a `<SwipeRow>`:
  - **Classes:** the grid classes go to `contentClassName`.
  - **`enabled`:** `!selecting`.
  - **`end`:** `{ label: t("pantry.usedUp"), icon: CheckmarkCircle02Icon, tone: "destructive", leaves: true, onAction: () => actions.remove(item) }`.
  - **`start`:** `{ label: t("pantry.bulk.toList"), icon: ShoppingBasketAdd01Icon, tone: "primary", leaves: false, onAction: () => actions.toList([item.name]) }`.
  - **Comment:** update the comment above `PantryRow`.
- [ ] **Step 2:** `pnpm typecheck`. Expected: no errors.
- [ ] **Step 3: Check by hand**, as in Task 3:
  - Used up gives the message with Undo, plus **Put on the list** when a meal counted on it.
  - Add to list gives "Added … to the list."
  - The row's Used up button, "⋯" menu and long press still work.
- [ ] **Step 4: Commit:** "Swipe a pantry item to mark it used up or put it on the list".

### Task 5: Pull to refresh

**Files:**
- Create: `apps/web/src/features/gestures/pull-to-refresh.tsx`
- Modify: `apps/web/src/components/layout/app-shell.tsx` (mount `<PullToRefresh />` beside `<InstallGuide />`)
- Modify: `apps/web/src/locales/en.json` (new top-level `"gestures": { "refreshing": "Refreshing…" }`)

**Interfaces:**
- Consumes: `resist`, `pullEnd`, `PULL_PX` (Task 1); `standalone` (Task 2).
- Produces: `export function PullToRefresh(): JSX.Element | null`.

- [ ] **Step 1: Write `PullToRefresh`.** It renders nothing unless `standalone()`.
  - **Overscroll:** while mounted, set `document.documentElement.style.overscrollBehaviorY = "contain"`, and put it back on unmount.
  - **Listeners:** window listeners, with `touchmove` `{ passive: false }`.
  - **Starting:** a pull starts on `touchstart` only when `window.scrollY === 0` and `!document.querySelector('[role="dialog"], [role="menu"]')`.
  - **While pulling down:** `preventDefault` and show a round spinner (`HugeiconsIcon` `Loading03Icon`, as elsewhere in the app), fixed at the top centre below the safe area, at `translateY(resist(dy))`, rotating with the pull.
  - **Letting go:** on `touchend`, `pullEnd(dy) === "refresh"` holds it at `PULL_PX`, spinning, and awaits `queryClient.refetchQueries({ type: "active" })`. Otherwise it slides back.
  - **Screen readers:** a `role="status"` sr-only span says `t("gestures.refreshing")` while refreshing.
- [ ] **Step 2:** Mount it in `AppShell`. `pnpm typecheck` and `pnpm format:check`.
- [ ] **Step 3: Check by hand.**
  - Temporarily force `standalone()` to true in DevTools with emulation. Pulling at the top refetches (network tab), and pulling while scrolled down, or in a drawer, does nothing.
  - In a normal tab nothing is mounted.
- [ ] **Step 4: Commit:** "Pull to refresh in the installed app".

### Task 6: Swiping back from the edge

**Files:**
- Create: `apps/web/src/features/gestures/edge-back.tsx`
- Modify: `apps/web/src/components/layout/app-shell.tsx` (mount `<EdgeBack />`)

**Interfaces:**
- Consumes: `inEdgeZone`, `edgeEnd`, `EDGE_BACK_PX` (Task 1); `standalone`, `onIos` (Task 2).
- Produces: `export function EdgeBack(): JSX.Element | null`.

- [ ] **Step 1: Write `EdgeBack`.** It renders nothing unless `standalone() && onIos()`.
  - **Can it go back:** `useCanGoBack()` from `@tanstack/react-router`. If this router version doesn't export it, use `useRouter().history.canGoBack()`.
  - **Starting:** window touch listeners, as in Task 5. It starts only when `inEdgeZone(touch.clientX)`, it can go back, and no `[role="dialog"], [role="menu"]` is open.
  - **While moving:** a chevron (`ArrowLeft01Icon`) in a round chip, fixed at the left edge at the finger's height, follows `min(dx, EDGE_BACK_PX)` and becomes fully opaque at `EDGE_BACK_PX`.
  - **Letting go:** `edgeEnd(dx, dy) === "back"` calls `router.history.back()`.
  - **Cooking:** it's in `_focus`, outside `AppShell`, so it never gets this. Say so in a comment.
- [ ] **Step 2:** Mount it in `AppShell`. `pnpm typecheck` and `pnpm format:check`.
- [ ] **Step 3: Check by hand.** Force `standalone() && onIos()` true temporarily.
  - Recipes → a recipe → edge swipe goes back, and a short one doesn't.
  - On a page with no history nothing shows.
  - A swipe right on a list row starting at x>20 still swipes the row.
- [ ] **Step 4: Commit:** "Swipe back from the left edge in the installed app on iPhone".

### Task 7: Say what it does

**Files:**
- Modify: `docs/platform.md`: a new `## Mobile gestures` section after `## Context menus`, dated November 8, 2026, with the rules from the spec in the same short-bullet style as Context menus.
- Modify: `docs/mobile-gestures.md`:
  - Change "Planned November 8, 2026" to "Planned and built November 8, 2026".
  - Replace the edge-back bullet "or when the touch began on a row that swipes" with: rows don't swipe from within 20px of the left edge in the installed app on iOS, so edge back always works there (decided while planning, November 8, 2026).
- Modify: `docs/features.md`: the "Swipe rows…" row goes from Planned to Built.
- Modify: `docs/README.md`: in the `mobile-gestures.md` row, "(planned November 8, 2026)" becomes "(built November 8, 2026)".
- Modify: `apps/docs/src/content/docs/docs/use/shopping-and-pantry.md`. Add a short "On a phone" paragraph near the start of the list section and of the pantry section:
  - On the list: swipe left to **Remove** and right to **Check off** (or **Uncheck**); a short swipe shows the button.
  - In the pantry: swipe left for **Used up** and right to **Add to list**.
  - Undo works as it does from the menu.
  - Pull to refresh and edge back go in one sentence where the guides talk about the installed app. Find it with `grep -rn "home screen\|install" apps/docs/src/content/docs/docs`.
- Delete: `docs/superpowers/plans/2026-11-08-mobile-gestures.md` (plans aren't kept on main).

- [ ] **Step 1:** Make the edits above.
- [ ] **Step 2:** `pnpm docs:build`. Expected: it passes, with every link checked.
- [ ] **Step 3: Final checks:** `pnpm typecheck`, `pnpm format:check`, `pnpm --filter @merran/web test`. Expected: all pass.
- [ ] **Step 4: Commit:** "Document swiping rows, pull to refresh and swiping back".
