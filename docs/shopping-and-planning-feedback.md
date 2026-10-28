# Shopping and planning feedback

Recorded October 18, 2026 from using Merran with Fry's and automatic meal planning. This record tracks the resulting improvements and the work still planned; none is a commitment to a release. Completion celebrations below are built and released in alpha.4. Track status in [features.md](features.md) and the public roadmap.

## Complete list items after sending to a store

Implemented October 18, 2026, released in alpha.4: List shows sent, ready and attention counts per store. After checkout, the shopper can mark unchanged, verified sent items bought, with Undo. Review and product finding stay over the list, using phone drawers and one desktop dialog.

- Decision: sending alone never checks items off. The explicit mark-bought action follows checkout; no automatic-completion preference is implemented.
- Only successfully sent items should be eligible. Keep failed, unavailable, unsent and other-store items open, including after a partial send.
- Sending to a cart is not proof of purchase. Completing list items must not silently mark an order paid or put groceries in the pantry.
- Keep a way to reverse completion if the shopper changes their mind or the order changes.

## Ingredient purpose and substitutions while shopping

Ingredient context and contextual shopping substitutions are implemented October 18, 2026, released in alpha.4. Each shopping row has an info icon opened by tap or hover. It shows recipe lines, amounts scaled to planned servings and recorded contributions after pantry deductions, including main dishes and sides. Manual additions can have no recipe sources.

- Show the contributing recipes/meals and quantities, including when several meals share one combined item. Distinguish manual additions and recurring buys where there is no recipe source.
- The compact info popup fits the phone viewport without adding another line to each shopping row. Recipe changes and manual amount edits can differ from the recorded meal contributions.
- Shopping mode starts searching as soon as **Find a substitute** opens, using every contributing planned recipe, pantry and household dietary rules. One suggestion supplies a common replacement with amounts and instruction changes tailored to each recipe. Manual replacements work without AI; the AI setup explanation stays beside the suggestions (updated October 18, 2026).
- Include all contributing recipes and planned meals by default, with main dishes and sides shown together rather than hidden behind a recipe picker. Preview each recipe's replacements, serving-scaled amounts and instruction changes before applying them together in one transaction with one Undo. Meals can be unchecked to leave their contribution unchanged. Reject incomplete AI suggestions rather than silently omitting a recipe.
- Persist a recipe snapshot on each affected planned meal. Its ingredients and steps survive later library edits and are used by list calculations, the planned recipe view, cooking and pantry consumption. Planned meal links carry the entry id; cooking completion marks that exact entry. Library edits require an explicit checkbox and keep a recipe version. Changed variants have no inherited nutrition or cost estimate.
- Apply and Undo are transactional. Recalculate only changed foods, release/reassign only those pantry reservations, preserve checked purchases and numeric manual remainders, and reject ambiguous hand-written quantities. Revision checks reject stale meal edits or Undo; cross-resource substitution endpoints require a signed-in household member. Suggestions never apply themselves.

## Start shopping mode

Decided and implemented October 18, 2026, released in alpha.4. **Start shopping** opens a focused aisle view for the selected list. Bigger checkboxes, store focus and a compact progress header keep the trip usable on a phone. Reuse cooking's screen wake lock while the view is mounted, reacquiring it when the visible tab returns and releasing it on exit.

- Trip focus, set-aside items and try-another-store choices are remembered on this device, scoped to the household. The underlying list, purchases and saved meal changes remain shared. This does not add offline list synchronization.
- The shopping header scrolls with the list instead of staying pinned over items, keeping the phone viewport available for shopping (decided October 18, 2026).
- **Couldn’t find it** offers **Set aside for this trip**, **Try [store] instead**, and **Find a substitute**. Deferred items leave the active view, stay in collapsible sections and can be restored. Setting aside never marks an item bought, removes its meal contribution or triggers a completion celebration.
- **Finish shopping** reviews bought and outstanding items. **Finish trip** returns to the normal list with unresolved needs intact; **Put purchases away and finish** explicitly runs existing put-away behavior. Nothing is purchased or put away simply by exiting the mode.

## Rearrange meals after automatic planning

Decided and implemented October 18, 2026, released in alpha.4: a move handle on each weekly meal supports mouse, pen and touch dragging between days, meal types and the any-day pool. It also opens the destination picker by tap or keyboard. Keep **Move or change** and bulk **Move** available. Direct two-meal swaps remain planned.

- Highlight valid destinations without shifting the layout. Scroll near the viewport edges to reach other days. Release outside a destination or press Escape to cancel. A drop back on the current slot does nothing; selection mode disables dragging.
- Keep day headings, theme badges and calorie totals wrapping within the phone viewport. Meal tracks can shrink and long names truncate; drag hints stay within their targets so moving meals does not introduce horizontal page scrolling.
- An empty slot accepts the move immediately. An occupied dated slot offers **Move alongside**, with the existing dishes named; cancel leaves everything where it was. Keep the pool's meal type when a dish returns to it.
- Preserve entry identity, recipes, paired recipes, servings, notes and cooked/skipped status. Manual moves can miss theme nights, as **Move or change** already permits; they do not generate replacement recipes or reset cooking history.
- Update cached week ranges optimistically for moves and their Undo, including the destination picker. A failed save rolls back only the affected locations, preserving unrelated changes and showing an error. Cancel in-flight range reads before moving so they cannot restore stale positions. Refresh from the server after success.
- Reuse the transactional bulk move and its snapshot-based Undo. A date/meal-only change leaves shopping provenance, quantities, pantry reservations and checked purchases alone; it never generates another list.

## See recipes already planned for the week

Decided and implemented October 18, 2026, released in alpha.4. Show **Already planned** in the recipe picker when a recipe is already on the destination week, and **Planned this week** on recipe-library cards for the household's current week.

- Use the household's time zone and first day of the week. Adding to a future or past week checks that week; picking a side uses the meal's selected destination week.
- Count main dishes and sides, dated meals and the any-day pool. Cooked entries still count toward variety for the week; skipped entries do not.
- Keep recipes selectable so intentional repeats are possible. Refresh badges through the existing plan queries after additions, moves, removals, status changes and Undo.
- Keep the existing API and badge colors.

## Completion celebrations

Decided October 18, 2026; built, released in alpha.4. Reward finishing a shopping list or cooking with a randomly chosen shower of confetti, stars or petals. Pieces enter above the viewport at staggered times, fall through the full screen, and flutter and tumble independently; the shower clears within five seconds.

- Celebrate after a successful action checks the last outstanding item on a list, empties a list through clearing or putting purchases away, or marks a recipe made or a planned meal cooked. Bulk actions can celebrate once too.
- Do not celebrate merely opening an empty list, receiving a live update, undoing an action, or a failed request. Removing only some items is not finishing a list.
- Keep the effect silent, decorative, brief and unable to intercept taps or keyboard focus. Skip animations when the device requests reduced motion, and stop an active effect if that preference changes. Existing success messages, Undo and cooking notes remain available.
- Use the current palette's chart colors and browser animations, with no new dependency. Ignore overlapping celebration requests so several quick completions cannot fill the screen with effects.

## See what the pantry kept off the list

Planned and built October 28, 2026; not released yet. Before this, putting meals on the list counted on what's at home, but only **Add from plan** said so, in a toast that faded and wasn't kept: "At home already: rice, olive oil." It named only food the pantry covered completely, so a partly covered line just showed the smaller amount. Changing a listed meal (servings, recipe or side), applying a replacement and the weekly autoplan counted on the pantry the same way and said nothing. The Pantry page tagged what was set aside for each meal; the List had no view of it.

- **A Covered at home section on the List.** It sits below the list, collapsed like the **bought** section: a count and the names, with **Show**. Each row gives the food, how much at home is counted on, the meals and days it's for, and, when it's only partly covered, how much is still on the list: "rice · 1 cup at home", then "For Tacos, Tue · 1 cup still on the list". A food shows under the list it would go on: the one its food is on already, or where the list puts that food. Always-on-hand staples those meals use get one line at the end, on the main list, with **Change**, since a setting left them off rather than stock.
- **Worked out from the pantry, not saved separately.** Counting on stock already sets it aside on the pantry item (`forMeals`: the meal and how much). The section reads those set-asides for meals on the list that are still to come. So it covers every way meals reach the list, and stays right when a meal is cooked, moved, skipped or taken off, or the stock is used.
- **Counted-on stock is told apart from bought stock.** Putting shopping away also sets food aside for meals, and after a trip that isn't what kept anything off the list. Each set-aside share records how much of it was counted on when the meal went on the list (`counted`); the rest was bought for it. The plan was two shares for a meal, one for each origin, but that would have needed cooking and its Undo to handle several shares for a meal. With one share holding both, `merged()` adds the counted amounts as it adds the shares, cooking needed no change, and the pantry's Undo snapshot (`PantrySnapshot`) keeps `counted`. `forMeals` is JSON, so there's no migration. Shares from before the change have no `counted`, so the section starts with meals listed after the update.
- **Not at home.** Each row has **Not at home** for when the pantry is wrong. It marks that pantry item used up and puts what was set aside for meals on the list back on the list, with Undo, which puts the list back and then the pantry. It doesn't ask first: you're already looking at the list when you press it.
- **Used up asks about meals on the list (decided October 28, 2026).** Before, using up something set aside for a meal, or lowering its amount, dropped the set-aside and put nothing back on the list, so the meal quietly came up short. Putting it back by itself would suit olive oil, but not carrots used in something else, so it asks. It asks only when the item is set aside for a meal on the list that's still to come, whether counted on or bought for it; using up anything else stays as it is.
  - **One item:** the "Used up carrots." toast says "Was for Tacos, Tue." and adds **Put on the list** beside **Undo**. Ignoring it adds nothing.
  - **Several at once** (select and **Used up**, **Toss the 3 past their date** under **Use soon**, or **Clear the pantry**): the toast says how many were for meals on the list and offers **Choose**, beside **Undo**. That opens a drawer on phones, or a dialog on larger screens, listing each food with its amount and meal. Each has a checkbox, unticked to start, and the buttons are **Put … on the list** and **Not now**. Clearing the pantry never fills the list unless you pick what goes on.
  - **Lowering How much** below what's set aside for meals on the list says how much each is short and offers **Put on the list**, for the shortfall only. What isn't there stops being set aside.
  - **What goes on the list** is that meal's share as a line for that meal, so cooking, changing or taking off the meal handles it like any planned line. Putting it on the list has its own Undo, which takes it back off. Choosing **Put on the list** or **Choose** closes the used-up toast, so its **Undo** goes with it (the plan had undoing the used up take it off the list too).
  - Cooking a meal can use stock set aside for another meal and leave that one short. That's not covered here.
- **The info popup and the toast.** A line's info popup adds **At home, counted on for this meal**, next to **Recorded for this meal after pantry**. The **Add from plan** toast keeps its message and adds **See what's covered**, which opens the section.
- **The API.**
  - `GET /api/list/covered` needs list read only. The plan said list and pantry read, but a route takes one permission, and list lines already carry what the pantry took off them.
  - `POST /api/list/covered/{itemId}/not-at-home` is Not at home.
  - `POST /api/list/for-meals` puts what meals on the list are short of on the list: from things used up (`removed`, as removing them said they were) or things at home that ran low (`items`, by id).
  - Both answer with what the list was (`before`, and the new lines to `remove`) and what the pantry was (`pantry`). `POST /api/list/restore` takes `remove` for that Undo.
  - Pantry items' meals say whether each is on the list (`onList`), how much is set aside (`amount`) and how much of that isn't there (`short`). List item details say `atHome`.
- **Tests.** `apps/server/src/http/routes/list/covered/covered.test.ts` covers:
  - full and partial cover;
  - bought shares left out, and meals not on the list;
  - a listed meal changing;
  - cooking and its Undo;
  - Not at home and its Undo;
  - putting used-up and lowered things on the list, adding to a line already there, and the Undo;
  - what's still to buy added up when a line has more than one share for the meal.

## Before implementation of the planned improvements

Direct meal swaps remain planned. The original feedback record introduced no runtime changes; the shopping completion, shopping mode, substitutions, ingredient-context, meal-moving, weekly-badge, celebration and covered-at-home decisions above describe the subsequent implementation.
