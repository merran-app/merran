---
title: Browser extension
description: Install the released extension, connect a household, import recipes, and shop beside a store page.
sidebar:
  order: 1
---

The extension adds recipes from pages you can open in your browser and keeps your shopping list beside a store's website. It is optional; normal recipe imports and shopping lists work without it.

## Before you start

- A working Merran account and a household you belong to.
- Desktop Chrome, Edge, or Firefox. The Firefox build declares Firefox 128 or later. These instructions describe release **0.1.0-alpha.1**.
- Your own server's address, such as `https://food.example.com`, reachable from this browser. `merran.app` is the documentation site, not your server.

The release supplies archives for manual installation. They are not browser-store installations and do not promise automatic updates. Browser installation and retailer workflows still need end-to-end testing on each supported browser.

## Download and install

Open the [0.1.0-alpha.1 release](https://github.com/merran-app/merran/releases/tag/v0.1.0-alpha.1) and expand **Assets**. For later versions, use the [releases list](https://github.com/merran-app/merran/releases) and read the release notes. GitHub's `/releases/latest` shortcut may omit alpha pre-releases.

| Browser        | Release archive                             |
| -------------- | ------------------------------------------- |
| Chrome or Edge | `merranextension-0.1.0-alpha.1-chrome.zip`  |
| Firefox        | `merranextension-0.1.0-alpha.1-firefox.zip` |

The `sources.zip` archive is source code, not the installable extension. Extract the browser archive to a folder you will keep.

### Chrome

1. Enter `chrome://extensions` in the address bar.
2. Turn on **Developer mode**.
3. Choose **Load unpacked** and select the extracted folder containing `manifest.json`.
4. Open the browser's extensions menu and pin Merran if you want its button on the toolbar.

### Edge

1. Enter `edge://extensions` in the address bar.
2. Turn on **Developer mode**.
3. Choose **Load unpacked** and select the extracted Chrome archive's folder containing `manifest.json`.
4. Open the extensions menu and show Merran on the toolbar.

### Firefox

1. Extract the Firefox archive.
2. Enter `about:debugging`, then choose **This Firefox**.
3. Choose **Load Temporary Add-on** and select `manifest.json` inside the extracted folder.

**Expected result:** Merran appears in the browser's extension list and its toolbar popup opens. Firefox's temporary installation ends when Firefox restarts; load it again afterward. This archive is not a signed, permanently installable Firefox add-on. See the official [Firefox temporary installation instructions](https://extensionworkshop.com/documentation/develop/temporary-installation-in-firefox/), [Chrome instructions](https://developer.chrome.com/docs/extensions/get-started/tutorial/hello-world#load-unpacked), and [Edge instructions](https://learn.microsoft.com/en-us/microsoft-edge/extensions/getting-started/extension-sideloading).

## Connect your household

1. Click Merran in the browser toolbar. Enter **Your Merran's address**, including the scheme and port when needed, then choose **Connect**.
2. Allow the browser's request to reach that server. Merran opens its connection page; sign in if needed.
3. Choose the intended household when asked. Review the requested access, then choose **Connect**.
4. Wait for **Connected. You can close this tab.** Open the toolbar popup again and check the selected household.

The extension receives a household-scoped API key automatically. It can read household information, read and write recipes/imports and the shopping list, and read the plan. It cannot change server settings or accounts. To connect another household on that server, choose **Add a household** in the popup and repeat the approval. Switch households in the popup before importing or shopping.

`localhost`, `127.0.0.1`, a LAN address, and a public hostname are different origins. Connect using the exact address you use to open Merran. The extension uses the origin, so hosting Merran under a path such as `/merran` is not a supported connection setup.

## Import a recipe

1. Open the recipe's actual page, rather than a search-results page. Sign in to the recipe site yourself if required.
2. Open the Merran popup. Check the household and page title.
3. Choose **Add this recipe**. You can close the popup while the background action continues.
4. Use **Open it in Merran**, then review ingredients, quantities, servings, steps, and attribution.

Structured recipe data can import without AI. If the page has no usable recipe data, the fallback needs [configured AI](../../run/ai-setup/). Video links need the [video module](../optional-modules/#video-imports) as well. Being able to view a page does not guarantee it contains an extractable recipe.

You can also right-click a page or link to import it, or select shopping text such as `2 lemons` and use Merran's context-menu action. Importing the open page supplies its readable content; importing a link can still require the server to retrieve the destination.

## Shop beside a store page

1. Open the toolbar popup and choose **Shopping list**.
2. Choose the household and list. Select a retailer under **Find at** when stores are available.
3. Use an item's **Find** button to search at that store in the browser tab.
4. Check items off as you add them to the retailer's cart. Use **Add to the list** for missing items.

Chrome and Edge use a side panel; Firefox uses its sidebar. Changes affect the real Merran list. **Find** is a search shortcut, not an automatic cart transfer. [Kroger](../kroger/) uses a separate API connection; [experimental Walmart](../walmart/) uses the extension's additional workflow. Checkout always happens at the retailer.

## Permissions and data

The extension requests active-tab access and scripting to read the page you ask it to import, local storage for connections and keys, context menus, and Chromium's side-panel permission. It requests access to your Merran origin when connecting, rather than permanently reading every website. Walmart access is requested separately when you enable that workflow.

An import sends the page URL, title, structured recipe data, candidate image URLs, and extracted readable text to your server. That text can include content visible in a signed-in page. When AI fallback is used, relevant content is sent to the configured provider. See [AI privacy](../../project/ai-privacy/). The bridge on your Merran pages does not expose the stored key to those pages.

## Update, revoke, and troubleshoot

For an update, extract the new matching archive into your retained extension folder, reload the extension from the browser's extension manager, then reload Merran's tabs. Check the connection afterward. In Firefox, load the new manifest as a temporary add-on. Removing and reinstalling can require reconnecting.

To revoke access, open **Settings → You → API keys** in Merran and remove the extension's key. Removing the browser extension alone does not revoke a server-side key. Remove any abandoned keys after a failed connection.

| Problem                                     | What to check                                                                                                                                                             |
| ------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| The browser cannot find a manifest          | Extract the browser ZIP; select the folder containing `manifest.json`, not the ZIP or source archive.                                                                     |
| Merran says it is looking for the extension | Use the same browser, enable the extension and its site permission, reload both it and the Merran tab, and check the exact origin.                                        |
| Connected to another household              | Select it in the popup or use **Add a household**.                                                                                                                        |
| Cannot read a page                          | Open an ordinary HTTP(S) recipe page. Browser settings pages and some protected pages cannot be read.                                                                     |
| Import needs AI or fails                    | Check the popup error, [AI setup](../../run/ai-setup/), and [import troubleshooting](../../run/troubleshooting/). Try the open-page action if server fetching is blocked. |
| Key rejected                                | Check expiry/revocation and household membership; reconnect and revoke the old key.                                                                                       |
| Firefox extension disappears                | Temporary add-ons are removed on restart; load the manifest again.                                                                                                        |

Next: [Recipes](../../use/recipes/), [Shopping and pantry](../../use/shopping-and-pantry/), or [phone sharing](../phone-sharing/).
