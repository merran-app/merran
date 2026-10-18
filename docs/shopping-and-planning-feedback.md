# Shopping and planning feedback

Recorded October 18, 2026 from using Merran with Fry's and automatic meal planning. These are planned improvements, not implemented behavior or commitments to a release. Track their status in [features.md](features.md) and the public roadmap.

## Complete list items after sending to a store

After sending items to Fry's or another supported store, offer to mark the successfully sent items complete on their Merran lists. Avoid making people check off the same items individually after sending a cart.

- A confirmation prompt or an optional automatic-completion preference are possible designs; the choice is still open.
- Only successfully sent items should be eligible. Keep failed, unavailable, unsent and other-store items open, including after a partial send.
- Sending to a cart is not proof of purchase. Completing list items must not silently mark an order paid or put groceries in the pantry.
- Keep a way to reverse completion if the shopper changes their mind or the order changes.

## Ingredient purpose and substitutions while shopping

Make it easy to see which planned meals need an item while standing in the store, then ask what could replace it without reconstructing that context in chat.

- Show the contributing recipes/meals and quantities, including when several meals share one combined item. Distinguish manual additions and recurring buys where there is no recipe source.
- Existing list purpose text is a starting point; review its visibility and usefulness on a phone before deciding what additional UI is needed.
- Offer a contextual substitution action with the food, relevant recipes and household dietary constraints already supplied. Explain when AI configuration is needed.
- Let the shopper review a proposed substitution and its scope before applying it. Work out how an accepted swap updates the list, planned meal and any saved recipe; do not silently rewrite the library recipe.

## Rearrange meals after automatic planning

After Fill the week or scheduled automatic planning, make it quick to move meals between days or swap two existing meals, keeping the chosen recipes rather than generating new suggestions.

- Explore dragging meals between days, with an equally usable menu/button alternative for touch and keyboard users.
- Moving into an occupied slot needs an explicit swap or another clear choice; do not overwrite or lose a meal.
- Preserve servings, paired recipes and notes. Decide how to handle cooked/skipped meals and theme-night mismatches.
- Review the effect on an already-generated shopping list so moving meals does not duplicate ingredients or silently discard checked items.

## Before implementation

Confirm the interaction choices above, inspect existing send results, ingredient provenance and Move or change behavior, and split the work into independently reviewable changes. No API, UI, settings or runtime changes are part of recording this feedback.
