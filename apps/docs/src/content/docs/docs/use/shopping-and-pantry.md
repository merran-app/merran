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

## Create a list from the plan

1. Open **List → Add from plan**, or **Plan → Add the week to the list**.
2. Select **This week** or **Next week** and review the meals shown.
3. Choose **Add … meals**. If only recurring items remain, the action can be **Add every-week items**.
4. Review the resulting lines and the message explaining items already at home or always on hand.

**Expected result:** ingredients from eligible planned meals are combined, with their planned serving amounts, plus configured every-week items. Past days are not added. Already listed meals are not added again simply by repeating this action. Later changes to listed meals update their outstanding list contributions.

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

## Optional store connections

The stores module is optional. **Find** can open searches at selected stores without a direct cart integration. Prices, product choices, and **Send** depend on the configured integration; support is not universal.

For Kroger-family cart handoff:

1. Ask the server admin to configure the stores module and Kroger application credentials.
2. In **Settings → Household → Stores**, find a store by ZIP code and choose pickup or delivery.
3. Link the retailer account. The household sends to that linked account's cart.
4. In **List**, use **Find** or **Send**, review product choices and quantities, and confirm the handoff.
5. Review the retailer cart and complete checkout on the retailer's site. Sending a list does not purchase the order.

**Walmart cart filling is experimental and off by default.** It requires the server admin to enable it and the Merran browser extension to operate a Walmart tab. It may stop for a retailer verification check. Other stores may offer search links only; do not assume they support cart filling or live prices.

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
