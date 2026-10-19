---
title: Kroger stores and carts
description: Configure a Kroger developer app, link a household account, and review a shopping cart transfer.
sidebar:
  order: 2
---

Kroger integration is optional. It supports product searches, store prices, and adding selected products to a linked account's cart. It does not read the existing cart or complete checkout. These instructions follow the alpha.4 implementation; a real developer-account authorization and cart transfer have not yet been verified by the documentation audit.

## Before you start

You need a server admin to configure a Kroger developer application, a household owner/admin to select the store and link an account, and an eligible Kroger-family customer account. Examples include Kroger, Fry's, Ralphs, King Soopers, and Fred Meyer; available locations and products come from Kroger. No AI key or browser extension is required for this integration.

Choose a stable HTTPS address for Merran and set `MERRAN_PUBLIC_URL` before linking accounts. Everyone in a household sends to the same linked account's cart, so agree which account to use.

## Configure the developer app

:::note[Available in alpha.4]
The Kroger card includes **Create your Kroger app** steps, **Open Kroger developer portal**, and **Kroger setup guide** buttons beside the credentials.
:::

1. Open **Settings → This server → Kroger** in Merran and copy **Redirect address**.
2. Sign in to the [Kroger developer portal](https://developer.kroger.com/) and create an application. Enable access to the Product, Cart, and Profile APIs required by Merran; follow the portal's current requirements for your application.
3. Register the exact redirect URI shown by Merran, including HTTPS and the path. With `MERRAN_PUBLIC_URL=https://food.example.com`, it is `https://food.example.com/api/stores/kroger/callback`.
4. Copy the application's **Client ID** and **Client secret** into the server's Kroger card. Choose **Save app**; Merran tests the credentials before saving. **Test** rechecks saved credentials.

**Expected result:** Merran accepts the app credentials. This tests the application connection, not a household's cart authorization. Environment-managed deployments can instead set `MERRAN_KROGER_CLIENT_ID` and `MERRAN_KROGER_CLIENT_SECRET`; see [configuration](../../run/configuration/).

The implementation requests `product.compact` for application product access and `cart.basic:write profile.compact product.compact` when a household authorizes its account. API availability and portal approval remain Kroger's decision. See [Kroger's API documentation](https://developer.kroger.com/documentation).

## Pick a store and link an account

1. As a household owner/admin, open **Settings → Household → Stores**.
2. Enter a five-digit **ZIP code**, choose **Find**, and select the correct location.
3. Under **Your orders**, choose **Pickup** or **Delivery**. Prices and availability can differ.
4. Choose **Link Kroger**, or the equivalent button named for your selected chain. Sign in and approve on Kroger's site.
5. Return to Merran. Confirm the linked-account status and selected store.

**Expected result:** The household has a store location and an authorized account. Other household members can review and send its list; they do not need separate Kroger connections. Changing the server hostname requires updating the developer redirect URI and may require **Link again**.

## Review products and send the list

1. Prepare the [shopping list](../../use/shopping-and-pantry/) and use its **Send** workflow to review the selected Kroger-family store.
2. Review each product, package size, package count, pickup/delivery availability, and price. A recipe amount is not necessarily one retail package.
3. Use **Change** or **Find one** to search for a better match. A saved pick is reused for that food; verify it still fits next time.
4. Leave out anything you do not want to send. Resolve **Check how many**, **Out of stock**, and missing-product warnings.
5. Choose **Send … to the cart**, then **Open cart** and review the actual retailer cart before checking out.

**Expected result:** Selected quantities are added to the linked account's cart. This does not replace the cart, place an order, or put purchases into Merran's pantry. After receiving groceries, check purchases and use Merran's put-away workflow.

Prices are estimates from returned store data, not a checkout guarantee. If a transfer times out, inspect the retailer cart before sending again: Merran cannot read that cart to prove whether the previous attempt succeeded. Retrying can add duplicates.

## Prices and planning

**Check prices now** refreshes available price information. **Lean on sales** and **Weekly budget** influence meal suggestions; they are preferences, not guaranteed savings or spending caps. Matching depends on recognizable foods and available store data. A basic **Find** link for another retailer does not imply that it has Kroger-style cart support.

## Data, disconnecting, and troubleshooting

Merran sends search terms, location/product identifiers, quantities, and authorization tokens to Kroger as needed. The server stores the household's connection; the developer secret belongs to the server. To disconnect a household, use **Unlink**. Removing the developer app in server settings affects every household using it.

| Problem                          | What to check                                                                                                                                              |
| -------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Test fails                       | Client ID/secret, developer API access, and outbound access from the server to Kroger.                                                                     |
| Redirect rejected                | The URI must match exactly, including scheme, hostname, port, and `/api/stores/kroger/callback`. Set the public URL and restart after environment changes. |
| No nearby locations              | Verify the five-digit ZIP and whether Kroger serves that area.                                                                                             |
| Link expired or password changed | A household admin should choose **Link again**.                                                                                                            |
| Incorrect package or amount      | Change the product and adjust package count; do not assume ingredient-to-package conversion is exact.                                                      |
| No price or no match             | Search manually, omit the item, or buy it separately.                                                                                                      |
| Rate limit or failed transfer    | Wait before retrying; inspect the actual cart first. Use [connection troubleshooting](../../run/troubleshooting/).                                         |

Next: [Shopping and pantry](../../use/shopping-and-pantry/) or [experimental Walmart support](../walmart/).
