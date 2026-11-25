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

Most links come in within a few seconds. One that takes longer than about ten seconds, such as a slow site or one Merran reads with AI, carries on in the background: you'll see **Still importing. It'll be in your recipes soon.** with **View**, and you can close the dialog. When it's in, Merran tells you (for example **Lemon Chicken is in your recipes.**), on every device you have open, and the import has its place on the [Imports](#imports) page.

Merran first reads structured recipe data on the page. If none is available, it can use AI when configured. A blocked, private, or unsupported page may still fail. Import is not a promise that every website can be read.

From alpha.7, on the many food blogs that use the WordPress Recipe Maker card, Merran also brings in the card's ingredient groups (such as "Orange sauce"), its numbered notes, and its summary. A short version of the recipe that a site puts before the full steps, such as **Abbreviated recipe**, is left out, so the steps aren't there twice.

When a page's recipe data has no description, Merran uses the short description the page gives search engines and link previews, as long as it's about the dish rather than the site. Pages imported with the browser extension get the same.

When a site turns Merran away, you'll see **That site turned Merran away. Type the recipe in instead.** The [browser extension](../../integrations/browser-extension/) can import the page from your own browser. From alpha.7, a server admin can also connect [FlareSolverr](../../integrations/flaresolverr/), so those links come in from here and from your phone.

If **You have this one** appears, choose **Open it** to use the existing recipe. **Add it again** creates a separate recipe; it does not update the earlier copy. It also knows the same page under another address: `http` or `https`, with or without `www.`, or its print version.

### Several links

1. In **Add a recipe**, choose **Got several? Paste them all**.
2. Paste URLs one per line or mixed into text. Review the new and skipped links and optionally enter **Tag them (optional)**.
3. Choose **Import** with the displayed count. The import's page shows each link as it goes, and carries on if you leave it.
4. Review the results. Use **Try again** for links that didn't come in, or **Stop** to stop pending work.

Only the first 100 links are considered per batch. Existing recipes are skipped. Video links come in with the rest when video import is on; when it's off, they're left out and the list says so. Successful imports remain even if other links fail.

### Discover new recipes

Discover needs AI, with web search, so the household needs an AI key.

1. Open **Recipes → Find recipes → Discover**.
2. Type a theme into **What sounds good?**, such as "Sheet-pan dinners", or pick one of the ideas, then choose **Find recipes**.
3. Matches from the recipe sites Merran reads show straight away, then recipes from the web as Merran opens each page: **Opening the recipes it found: 3 of 11**. Each round of a search adds up to 12 recipes: up to 4 from the recipe sites Merran reads, then up to 8 from the web.
4. Choose **Import** on a recipe to add it, or **Open it** if you already have it.

Merran opens each recipe's page before it shows it, so what you see will import. Choose **Stop** to end the search early: it keeps what it found, and says **Stopped. Here's what it found.** Choose **Find more** to carry on with another round, which adds to the same search and leaves out what it has shown already. **Earlier searches** keeps the last 12, so you can come back to them.

A collection under **Collections** has its own **Find more**. It adds to that collection's last search, and what the search already found stays out of it.

### Type one in

1. Choose **Type one in instead** from **Add a recipe**.
2. Enter a **Name**, numeric **Servings** where known, and optional **Makes** text such as “2 loaves.”
3. Type each ingredient and each step in its own box: **Enter** starts the next one, and pasting several lines adds one for each. **Add section** adds a heading, such as “For the sauce”, for the lines under it; typing `#` at the start of a line does the same.
4. Add times, tags, and notes, then choose **Add recipe**.

**Expected result:** your new recipe opens. A numeric serving count makes later scaling clearer; descriptive **Makes** text does not replace it.

### Optional: text, photos, PDFs, and videos

| Source        | Steps                                                                                          | Requirements and limits                                                                                                                                                                  |
| ------------- | ---------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Pasted text   | Choose **Paste text**, paste one recipe, optionally add **Where it's from**, then **Read it**. | AI reads the text; check every amount and step.                                                                                                                                          |
| Photos or PDF | Choose **Photos or PDF**, select the pages in order, then **Read it** or **Read them**.        | AI import; the picker accepts up to four files for one recipe. Use readable pages and review the result.                                                                                 |
| Video link    | Paste a TikTok, YouTube, Instagram, or Facebook link into **Link to a recipe**.                | Optional video module, server tools `yt-dlp` and `ffmpeg`, and AI. Audio transcription may need a configured transcription provider. Availability depends on access to the source video. |

Text and photo controls appear only when AI is available. Video processing can take longer than a page import, so a video link always carries on in the background, with a notice when it's in, like a slow link. These methods send content to the configured services and may incur provider charges. They produce a saved recipe to check, not a guarantee that missing quantities were recovered correctly.

## Edit and organize

recipes opened from **Plan** include any shopping substitutions saved for that meal. The notice explains that the library recipe may differ. Open the recipe directly from **Recipes** to inspect the library version; permanent edits still change that library recipe.

On wide screens, long descriptions are shortened in the recipe overview so the recipe details stay near the photo. The full description remains in **Edit**.

cards show **Planned this week** when the recipe is on the household's current weekly plan, as a main dish or side, including the any-day pool. The badge follows the household's time zone and week-start setting. Cooked meals still count; skipped meals do not.

1. Open a recipe and choose **Edit**.
2. Correct the name, original link, servings, times, ingredients, or steps. Use **Notes** for lasting tips and substitutions.
   - Each ingredient and step has a ⋮ menu with **Move up**, **Move down**, **Add a section above**, and **Delete**. **Backspace** at the start of one joins it to the one above.
   - **Edit as text** shows the ingredients or the steps one per line in a single box, for pasting or changing many at once. Your device remembers which way you used last, for each of the two.
3. Under **Tags**, type a tag and press Enter or type a comma. Add a rating if useful. From alpha.8, tap the left half of a star to give half of it.
4. Choose **Save**. Leaving with unsaved edits prompts you before discarding them. In alpha.5, the confirmation opens as a bottom drawer on phones, with **Cancel** and **Leave without saving**.

**Expected result:** the saved recipe opens with your changes. **More → Versions** lets you inspect earlier versions and **Go back**; restoring also keeps the current version in history.

On **Recipes**, use **Search recipes**, tags, **Filters**, and **Sort by** to find meals. **Manage tags** can rename a tag across recipes; renaming it to an existing tag merges them. Deleting a tag removes the tag, not the recipes.

Right-click a recipe card, or press and hold it on a phone, for **Open in a new tab**, **Start cooking**, **Plan it**, **Edit**, **Tags**, **Select** and **Delete**. These act on that one recipe; **Select** starts picking several.

**More → Possible duplicates** lists recipes that look like the same one, in pairs side by side: **Same link** when they came from the same page under any address, **Same name** when their names have the same words, whatever their order or small words like "easy". A name inside another, such as "Sticky Lemon Chicken" and "Lemon Chicken", counts only when most of their ingredients match too. Each recipe has **Open** and **Delete**; **Not the same** takes the pair off the list for everyone in the household. A recipe added in the last 7 days also says so when you open it: "You may have this one already:", with **Open it** and **Not the same**. Tidy up's Review lists them too. None of this needs AI.

**Delete** moves a recipe to **Recently deleted** for 30 days. **Put back** restores it during that period. **Delete for good** and **Empty** are permanent: the recipes go at once, and their photos are removed in the background, so a slow file store doesn't keep you waiting. Right-click a recipe in **Recently deleted**, or press and hold it on a phone, for **Put back**, **Select** and **Delete for good**.

**Work out nutrition** and **Make one with AI** (or **Make another photo**) on a recipe usually finish while you wait. One that takes longer than about ten seconds carries on in the background: the recipe says **Working out nutrition…** or **Making a photo…**, the button waits, and you can leave the page. It says so after a reload, and on another device, and pressing the button again joins the work already going rather than starting it twice. When it's done, Merran tells whoever pressed the button, with **View**: **Lemon Chicken's nutrition is worked out.**, or **Lemon Chicken has a new photo.** If it didn't work, the notice says why, as **Couldn't work out Lemon Chicken's nutrition.** or **Couldn't make a photo for Lemon Chicken.** A recipe also shows **Working out nutrition…** or **Making a photo…** while Merran does either for it after a save. A site's recipe photos are fetched when Merran reads the site, so a collection of them opens with its photos ready.

Optional **Tidy up** uses AI and asks you to review suggested changes. In alpha.5, **Tidy up** and a recipe’s **Review** button open a bottom drawer on mobile with a fixed heading and **Close** button; larger screens keep the dialog. Treat imported or inferred diet labels, nutrition, and costs as information to check: they depend on recognizable ingredients and available data, and are not guaranteed for every recipe.

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
3. Select the file and choose **Check the file**. A big file can show **Checking the file…** for a moment while Merran reads it.
4. Review the recipe count. If the backup has several groups, choose the **Mealie group** you want.
5. Choose **Import**, wait for the results, and review any errors. **See the import** opens its page on the [Imports](#imports) page, which keeps the results after you leave Settings.
6. Open several imported recipes and compare photos, servings, ingredients, steps, ratings, and notes with the source.

The same card also accepts Paprika exports. Merran's own household archive uses the separate import card on this settings page.

### Connect directly to Mealie

1. Sign in as a server admin who also has owner/admin access to the target household.
2. In **From another app**, choose **Connect to Mealie**.
3. Enter **Mealie's address** and an **API token** from Mealie's profile settings. The address must be reachable from the Merran server, not just your browser.
4. Choose **Connect**, review the found recipe count, then **Import**.
5. Check the results and compare representative recipes with Mealie before relying on the new library.

**Expected result:** new recipes and supported associated data are added to the active household. Previously imported recipes are skipped, so importing again brings in new recipes rather than synchronizing later edits. The token is kept only while the import runs, so **Try again** asks for it again. Missing photos or individual recipe errors should be reviewed in the import results.

## Imports

**Recipes → ⋯ → Imports** lists everything that brought recipes in over the last 90 days, newest first: several links, a starter collection, a Mealie backup, export or connection, a Paprika file, a Merran export, and a single link or video that carried on in the background. Each says who started it, when, and how it went, such as **48 came in, 3 already here, 1 didn't**. Everyone in the household sees every import. When one you started finishes, Merran tells you, with **View** to its page.

An import's page has three lists, a hundred at a time (**Next 100** shows more):

- **Came in:** each recipe it brought in. Tick some and choose **Delete** with their count, such as **Delete 3**, to move them to Recently deleted.
- **Already in your recipes:** each linked to the one you have.
- **Didn't come in:** each with why. **Try again** starts a new import of just those, and of any it never got to. For a file, Merran keeps the upload for a week after an import with failures; after that, upload it again. For Mealie through its API, enter the **API token** again.

**Undo** moves what the import brought in to Recently deleted, where it stays for 30 days. It asks first, with every recipe ticked and those **Changed since**, **Planned** or **Cooked** marked; untick any to keep them. A running import is stopped first. For a Merran export, Undo covers its recipes; the household settings it brought stay. An undone import says how many recipes went, with **Restore** to put back those still in Recently deleted.

**Delete the record** removes the import from the list. Its recipes stay.

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
| An import brought in recipes you don't want  | Open it on the **Imports** page and use **Undo**, or tick the ones to throw out and choose **Delete** with their count.            |
| **Try again** says to upload the file again  | Merran keeps an upload for a week after an import with failures. Upload it again in **From another app**.                          |

## Next steps

For importing from another device, follow [Browser extension](../../integrations/browser-extension/) or [Share from a phone](../../integrations/phone-sharing/). See [optional modules](../../integrations/optional-modules/) for video, nutrition, and generated recipe photos.

For optional imports and recipe suggestions, read [AI setup and costs](../../run/ai-setup/), [AI privacy](../../project/ai-privacy/), and [proposal review](../assistant/).

[Plan meals for the week](../planning/), then [build a shopping list](../shopping-and-pantry/). To use a recipe right now, [start cooking](../cooking/). To send one to someone outside your household, [share it as a link](../sharing-recipes/).
