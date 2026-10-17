---
title: Walmart (experimental)
description: Use the optional browser-extension workflow to find Walmart products and fill your own cart.
sidebar:
  order: 3
---

**Experimental:** Walmart support automates pages in your own browser. It is not an official Walmart cart API integration. Changes to Walmart's site can stop it working. The documentation audit has not completed a live Walmart transaction test.

## Before you start

- A US Walmart account and a supported desktop browser, signed in to Walmart by you.
- The [Merran extension](../browser-extension/) installed in that same browser and connected to the intended household.
- A server admin has enabled **Settings → This server → Walmart → Walmart through the extension** (`MERRAN_WALMART=true`). It is off by default.
- A shopping list ready to review. This workflow does not require an AI key.

## Find and review products

1. Open **List → Send → Review Walmart** in Merran.
2. Follow the setup checklist: install the extension, connect this household, then choose **Allow on walmart.com** and approve the browser's permission prompt.
3. Choose **Find them at Walmart**. The extension opens a Walmart tab and searches for the missing products, one at a time.
4. If Walmart asks you to confirm you are a person, complete that check yourself in its tab. The extension pauses for you; use **Carry on** if needed.
5. Return to Merran and inspect every proposed product and package count. Change mismatches before continuing.

**Expected result:** Merran has product choices for review. Finding products does not itself fill the cart. Your location, selected Walmart store, and pickup/delivery settings can affect what the browser finds.

## Fill the cart

1. Select the products to include and choose **Add … to the Walmart cart**.
2. Keep the browser open while the extension works. **Show the Walmart tab** opens its progress; **Stop** stops after the current item.
3. Review completion and skipped-item reasons, such as out of stock, not found, or not added.
4. Choose **Open your Walmart cart**. Check the actual products, quantities, prices, delivery method, and any duplicates. Complete checkout yourself on Walmart.

**Expected result:** Successfully added products are in your browser's Walmart cart. Partial completion is possible. Inspect the cart before retrying after a failure or interruption. Checking out and receiving groceries are separate from updating Merran's shopping list and pantry.

## Permissions and data

The extension requests access to `walmart.com` separately from your Merran origin. It searches and acts in your signed-in Walmart tab; it does not ask you to paste your Walmart password or payment details into Merran. Search results and selected product information are returned to Merran for matching and later reuse. Shopping searches go to Walmart through your browser. See [extension permissions](../browser-extension/#permissions-and-data).

## Troubleshooting

| Problem                                           | What to do                                                                                                                          |
| ------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| Walmart is unavailable                            | Ask the server admin to check the experimental switch.                                                                              |
| Extension not detected                            | Open Merran in the browser where it is installed, check the exact server address and household, then reload the extension and page. |
| Access required                                   | Complete **Allow on walmart.com**; check the browser's site permissions.                                                            |
| Extension busy                                    | Wait for the current task or stop it before starting another.                                                                       |
| Human check                                       | Finish it yourself in Walmart's tab. Merran does not bypass it.                                                                     |
| Wrong product, unavailable stock, or page changed | Review/change the choice or add the item manually on Walmart. Report a reproducible failure without account details.                |
| Stopped halfway                                   | Review what was already added, then use **Carry on** if appropriate. Avoid resending the whole list blindly.                        |

Disable the server switch to stop offering this integration. You can also revoke Walmart access in the browser's extension settings. Normal shopping lists remain usable. Next: [Shopping and pantry](../../use/shopping-and-pantry/).
