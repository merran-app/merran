---
title: Share from a phone
description: Send links, recipe images, PDFs, and receipts to Merran from Android or an iPhone Shortcut.
sidebar:
  order: 4
---

Share content to your own Merran server without copying it into a recipe editor. Structured recipe links can work without AI; reading text, images, PDFs, and receipts needs the appropriate [AI configuration](../../run/ai-setup/). Video links also need [video import](../optional-modules/#video-imports).

## Before you start

Sign in to the intended household and open **Settings → You → Share to Merran**. Your phone must be able to reach the server. Android installation/share-target support needs HTTPS and a compatible browser. A home-network-only address will not work away from home without [remote access](../../run/https-and-remote-access/).

These steps match alpha.4's UI and share endpoint. Real Android and iOS share-sheet behavior remains a device-test gap; browser and OS labels can vary.

## Android

1. Open your server's HTTPS address in Chrome and sign in.
2. Open Chrome's menu and choose **Install app** or **Add to home screen**. Complete installation.
3. In the app containing the recipe, choose **Share**, then **Merran**. Share the recipe page/link, photos, screenshots, or a PDF.
4. Follow Merran's result. A recipe opens for review; multiple links can start a background import. A recognized receipt opens for review before pantry changes.

**Expected result:** The shared content reaches the signed-in household. Review imported recipes and receipt lines before relying on their amounts. Installing a home-screen bookmark alone does not guarantee that the browser registers a share target.

## iPhone and iPad Shortcut

1. In **Settings → You → Share to Merran**, choose **Make a key for the Shortcut**. Confirm you are in the correct household.
2. Open Apple's **Shortcuts**, tap **+**, and name it **Send to Merran**.
3. Open the Shortcut's details and enable **Show in Share Sheet**.
4. Add **Get Contents of URL**. Use the **Address** shown by Merran, ending in `/api/share`.
5. Set **Method** to **POST**. Add an **Authorization** header with the complete value Merran shows: `Bearer …`.
6. Under **Request Body**, choose **Form**. Add a **File** field named `file` and set its value to **Shortcut Input**. Do not send the literal words “Shortcut Input.”
7. Add **Get Dictionary Value** for `message`, followed by **Show Notification**.
8. From Safari or another app, share one recipe to **Send to Merran** and inspect the notification and resulting recipe in Merran.

**Expected result:** The notification explains whether content was added, already present, queued, recognized as a receipt, or could not be imported. A successful HTTP request alone does not guarantee an added recipe; inspect the returned outcome/message.

The Shortcut key has `imports:write`, belongs to you and that household, and is created without an expiry. Keep it private; do not share a Shortcut containing your key. Each person should create their own. Revoke it under **Settings → You → API keys** if the Shortcut or device is lost, or when replacing the connection. A receipt can be read into a draft through this intake permission, but purchase put-away is a separate review step.

## What is sent

The selected link, text, page, or file goes to your server. Merran may fetch the source site and send relevant content to an AI provider for extraction. Shared images/PDFs may first be examined as receipts, then as recipes. This is not an on-device-only reader. The share endpoint accepts at most 25 MB per request; individual import formats can have smaller limits. See [AI privacy](../../project/ai-privacy/).

## Troubleshooting

| Problem                                      | What to check                                                                                                                        |
| -------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| Merran is missing from Android's share sheet | Open the HTTPS address, install through a compatible browser, and reopen the sending app. A plain HTTP LAN bookmark is insufficient. |
| Shared files were lost                       | Reopen the installed app and share again; the service worker must retain the shared files until the page reads them.                 |
| Shortcut returns unauthorized                | Check the complete `Bearer …` header, key revocation, and household membership. Create a replacement key if necessary.               |
| Cannot reach the server                      | Test the same URL in the phone's browser, including outside your Wi-Fi. Check HTTPS certificates and remote access.                  |
| Empty or unreadable input                    | Verify the `file` field type/value, or share the recipe's actual URL instead of an app-specific internal link.                       |
| AI unavailable or too large                  | Check the feature's provider requirements; send fewer/smaller files and review the server error.                                     |
| Receipt did not update the pantry            | It intentionally waits for review. Open the receipt from Pantry and confirm the purchases.                                           |

Next: [Recipes](../../use/recipes/), [Shopping and pantry](../../use/shopping-and-pantry/), or the [share endpoint reference](../../api/reference/).
