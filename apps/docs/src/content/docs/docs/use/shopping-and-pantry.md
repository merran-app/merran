---
title: Shopping and pantry
description: Turn planned meals into a list, account for food at home, and put purchases away.
---

The shopping list combines what your meals need and accounts for food already at home. Core lists and pantry tracking work without AI or a store connection.

:::note[Alpha documentation]
These steps follow the current repository implementation, pending fresh-install verification against a released image. Optional integrations may differ in your installed alpha.
:::

## Before you start

- Add [recipes](../recipes/) with readable quantities and [plan meals](../planning/) with the servings you intend to make.
- Select the household whose list and pantry you want to change; members share this data.
- Record pantry amounts before creating the list. Unknown amounts are treated as enough to cover a matching ingredient, so use quantities when you need accurate deductions.

## Record what you have

1. Open **Pantry** and enter an item, such as `500 g rice` or `2 cans black beans`, then choose **Add**.
2. Use the item's menu → **Change** to correct **Name**, **How much**, **Kept in**, or **Use by**, then **Save**.
3. Review **Always on hand**. Items here are left off lists made from the plan. Use **Change** to maintain that list and tap a staple when you are running low to add it to shopping.

**Expected result:** the pantry shows the food available to your household. **Use soon** highlights dated or leftover stock; dates assigned during put-away are estimates that you can correct.

When something is gone, choose **Used up**. For partial use outside a planned meal, edit **How much** to the amount left.

:::note[Not released yet: putting food back on the list]
When something you use up was set aside for a meal on the list, the message says which meal and offers **Put on the list** beside **Undo**. Ignore it to leave the list as it is.

Using up several things at once (**Used up** on a selection, **Toss the … past their date** under **Use soon**, or **Clear the pantry**) offers **Choose** when any were for meals on the list. Tick what to buy again, then choose **Put … on the list**, or **Not now**. Nothing is ticked to start.

Lowering **How much** below what's set aside for meals on the list says how much each meal is short and offers **Put on the list** for the shortfall only.

What goes back is that meal's share, so taking the meal off the plan takes it off the list too. **Undo** on the next message takes it back off the list.
:::

## Create a list from the plan

1. Open **List → Add from plan**, or **Plan → Add the week to the list**.
2. Select **This week** or **Next week** and review the meals shown.
3. Choose **Add … meals**. If only recurring items remain, the action can be **Add every-week items**.
4. Review the resulting lines and the message explaining items already at home or always on hand.

**Expected result:** ingredients from eligible planned meals are combined, with their planned serving amounts, plus configured every-week items. Past days are not added. Already listed meals are not added again simply by repeating this action. Later changes to listed meals update their outstanding list contributions.

:::note[Not released yet: covered at home]
Under the list, **Covered at home** names what the list counted on from the pantry for meals still to come, and so left off. Choose **Show** to see each food: how much is at home, which meals it's for, and how much is still on the list when the pantry covers only part. With several lists, each food shows under the list it would go on.

If something isn't really there, choose **Not at home**. It's marked used up, and what those meals counted on goes on the list, with **Undo**. Always-on-hand staples those meals use are named on a line of their own, with **Change**.

After **Add from plan**, the message's **See what's covered** opens this section. Food bought for a meal and put away isn't listed here: it wasn't what kept anything off the list.
:::

Add extra food or household supplies by typing into the list's add field. **Split the list** and **Edit lists** let you maintain lists for different trips or stores; a list name by itself does not connect a retailer account.

## Understand quantities and deductions

Merran combines recognized foods with compatible quantities. For example, two meals needing 200 g and 300 g of the same food can become one 500 g line. If 100 g of compatible stock is available, 400 g remains to buy. Stock already set aside for another upcoming meal is not counted again.

There are limits:

- Food names must resolve to the same food. Use an item's **Change** controls and **Same as** to teach matching names. **Joined from** can keep incorrectly combined names apart for future lists.
- Compatible units can be added or converted; unknown units and missing food weights cannot always be reconciled.
- A pantry item without a numeric amount counts as having enough. “Some rice” will not produce the same deduction as `100 g rice`.
- **Always on hand** means omit from generated lists, not a measured inventory of that staple.

Creating the list sets pantry stock aside for meals; it does not mean the food has been eaten. Marking a planned meal cooked consumes the recorded stock. Reversing that cooked status restores its recorded deductions.

## Shop and put purchases away

1. Check off each item as you buy it. Review amounts if the actual purchase differs from the list.
2. When finished, choose **Put away** for the list, or **Put it all away** for all checked purchases.
3. Open **Pantry** and check the amounts, storage locations, use-by dates, and meal reservations.

**Expected result:** checked food moves into the pantry and purchases are recorded. Household supplies and always-on-hand staples are cleared without creating pantry stock. Unchecked items stay on the list. Merely checking an item does not put it away.

Where a supported cart handoff recorded pack sizes, put-away can use purchased packs instead of the recipe's required amount. Otherwise it uses the list's amount. Correct the pantry if you actually bought a different pack. Purchase history can later produce **Due about now** suggestions; adding those remains your choice.

:::note[Available in alpha.4]
Checking the last outstanding item on a list, or emptying a list with **Clear checked**, **Clear the list**, **Put away**, or **Put it all away**, plays a short shower of confetti, stars, or petals chosen at random. Pieces rain down across the screen, drifting and tumbling as they fall. Effects are silent and respect your device's reduced-motion preference. Partially clearing a list does not celebrate.
:::

## Start a shopping trip

:::note[Available in alpha.4]
Choose **Start shopping** on **List** for a focused aisle view with larger checkboxes. Select your shopping list and optionally a store under **Shopping at**; **All stores** keeps the whole trip in view. No retailer connection is required. The mode requests that the screen stay awake while visible and shows whether that request is active. Your device may decline it.

Check items off as you buy them. **Couldn’t find it** offers **Set aside for this trip**, **Try [store] instead**, or **Find a substitute**. Set-aside items stay needed on the household list and appear in a collapsed section with **Restore**. Try-another-store choices appear under **At another store**. They are not purchases. Trip focus and deferred choices are remembered for this household on this device; the list itself remains shared.

The shopping header scrolls with the list so it does not cover items. Scroll back to the top to change lists or stores, or choose **Finish shopping** to review bought and outstanding items. **Finish trip** returns to the normal list, preserving unresolved needs. **Put purchases away and finish** explicitly puts checked purchases into the pantry. Ending the trip alone does not put anything away. Offline list synchronization is not added by this mode.
:::

### Replace an unavailable ingredient

:::note[Available in alpha.4]
In shopping mode, choose **Couldn’t find it → Find a substitute**. The search starts automatically when household AI is configured. It includes every planned recipe needing this item, including sides. Choose one idea to fill replacements for all recipes, with amounts and cooking changes tailored to each dish. All contributing meals are selected under **Use for these planned meals**; uncheck a meal to keep its original ingredient.

Use **Get substitution ideas** to search again, or type replacement lines for each recipe yourself. Enter amounts for each recipe as written; **Review the replacement** shows each selected meal's scaled amounts. **Adjust cooking instructions** lets you review or edit rewritten steps. Ingredient names in unchanged steps are updated where recognized; inspect preparation and cooking-time differences yourself. **Apply replacement** saves all selected recipes together, with one **Undo**.

Choose **Apply replacement** after reviewing the quantities and instructions. Merran saves the variant for those planned meals and recalculates the changed shopping foods with pantry deductions. Other meals, checked purchases and numeric manual additions remain separate. Ambiguous hand-written amounts require review before applying. **Undo** is available after saving, provided the meal or optional library recipe has not changed since.

The library recipe stays unchanged. When replacing a single recipe ingredient, you can select **Save this replacement to the library recipe too**; that explicit option keeps a version for reversal. Planned variants survive library edits; open the meal from **Plan** to see or cook its adjusted ingredients and steps. The library recipe's nutrition and cost estimates do not describe the modified meal.

Items with no planned recipe can be replaced manually using one line that includes the amount. This changes that shopping item only, leaving recurring-buy definitions unchanged. No editable planned meal can mean the recipe changed, was deleted or its meal is no longer planned; review the item rather than assuming the recipe was updated.
:::

## Optional store connections

:::note[ingredient details]
Tap or hover the info icon beside any list item to compare **On the list** with its current recipe ingredient lines. **For this meal** shows a line scaled to the planned servings when those differ from the recipe's servings. Main dishes and sides are named separately, and repeated planned meals appear separately.

**Recorded for this meal after pantry** shows the contribution left to buy when the list was calculated. The recipe lines are before pantry deductions; recipe changes and manual list edits can make them differ from the amount on the list. Items added by hand or from recurring buys may have no linked recipe lines. Unavailable recipe details are identified rather than guessed.

Not released yet: **At home, counted on for this meal** shows how much pantry stock the list counted on for that meal, so it isn't in the amount to buy.
:::

:::note[shopping progress on List]
**Shopping progress** appears directly on **List**. Each item shows its selected product, whether it needs a product or is ready to send, and which store received it. Store cards show sent, ready, and attention counts. **Review Fry's** (or your store's name) opens product and pack review over the list; **Back to the list** closes it without losing your place. Already sent items are left out of the next send by default.

Each row has a compact store/status menu, such as **Fry's · Choose product**, **Fry's · Ready**, or **Fry's · Sent**. Open it for product and sent-pack details, review, or to route an unsent item elsewhere, including **Shop for this item yourself**. With several connected stores, **Store for items without a product** chooses where unmatched items go. These choices are remembered in this browser tab.

On phones, review opens in a bottom drawer like the assistant, with a scrollable body and fixed close/back controls. On larger screens it opens in a dialog. Both keep your place on the list.

The product finder also uses a phone drawer: its title, close button, and search field stay above the scrolling results. Choosing a product returns to the review drawer; closing the finder leaves the review open. On larger screens, the finder replaces the review contents in the same dialog. Choose a product or use **Back to review** to return with your pack quantities, included items, and review position preserved. Product finding opened outside review still uses its own desktop dialog.

Use **All items**, **Needs attention**, or **Sent to a cart** to see what remains. If an amount or selected product changes after sending, review the retailer cart before sending again; older sends without recorded details also need review. Merran records successful transfers, not live retailer-cart contents. It cannot detect items removed at the retailer or whether checkout completed.

After checkout, **Mark … sent items bought** checks the unchanged, verified sent items, with **Undo** available. Check individual items instead if only some were bought. Items needing review stay unchecked. Checking items does not put them in the pantry: after receiving them, correct substitutions and quantities, then choose **Put away**. Sending to a cart alone never marks an item bought.
:::

The stores module is optional. **Find** can open searches at selected stores without a direct cart integration. Prices, product choices, and **Send** depend on the configured integration; support is not universal.

For Kroger-family cart handoff:

1. Ask the server admin to configure the stores module and Kroger application credentials.
2. In **Settings → Household → Stores**, find a store by ZIP code and choose pickup or delivery.
3. Link the retailer account. The household sends to that linked account's cart.
4. In **List**, use **Find** or **Send**, review product choices and quantities, and confirm the handoff.
5. Review the retailer cart and complete checkout on the retailer's site. Sending a list does not purchase the order.

**Walmart cart filling is experimental and off by default.** It requires the server admin to enable it and the Merran browser extension to operate a Walmart tab. It may stop for a retailer verification check. Other stores may offer search links only; do not assume they support cart filling or live prices.

:::note[Not released yet: usual products]
**List → More → Usual products** and **Settings → Household → Your stores → Manage usual products** open a page for preparing product choices before shopping. Search foods from your recipes, lists, pantry and purchases, or search Merran's known foods. For each connected store, choose, change or forget the product you buy. A Fry's choice and a Walmart choice for the same food stay separate. Walmart product search requires the extension and a usable Walmart tab. Stores that only offer search links do not save a product.

Foods are grouped into collapsible aisle sections. Each heading shows how many foods need a product at the selected store. Search opens matching sections, and **Needs a product** narrows the list.

When shopping with multiple connected stores, **Order from** on List or Send chooses one store for unsent items; **Across stores** uses the existing split. Merran uses the product saved at the selected store and shows how many items still need a product or have an unavailable one there. You can still route or leave out individual items. Items already sent stay with their original store. Review the cart at the retailer before checkout; selecting a store does not buy or put away anything.
:::

### Optional receipt import

With AI receipt reading available, choose **Pantry → Scan a receipt**, then take a photo, choose files, or paste receipt text. Choose **Read it**, review names and amounts, select the food to keep, and choose **Add … to the pantry**. Review the items that will come off the list before confirming. Receipt reading can make mistakes and may incur provider charges; it is an alternative to manual put-away, so avoid recording the same purchase twice.

## Troubleshooting

| What you see                                   | What to try                                                                                                                                      |
| ---------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| An ingredient is missing from the list         | Check **Always on hand**, pantry entries without amounts, meal dates/status, and whether the meal is already listed.                             |
| Too much is listed or lines do not combine     | Check recipe and pantry units, food names, meal servings, and stock reserved for other meals. Correct mistaken aliases under **Your own foods**. |
| Checked food is not in the pantry              | Finish with **Put away**. Household supplies and always-on-hand items intentionally do not create stock.                                         |
| Pantry amount differs from the actual purchase | Edit **How much**, especially after substitutions or different pack sizes.                                                                       |
| **Send** or prices are unavailable             | Check module availability, store selection, account linking, and whether that retailer has an integration. The manual list still works.          |
| Receipt controls are missing                   | Check the household's AI setup and module availability with the administrator.                                                                   |

## Next steps

Set up [Kroger products and carts](../../integrations/kroger/), [experimental Walmart](../../integrations/walmart/), or the [extension's shopping sidebar](../../integrations/browser-extension/#shop-beside-a-store-page) when you want a store connection.

[Cook the planned meals](../cooking/), then update stock or [plan the next week](../planning/) around what remains.
