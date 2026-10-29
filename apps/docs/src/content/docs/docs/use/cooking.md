---
title: Cooking
description: Follow recipes with ingredient checklists, timers, optional voice controls, and cooking notes.
---

Cook view presents a recipe one step at a time. The checklist, steps, and timers work without AI.

:::note[Alpha documentation]
These steps follow the current repository implementation, pending fresh-install verification against a released image. Browser-dependent features need testing on the device you cook with.
:::

## Before you start

- [Add and check your recipe](../recipes/), especially imported quantities and instructions.
- Confirm the intended servings. If cooking from a plan, check that meal's servings too.
- Use a phone, tablet, or computer that can reach your Merran server. Voice controls additionally require browser support and microphone permission.

## Open cook view and gather ingredients

open a meal from **Plan** to use the ingredients and instructions saved by a shopping substitution, including adjusted sides. **Adjusted for this meal** identifies these variants. The library recipe remains separate, and its nutrition/cost estimates do not apply to the variation. Finishing from a planned-meal link marks that specific meal cooked and consumes its adjusted pantry requirements.

1. Open a recipe and choose **Start cooking**, or choose **Start cooking** from a planned meal's menu.
2. On **Get ready**, review the servings and ingredients. Tick each ingredient as you gather and measure it.
3. Choose **Text size** to make the steps easier to read where needed.
4. Choose **Start**, then use **Next** and **Back**. Use **Steps** to jump to a step or return to getting ready.

**Expected result:** each step appears with relevant recognized ingredients under **For this step**. The full ingredient checklist remains useful if automatic ingredient matching misses something.

Not released yet: when a recipe lists the same food more than once, such as soy sauce for the chicken and again for the sauce, a step about one of the recipe's sections shows that section's line, and "everything else" in such a step means the rest of that section. Amounts a step gives ("the 2 tablespoons of cornflour") pick the matching line, and foods named after "except" aren't shown. A step that points to a numbered note, such as "(Note 3)", shows it under **From the recipe's notes**.

From alpha.6, when a recipe has a serving count, use the servings controls in the cook view header to make more or less without leaving your step. Ingredient amounts change immediately. For a planned meal, choose **Save to plan** to update the plan and its linked shopping amounts; **Done cooking** also saves an unsaved serving change. **Exit** saves an unsaved planned change before leaving. For a recipe opened without a planned meal, the adjustment applies only to this cook and does not change the recipe.

Merran tries to keep the screen awake while cook view is open. This depends on browser support and permission; it is not guaranteed on every device.

## Put a step on hold

From alpha.6, choose **Hold this step** beside **Next** at the bottom when you need to come back to an instruction later. Cook view moves to the next step and keeps the held step in a reminder above the recipe. Its marker in **Steps** changes too. You can hold more than one step. Choose a held step from the reminder to return to it, then choose **Done with this step** in the bottom bar to clear the hold. On the last step, holding it leaves you there so you can choose another step or finish.

**Done cooking** warns when steps are still on hold. You can return to a held step or choose **Finish anyway**. Holds are reminders; they do not start or control timers.

## Use timers

1. Tap a recognized duration in a step to start its timer, or choose **New timer**, enter **Minutes**, and **Start**.
2. Watch the timer chips while continuing through the recipe. You can run more than one.
3. Use **+1 min** to extend a timer or its cancel action to stop it. Dismiss the timer when it finishes.

**Expected result:** timers count down independently of the current step. They are saved on this device, but sound and background execution depend on the browser and device. Keep the cooking page available and use a separate timer when you need a dependable alarm with the phone locked or browser closed.

Not every written duration is recognized. Start a manual timer if a time is plain text rather than an interactive control.

## Optional hands-free controls

1. In cook view, turn on **Hands-free** and allow microphone access when the browser asks.
2. Wait for **Listening**, then try “next,” “back,” “read it,” or “ingredients.”
3. Try “timer for 10 minutes” to set a duration, or “how much garlic” to hear a matching ingredient amount.
4. Turn **Hands-free** off when finished. Touch controls remain available if a command is missed.

**Expected result:** supported commands navigate the recipe or control cooking actions, and steps can be read aloud. Listening pauses while Merran speaks. This is a set of cooking commands, not a general-purpose AI conversation.

Browser speech recognition and device speech synthesis are required for hands-free operation. Recognition may use the browser vendor's online service; this is not a guarantee of offline or fully local voice processing. Microphone access may require HTTPS or a trusted local context.

The optional server voice module can read using a configured Kokoro service or OpenAI. Device voices do not require an AI provider key; Kokoro requires its service to be configured, while OpenAI reading requires a usable OpenAI key and incurs provider charges. Server voice failure can fall back to a device voice. A server voice does not add speech recognition to a browser that lacks it.

## Finish and keep notes

1. Choose **Done cooking** when you have finished.
2. In **How did it go?**, add a rating and **A note for next time**, then choose **Save**, or choose **Skip** to leave without a note.
3. Find saved notes under **Cooking notes** on the recipe. Use **Add a note** there to record something later.

**Expected result:** the recipe is marked made today. Merran marks a matching meal on today's plan cooked, or moves a matching meal from this week's any-day pool to today and marks it cooked. A cooked plan entry can consume its pantry stock. Cooking a recipe with no matching plan entry records that it was made; do not assume it deducts an unplanned meal from the pantry.

Cooking notes record what happened on a particular occasion. Use **Edit → Notes** for lasting recipe instructions. When optional AI note suggestions are available, a note may produce a proposed recipe change in **Review**; inspect it before applying it.

:::note[Available in alpha.4]
Finishing with **Done cooking**, **Made it**, or **Mark cooked** on a planned meal plays a short shower of confetti, stars, or petals chosen at random. Pieces rain down across the screen, drifting and tumbling as they fall. Effects are silent and respect your device's reduced-motion preference.
:::

## Resume and troubleshoot

Progress is remembered in this browser for up to 12 hours, including the step and checked ingredients, when the serving scale and paired recipe match. From alpha.6, steps on hold are remembered too, and **Start over** clears them. This is not cross-device cooking progress or an offline copy of the recipe.

| What you see                     | What to try                                                                                                                                                |
| -------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| No steps                         | Return to the recipe's **Edit** screen and add one step per line.                                                                                          |
| Hands-free is unavailable        | Use touch controls. The browser must expose both speech recognition and speech synthesis.                                                                  |
| Microphone denied                | Allow microphone access in this site's browser settings, then try again.                                                                                   |
| No read-aloud voice              | Check device voices and volume; use **Text size and voice** / **Test voice** where offered. Ask the admin to check an optional server voice if configured. |
| Ingredient amount is wrong       | Recheck the recipe's original servings, current scale, units, and parsed ingredient text.                                                                  |
| Screen sleeps or timer is silent | Check browser/device restrictions. Use the device's own timer for a reliable background alarm.                                                             |
| Pantry did not change            | Check whether a matching planned meal was marked cooked; off-plan cooking is not a general pantry deduction.                                               |

## Next steps

For speech setup, see [Kokoro, OpenAI, and device voices](../../integrations/optional-modules/#server-voices).

For provider-backed voice and note suggestions, see [AI setup and costs](../../run/ai-setup/) and [AI privacy](../../project/ai-privacy/).

[Correct pantry stock](../shopping-and-pantry/) after substitutions, [edit the recipe](../recipes/) with improvements, or [plan next week's meals](../planning/).
