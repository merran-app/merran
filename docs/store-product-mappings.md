# Store product mappings

Implemented October 19, 2026; released in alpha.6. The page and shopping-day choice below are built for Kroger and experimental Walmart. Link-only stores still provide search links without saved products.

## Why

Today a household picks a product from a shopping-list item or store review. Merran keeps one product for that food at each connected store, so the next list can reuse it. There is no place to see or prepare those choices without first putting the food on a list. A food can already have products at more than one store, but Send starts with the most recently picked store. Preparing both products should let someone choose where to order on shopping day.

## The page

Add **Usual products**, a household page reached from **List** and **Settings → Household → Your stores**. It works without a current shopping list. Show foods the household has used in recipes, lists, pantry, purchases or existing product picks; do not load or search every retailer product on opening. Search also finds a food from Merran's vocabulary, including one the household has not used yet. For an unknown household food, let the person enter its name. Use the same household food identity and aliases as the list, so a product chosen here is the one Send uses later.

Each food row shows its name and one cell per connected store, stacked by store on phones. A cell shows the selected product's name, package size, last known price and availability when known, and whether it was **Your pick** or **Merran's suggestion**. Empty cells say **Choose product**. A store filter, food search and **Needs a product** filter keep the page usable for a large recipe library. Opening a cell searches that retailer and lets the person choose, replace or forget a product. On phones the picker is a drawer; on larger screens it is a dialog. A saved product stays selected until a person changes or forgets it; a later automatic search never replaces it. Saving one store's product does not change another store's product.

Group foods under the household's aisles, in its walking order, using the aisle Merran remembers for that food or its usual guess. Keep sections collapsed when browsing, with food and missing-product counts in each heading. A food search opens its matching sections so results are visible immediately. The store and **Needs a product** filters update those counts.

Kroger uses its existing store search and validates the selected product against the household's current location. Walmart searches through the extension in the person's browser; show its setup or verification state when search cannot run. Only connected retailers can hold product mappings in this first version. A link-only store still offers its existing search link, with no implied saved product or cart integration. Explain this distinction on the page. If a previously selected product is unavailable or no longer returned by a retailer, keep the choice visible with an attention state until the person replaces it; never silently substitute another product.

Forgetting a pick removes that household's selected mapping for that food and store. Merran may offer a new suggestion during a future basket review, clearly marked as a suggestion. Forgetting does not edit recipes, list quantities, other stores' picks, recorded prices or past sent-cart snapshots.

## Shopping day

At the start of **Send** and in List's shopping progress, offer **Order from** when more than one connected store is available. Choosing one store routes the list's unsent items to that store for this trip and uses each food's saved product **at that store**, even when a product was picked more recently elsewhere. Show **Ready**, **Needs a product**, and **Unavailable** counts before review. An item mapped only at another store stays visible as **Choose a product at [store]**; its other store's product is never used for this order. The person can choose a product there, leave an item out, or route individual items to another store. Keep the existing split-across-stores flow available for a mixed order, and show the destination of each item before sending.

The order choice is per trip/list, not a permanent preferred store on every food. Keep it in the current tab as the existing Send choices are, and do not silently change a completed send's store. A changed product or quantity after sending continues to require cart review; selecting a store does not mark anything bought or put it away.

## Implementation

- Add household-scoped read and write endpoints under `/stores/products`, keyed by food and store rather than shopping-item ID. Derive recipe foods through the same parser and household aliases used for the list, instead of treating every raw ingredient line as a separate food. Return selected and suggested products separately, with the source and last known price/availability. Keep `list:read` and `list:write` API-key permissions consistent with the existing store product endpoints. Reuse store-specific validation and price recording from the basket services. Do not rely on a fabricated shopping item to save a mapping.
- Reuse `store_products` and its unique household/store/food constraint. No new table is needed for one product per food per store. A data migration should not be needed unless implementation finds a field that cannot be represented there.
- Share each retailer's product validation and saving between list picks and Usual products. Keep Walmart's extension requirements explicit. Invalidate store and list queries affected by a changed pick.
- Extend Send's choice state with an explicit order store. An explicit store wins over the current newest-pick default for unsent items; item-level overrides still win over the order store. The selected store's own product must be used in its basket. Preserve sent-item routing and snapshots.
- Add labels to `apps/web/src/locales/en.json`, document the workflow in the public shopping guide, regenerate OpenAPI and both clients for the new endpoints, and update this plan and `docs/features.md` as work lands. The public guide must mark the feature as not released until it ships.

## Done when

1. A household can save different products for the same food at Kroger and Walmart without adding it to a shopping list, then see and change both on one page.
2. A choice made on the page appears for a later list item with the same household food key, and a choice made on the list appears on the page.
3. Choosing **Order from Walmart** uses Walmart's saved products for unsent items, regardless of when Kroger products were picked, and flags missing or unavailable Walmart products before review. The reverse works for Kroger.
4. A mixed order and item-level routing still work; sending, buying and put-away remain separate actions.
5. The page and endpoints cannot read or change another household's mappings. Empty, suggested, selected, unavailable and disconnected-extension states have clear UI. Tests cover SQLite and Postgres where store persistence or routing differs.
