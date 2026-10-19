---
title: Recipes
description: Import, edit, scale, and organize recipes, or bring a library from Mealie.
---

Build a library you can use for planning, shopping, and cooking. Start with one recipe and check its ingredients before importing the rest.

:::note[Alpha documentation]
These steps follow the current repository implementation. They have not yet been verified on a fresh released container. Your installed alpha may have different controls; check its release notes before looking for newer features.
:::

## Before you start

- Complete [first-run setup](../../get-started/setup/) and select the household that should own the recipes.
- Have a recipe URL or the recipe's ingredients and instructions ready.
- Manual entry, structured recipe-page imports, editing, tags, and scaling do not require AI. Optional AI imports need an enabled AI module and a usable provider configured for your household in [settings](../../run/configuration/).
- Moving a library requires a household owner or admin. Connecting directly to Mealie also requires server-admin access.

## Add a recipe

### From a website

1. Open **Recipes → Add a recipe**.
2. Paste the page URL into **Link to a recipe** and choose **Add from link**.
3. Wait for the recipe to open. Check **Servings**, ingredients, and steps against the original. Use **Edit** to correct them.

**Expected result:** the recipe appears in this household's library, with a source link and a photo when one could be downloaded. A missing photo does not necessarily mean the import failed.

Merran first reads structured recipe data on the page. If none is available, it can use AI when configured. A blocked, private, or unsupported page may still fail. Import is not a promise that every website can be read.

If **You have this one** appears, choose **Open it** to use the existing recipe. **Add it again** creates a separate recipe; it does not update the earlier copy.

### Several links

1. In **Add a recipe**, choose **Got several? Paste them all**.
2. Paste URLs one per line or mixed into text. Review the new and skipped links and optionally enter **Tag them (optional)**.
3. Choose **Import** with the displayed count. The progress page continues working if you leave it.
4. Review the results. Use the retry action for failed links, or **Stop** to stop pending work.

Only the first 100 links are considered per batch. Existing recipes are skipped; unavailable video imports are left out. Successful imports remain even if other links fail.

### Type one in

1. Choose **Type one in instead** from **Add a recipe**.
2. Enter a **Name**, numeric **Servings** where known, and optional **Makes** text such as “2 loaves.”
3. Enter one ingredient per line and one instruction per line. Start a line with `#` for a section, such as `# For the sauce`.
4. Add times, tags, and notes, then choose **Add recipe**.

**Expected result:** your new recipe opens. A numeric serving count makes later scaling clearer; descriptive **Makes** text does not replace it.

### Optional: text, photos, PDFs, and videos

| Source        | Steps                                                                                          | Requirements and limits                                                                                                                                                                  |
| ------------- | ---------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Pasted text   | Choose **Paste text**, paste one recipe, optionally add **Where it's from**, then **Read it**. | AI reads the text; check every amount and step.                                                                                                                                          |
| Photos or PDF | Choose **Photos or PDF**, select the pages in order, then **Read it** or **Read them**.        | AI import; the picker accepts up to four files for one recipe. Use readable pages and review the result.                                                                                 |
| Video link    | Paste a TikTok, YouTube, Instagram, or Facebook link into **Link to a recipe**.                | Optional video module, server tools `yt-dlp` and `ffmpeg`, and AI. Audio transcription may need a configured transcription provider. Availability depends on access to the source video. |

Text and photo controls appear only when AI is available. Video processing can take longer than a page import. These methods send content to the configured services and may incur provider charges. They produce a saved recipe to check, not a guarantee that missing quantities were recovered correctly.

## Edit and organize

recipes opened from **Plan** include any shopping substitutions saved for that meal. The notice explains that the library recipe may differ. Open the recipe directly from **Recipes** to inspect the library version; permanent edits still change that library recipe.

cards show **Planned this week** when the recipe is on the household's current weekly plan, as a main dish or side, including the any-day pool. The badge follows the household's time zone and week-start setting. Cooked meals still count; skipped meals do not.

1. Open a recipe and choose **Edit**.
2. Correct the name, original link, servings, times, ingredients, or steps. Use **Notes** for lasting tips and substitutions.
3. Under **Tags**, type a tag and press Enter or type a comma. Add a rating if useful.
4. Choose **Save**. Leaving with unsaved edits prompts you before discarding them.

**Expected result:** the saved recipe opens with your changes. **More → Versions** lets you inspect earlier versions and **Go back**; restoring also keeps the current version in history.

On **Recipes**, use **Search recipes**, tags, **Filters**, and **Sort by** to find meals. **Manage tags** can rename a tag across recipes; renaming it to an existing tag merges them. Deleting a tag removes the tag, not the recipes.

**Delete** moves a recipe to **Recently deleted** for 30 days. **Put back** restores it during that period. **Delete for good** and **Empty** are permanent.

Optional **Tidy up** uses AI and asks you to review suggested changes. **Not released yet:** on mobile, **Tidy up** and a recipe’s **Review** button open a bottom drawer with a fixed heading and **Close** button; larger screens keep the dialog. Treat imported or inferred diet labels, nutrition, and costs as information to check: they depend on recognizable ingredients and available data, and are not guaranteed for every recipe.

## Scale servings and change units

1. Open the recipe's ingredient list.
2. Use **Make less** or **Make more** to change the displayed servings. Use **Reset** to return to the starting amount.
3. Where **Show amounts** is available, choose **As written**, **Metric**, or **US**.

**Expected result:** recognized ingredient amounts change for the chosen serving factor and unit system. This changes the view, not the saved recipe's original quantities. Use **Edit** to change the recipe itself, and set the meal's servings separately when [planning](../planning/).

If the recipe has no numeric serving count, the control shows a multiplier such as **1×** rather than a number of servings.

Free text such as “salt to taste” cannot become a numeric quantity. Converting volume to weight requires a known food weight; a unit switch cannot turn every cup measurement into grams. Check unparsed lines and do not assume cooking time changes in proportion to servings.

## Move recipes from Mealie

Keep your Mealie backup until you have checked the imported library. This imports recipes and associated recipe data; it does not migrate Mealie's users, meal plans, shopping lists, or server configuration.

### Import a file

1. Obtain a Mealie backup ZIP or recipe export ZIP.
2. In Merran, open **Settings → Import and export → From another app**. If a method selector is shown, choose **A file**.
3. Select the file and choose **Check the file**.
4. Review the recipe count. If the backup has several groups, choose the **Mealie group** you want.
5. Choose **Import**, wait for the results, and review any errors.
6. Open several imported recipes and compare photos, servings, ingredients, steps, ratings, and notes with the source.

The same card also accepts Paprika exports. Merran's own household archive uses the separate import card on this settings page.

### Connect directly to Mealie

1. Sign in as a server admin who also has owner/admin access to the target household.
2. In **From another app**, choose **Connect to Mealie**.
3. Enter **Mealie's address** and an **API token** from Mealie's profile settings. The address must be reachable from the Merran server, not just your browser.
4. Choose **Connect**, review the found recipe count, then **Import**.
5. Check the results and compare representative recipes with Mealie before relying on the new library.

**Expected result:** new recipes and supported associated data are added to the active household. Previously imported recipes are skipped, so importing again brings in new recipes rather than synchronizing later edits. The token is kept only while the import runs. Missing photos or individual recipe errors should be reviewed in the import results.

## Troubleshooting

| What you see                                 | What to try                                                                                                                        |
| -------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| A link cannot be read                        | Check that it opens publicly. Try manual entry, or an optional text/photo import when AI is configured.                            |
| No text or photo import button               | Ask the administrator to check AI module availability, the household's provider setup, and usage limits.                           |
| Video import unavailable                     | Ask the server admin to check the video module and tools, then the household's AI/transcription setup.                             |
| Quantities do not scale or combine correctly | Edit the ingredient into a clear amount, unit, and food name on one line. Check the original before changing it.                   |
| Mealie connection fails                      | Check the address from the server's network, token permissions, and access to the chosen recipes. A file export is an alternative. |
| No direct Mealie option                      | Direct connection is restricted to server admins; household admins can use file import.                                            |
| Import skips a recipe you changed in Mealie  | Re-import skips known recipes. Edit the Merran copy; this is not ongoing synchronization.                                          |

## Next steps

For importing from another device, follow [Browser extension](../../integrations/browser-extension/) or [Share from a phone](../../integrations/phone-sharing/). See [optional modules](../../integrations/optional-modules/) for video, nutrition, and generated recipe photos.

For optional imports and recipe suggestions, read [AI setup and costs](../../run/ai-setup/), [AI privacy](../../project/ai-privacy/), and [proposal review](../assistant/).

[Plan meals for the week](../planning/), then [build a shopping list](../shopping-and-pantry/). To use a recipe right now, [start cooking](../cooking/).
