---
title: Planning
description: Add meals, set servings and theme nights, and fill the week from your recipe library.
---

Choose meals for specific days or keep a few ready for any day of the week. Planning and **Fill the week** work without AI.

:::note[Alpha documentation]
These steps follow the current repository implementation, pending fresh-install verification against a released image. Controls may differ in your installed alpha.
:::

## Before you start

- Add a few [recipes](../recipes/), with accurate ingredients and servings.
- Select the right household. Its time zone and week-start setting determine which day and week the plan uses.
- Household owners/admins manage **Settings → Household → Planning**. This selects which meal types automatic planning fills; you can still add other meals manually.

## Add a meal and set servings

the recipe picker shows **Already planned** for recipes already added to the week you are choosing meals for, including its any-day pool and sides. Cooked meals still count; skipped meals do not. This badge also appears when you **Pick a side**, using the week selected in **When**. You can still select a recipe again for an intentional repeat.

1. Open **Plan** and use the week controls to choose your week.
2. On a day, choose **Add breakfast**, **Add lunch**, **Add dinner**, or **Add a snack**.
3. Choose **A recipe**, search, and select a recipe. For leftovers or eating out, choose **A note** instead and enter the text.
4. Open the meal's menu and choose **Move or change** to adjust **When**, **Meal**, **Servings**, an optional **With** recipe, or **Note**. Choose **Save**.

**Expected result:** the meal appears in its day and meal slot. Leaving servings empty uses the recipe's count. Meal servings determine ingredient amounts for shopping; changing the recipe page's display alone is not a change to this plan entry.

From alpha.6, if you notice the wrong count after opening cook view, change **Servings** in the header and choose **Save to plan**. **Done cooking** or **Exit** also saves an unsaved planned serving change.

For flexibility, use **Add a meal** under **This week, any day**. Choose **Tonight** when you are ready to put it on today's plan, or **Move or change** to choose another day. A note can reserve a meal without adding recipe ingredients to the shopping list.

## Set theme nights

1. Open **Settings → Household → Theme nights**.
2. Choose a theme for each dinner, or **A tag of your own…** and enter a recipe tag.
3. Return to **Plan** and try **Fill the week**.

**Expected result:** dinner suggestions prefer recipes matching the theme. Leftovers and eat-out themes leave those dinners empty. A theme applies to dinner, not every meal of that day.

Themes are not absolute restrictions: if no eligible recipe fits a theme, Merran can suggest another recipe and explain that nothing fits yet. Add matching recipes or tags to improve the next suggestions. Household **Tastes** and diet settings also affect eligibility; inspect ingredients yourself when a dietary restriction matters.

## Fill the week

1. Open **Plan → Fill the week** on the current or a future week.
2. Choose which of the enabled meal types to fill. Dinner is initially selected when enabled.
3. Review each proposed meal and its reason. Use **Something else for…** to try another idea or **Leave…empty** to omit a slot.
4. Choose **Add … meals** to put the remaining ideas on the plan.

**Expected result:** selected ideas fill empty slots from today onward. Existing dated meals stay in place, and nothing is added by merely opening the panel. In alpha.5, this and other forms or confirmations open in a bottom drawer on phones; larger screens use a dialog.

Ideas come from your library, not an AI search. Recipes recently planned or made are excluded around a two-week window. Tags help identify breakfast, lunch, and snack recipes; recipes tagged as sauces or other meal components are not suggested alone. Household tastes and weeknight time limits can narrow the choices. Pantry ingredients, ratings, and optional store price information influence selection. A budget is a preference based on known costs, not a guaranteed spending cap.

## Optional: plan automatically each week

1. In **Settings → Household → Plan each week**, enable **Plan the week ahead for us**.
2. Choose the day, time, and meals. The schedule uses the household's time zone.
3. Enable **Put what those meals need on the list** only if you want list creation too.
4. Check the next run shown in settings and review the resulting plan after it runs.

**Expected result:** Merran fills the next week's eligible empty meals using the same library-based suggestions. This does not require AI and does not send anything to a store cart. The server must be running to process the job; after downtime, it can catch up for the remaining part of the intended week.

## Subscribe to the meal calendar

Available from alpha.6. A household admin can open **Settings → Household → Meal planning → Calendar subscriptions**, turn on **Let members subscribe to this household's meal calendar**, set each meal's **Start time** and **Duration (minutes)** under **Usual meal times**, then choose **Save calendar settings**. The server administrator must set `MERRAN_PUBLIC_URL` to an address the calendar app can reach.

Each member can choose **Create subscription link**, copy **Your calendar link**, and add it as a subscribed calendar in their calendar app. The link is shown only when created; **Revoke** stops future reads, and a replacement link can be created. Anyone holding the link can see meal names and notes. Recipe links still require a Merran sign-in.

On **Plan**, select a dated meal's time to change **Starts at** and **Minutes** for that day, or choose **Use usual time** to reset it. All dishes in the day's meal share that time. Meals in **This week, any day** have no calendar event until dated; skipped meals are omitted. Merran changes appear when the calendar app refreshes its subscription. Editing or deleting an event in the calendar app does not change Merran.

## Change plans

drag a meal's move handle (the arrow over its photo) from **This week, any day** to a day's meal, between days or meal types, or back to the pool. Mouse, pen and touch are supported; hold near the top or bottom of the screen to scroll. Drop outside a highlighted destination or press Escape to cancel. Expand past days with **Show** before moving a meal there.

Dropping into an empty slot moves immediately. If a dated slot already has dishes, review them and choose **Move alongside** or **Cancel**. Existing dishes stay in place. The moved meal keeps its servings, side, note and cooked/skipped status; it can be moved regardless of the destination's theme night. Returning to the pool keeps its meal type.

For a destination picker, tap the handle or focus it and press Enter, then select **When** and **Meal** and choose **Move**. Bulk **Move** remains available when selecting several meals. Moves appear immediately while saving; a failed save restores their previous locations and shows an error. Successful moves offer **Undo**, which also updates immediately. Moving meals preserves existing shopping quantities and checked items.

Use a meal's menu to **Move or change**, **Skip**, or **Remove** it. **Plan it again** reverses a skip. **Repeat last week** in the week's menu can reuse meals without replacing already planned slots. Review servings and dates after repeating.

Choose **Mark cooked** when a planned meal has been made. This can consume its pantry stock. **Not cooked yet** reverses that status and restores recorded pantry deductions. Avoid marking meals cooked simply to hide them; use **Skip** when you did not make them.

## Troubleshooting and limits

| What you see                              | What to check                                                                                                                    |
| ----------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| No suggestions or some slots remain empty | Add more recipes, tag meal types, and check tastes, recent meals, and time limits. You can still choose a recipe manually.       |
| A meal type says **Not filled for you**   | A household admin can enable it under **Planning**. This does not prevent manual additions.                                      |
| A theme is missed                         | Check recipe names/tags and the explanation on the suggestion. Themes can fall back when nothing eligible matches.               |
| The wrong day or week is shown            | Check the household's time zone and **Week starts on**, rather than only your device clock.                                      |
| The automatic run did not fill anything   | Check that it is enabled, the next/last run, the server's availability, and whether slots were already filled or no recipes fit. |

Changing a listed meal can update its outstanding shopping ingredients. Check the [list](../shopping-and-pantry/) after changing servings, recipes, or dates, especially when some items have already been bought.

## Next steps

[Create the shopping list and check pantry deductions](../shopping-and-pantry/), or [cook a planned meal](../cooking/).
