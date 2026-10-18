# Shopping and planning feedback

Recorded October 18, 2026 from using Merran with Fry's and automatic meal planning. This record tracks the resulting improvements and the work still planned; none is a commitment to a release. Track their status in [features.md](features.md) and the public roadmap.

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

After Fill the week or scheduled automatic planning, make it quick to move meals between days or swap two existing meals, keeping the chosen recipes rather than generating new suggestions.

- Explore dragging meals between days, with an equally usable menu/button alternative for touch and keyboard users.
- Moving into an occupied slot needs an explicit swap or another clear choice; do not overwrite or lose a meal.
- Preserve servings, paired recipes and notes. Decide how to handle cooked/skipped meals and theme-night mismatches.
- Review the effect on an already-generated shopping list so moving meals does not duplicate ingredients or silently discard checked items.

## Before implementation

For the remaining substitutions and meal-rearranging work, confirm the interaction choices above, inspect ingredient provenance and Move or change behavior, and split implementation into independently reviewable changes. The original feedback record introduced no runtime changes; the shopping completion and ingredient-context decisions above describe the subsequent implementation.
