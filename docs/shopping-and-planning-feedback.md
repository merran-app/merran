# Shopping and planning feedback

Recorded October 18, 2026 from using Merran with Fry's and automatic meal planning. This record tracks the resulting improvements and the work still planned; none is a commitment to a release. Completion celebrations below are built but not released yet. Track status in [features.md](features.md) and the public roadmap.

## Complete list items after sending to a store

Implemented October 18, 2026, not released yet: List shows sent, ready and attention counts per store. After checkout, the shopper can mark unchanged, verified sent items bought, with Undo. Review and product finding stay over the list, using phone drawers and one desktop dialog.

- Decision: sending alone never checks items off. The explicit mark-bought action follows checkout; no automatic-completion preference is implemented.
- Only successfully sent items should be eligible. Keep failed, unavailable, unsent and other-store items open, including after a partial send.
- Sending to a cart is not proof of purchase. Completing list items must not silently mark an order paid or put groceries in the pantry.
- Keep a way to reverse completion if the shopper changes their mind or the order changes.

## Ingredient purpose and substitutions while shopping

Ingredient context is implemented October 18, 2026, not released yet: each shopping row has an info icon opened by tap or hover. It shows current recipe lines, amounts scaled to planned servings and recorded contributions after pantry deductions, including main dishes and sides. Manual additions can have no recipe sources. Contextual substitutions remain planned.

- Show the contributing recipes/meals and quantities, including when several meals share one combined item. Distinguish manual additions and recurring buys where there is no recipe source.
- The compact info popup fits the phone viewport without adding another line to each shopping row. Recipe changes and manual amount edits can differ from the recorded meal contributions.
- Offer a contextual substitution action with the food, relevant recipes and household dietary constraints already supplied. Explain when AI configuration is needed.
- Let the shopper review a proposed substitution and its scope before applying it. Work out how an accepted swap updates the list, planned meal and any saved recipe; do not silently rewrite the library recipe.

## Rearrange meals after automatic planning

Decided and implemented October 18, 2026, not released yet: a move handle on each weekly meal supports mouse, pen and touch dragging between days, meal types and the any-day pool. It also opens the destination picker by tap or keyboard. Keep **Move or change** and bulk **Move** available. Direct two-meal swaps remain planned.

- Highlight valid destinations without shifting the layout. Scroll near the viewport edges to reach other days. Release outside a destination or press Escape to cancel. A drop back on the current slot does nothing; selection mode disables dragging.
- Keep day headings, theme badges and calorie totals wrapping within the phone viewport. Meal tracks can shrink and long names truncate; drag hints stay within their targets so moving meals does not introduce horizontal page scrolling.
- An empty slot accepts the move immediately. An occupied dated slot offers **Move alongside**, with the existing dishes named; cancel leaves everything where it was. Keep the pool's meal type when a dish returns to it.
- Preserve entry identity, recipes, paired recipes, servings, notes and cooked/skipped status. Manual moves can miss theme nights, as **Move or change** already permits; they do not generate replacement recipes or reset cooking history.
- Update cached week ranges optimistically for moves and their Undo, including the destination picker. A failed save rolls back only the affected locations, preserving unrelated changes and showing an error. Cancel in-flight range reads before moving so they cannot restore stale positions. Refresh from the server after success.
- Reuse the transactional bulk move and its snapshot-based Undo. A date/meal-only change leaves shopping provenance, quantities, pantry reservations and checked purchases alone; it never generates another list.

## See recipes already planned for the week

Decided and implemented October 18, 2026, not released yet. Show **Already planned** in the recipe picker when a recipe is already on the destination week, and **Planned this week** on recipe-library cards for the household's current week.

- Use the household's time zone and first day of the week. Adding to a future or past week checks that week; picking a side uses the meal's selected destination week.
- Count main dishes and sides, dated meals and the any-day pool. Cooked entries still count toward variety for the week; skipped entries do not.
- Keep recipes selectable so intentional repeats are possible. Refresh badges through the existing plan queries after additions, moves, removals, status changes and Undo.
- Keep the existing API and badge colors.

## Completion celebrations

Decided October 18, 2026; built, not released yet. Reward finishing a shopping list or cooking with a randomly chosen shower of confetti, stars or petals. Pieces enter above the viewport at staggered times, fall through the full screen, and flutter and tumble independently; the shower clears within five seconds.

- Celebrate after a successful action checks the last outstanding item on a list, empties a list through clearing or putting purchases away, or marks a recipe made or a planned meal cooked. Bulk actions can celebrate once too.
- Do not celebrate merely opening an empty list, receiving a live update, undoing an action, or a failed request. Removing only some items is not finishing a list.
- Keep the effect silent, decorative, brief and unable to intercept taps or keyboard focus. Skip animations when the device requests reduced motion, and stop an active effect if that preference changes. Existing success messages, Undo and cooking notes remain available.
- Use the current palette's chart colors and browser animations, with no new dependency. Ignore overlapping celebration requests so several quick completions cannot fill the screen with effects.

## Before implementation of the planned improvements

For the remaining substitutions and direct meal swaps, confirm the interaction choices above and split implementation into independently reviewable changes. The original feedback record introduced no runtime changes; the shopping completion, ingredient-context, meal-moving, weekly-badge and celebration decisions above describe the subsequent implementation.
