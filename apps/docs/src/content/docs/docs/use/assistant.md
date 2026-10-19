---
title: Assistant proposals and approvals
description: Ask about your kitchen, inspect proposed changes, and understand direct and background AI actions.
---

The assistant can answer questions and propose changes to your recipes, plan, list, and household tastes. A proposed kitchen change needs your action before it is applied.

:::note[Alpha documentation]
These steps follow the current repository implementation. They still need verification against a released image before publication.
:::

## Before you start

- Have an eligible assistant model and key configured in [AI settings](../../run/ai-setup/). The model must support tools; attachments additionally require image/PDF support.
- Select the right household and read [what is sent to providers](../../project/ai-privacy/).
- Review the current plan or recipe so you can recognize an unwanted change.

## Ask a question

1. Open **Ask the assistant** and choose **New chat**, or return through **Earlier chats**.
2. Check the context indicator. Use **Don't send what's on the screen** if you do not want the current recipe/week attached as page context.
3. Enter a question in **Ask anything**, such as “What should I use up first?”, then **Send**.
4. Read the response and any lookup/source information. The assistant may inspect household records or search the web when supported without asking you to approve each read.

**Expected result:** a reply appears and the conversation is retained. A question may be answered without a proposal. **Stop** interrupts a response but is not an undo, refund, or deletion of processing already performed.

For a change, ask explicitly—for example, “Suggest dinners for Monday and Tuesday using my recipes.” Check that the result uses the intended dates and meals.

## Review a proposal card

1. Read the card's summary and contents. Check names, amounts, dates, servings, and household dietary preferences.
2. Choose **Dismiss** if you do not want the proposed change.
3. Otherwise choose the action that matches the card:

| Proposal         | Action and result                                                                                               |
| ---------------- | --------------------------------------------------------------------------------------------------------------- |
| Recipe edit      | **Review**, select the sections to keep, then apply them                                                        |
| New recipe       | **Save recipe** creates it in the household library                                                             |
| Meals            | **Add to the plan** adds the proposed entries                                                                   |
| Shopping items   | **Add to the list** adds those items                                                                            |
| Household tastes | **Remember** changes the shared tastes/preferences shown on the card                                            |
| Recipe link      | **Import** fetches the recipe; fallback import processing may make additional AI calls                          |
| Ingredient swap  | **Save to recipe** makes the change permanent; **Use this time** applies it to the current cooking view instead |

4. Wait for the success state, then open the affected recipe, plan, list, or settings to check the result.

**Expected result:** the card shows that the action was applied, and the relevant kitchen data changes. Assistant text saying what it recommends is not the same as a saved change. Proposal approval is not retailer checkout.

Recipe-section edits keep a version. If a selected section changed since the proposal was generated, Merran refuses that stale edit instead of overwriting it. Request a fresh suggestion after reviewing the current recipe. This conflict protection should not be assumed for every kind of proposal; inspect the current plan/list before adding older proposals.

## Review tidy-up and cooking-note suggestions

1. Run **Tidy up** on a recipe, or enable **Tidy up new recipes** in household AI settings to generate suggestions after imports.
2. Open the recipe's suggestion or **Review**. Cooking notes can also produce proposed edits when AI is available.
3. Compare the existing and suggested sections, deselect unwanted changes, then apply the chosen sections or **Dismiss**.

**Expected result:** only the selected recipe sections change when you apply them. The cooking note itself is saved when you choose **Save** in the note form; the derived recipe edit is a separate proposal. Use **More → Versions** on the recipe to inspect earlier recipe versions.

## What does not wait for a proposal card?

Approval is specific to the workflow. It is not a global “ask before every AI call” setting.

- Sending an assistant message sends content to its model and saves chat data. Generating a proposal can cost money even if you dismiss it.
- Choosing an AI import action can create a recipe directly after reading the input; inspect it afterward.
- Receipt reading creates a draft; adding selected lines to the pantry requires the receipt confirmation action.
- Requested or enabled background work such as photo generation, nutrition calculation, and automatic tidy-up can process data without a chat card. Tidy-up changes still wait for review, while computed nutrition or generated photos can be saved by their own workflows.
- Scheduled **Plan each week** is a separate, non-AI workflow that adds meals when enabled. It does not require a chat proposal each week.

Review optional settings before enabling automatic work. Provider transmission, provider billing, saving a draft, and applying a kitchen change are separate events.

## Troubleshooting

| What you see                          | What to do                                                                                                                           |
| ------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| A reply but no saved change           | Look for a proposal card and apply it. Ask explicitly for a proposal if you only received advice.                                    |
| A proposal is outdated                | Reopen the current recipe and ask for a fresh change. Do not discard another person's edits just to apply an older suggestion.       |
| Nothing selected to apply             | Select at least one proposed recipe section.                                                                                         |
| A card is already applied/dismissed   | Check the current kitchen data. Generate a new proposal if another change is needed.                                                 |
| Assistant or attachment request fails | Check the task's key, model capabilities and limits using [AI troubleshooting](../../run/ai-setup/#troubleshooting-failed-requests). |
| A reply stops midway                  | Check the chat and affected data before retrying. A partial reply does not prove a proposal was applied.                             |
| A proposed meal or amount is wrong    | Dismiss it or ask for a corrected proposal. Imported and generated content still needs review.                                       |

There is no universal undo for all proposal types. Use the affected feature's normal editing controls; recipe versions help with recipe edits, while plan/list additions need to be corrected there. Deleting a chat does not undo applied changes.

## External AI apps (not released yet)

The MCP endpoint lets a compatible external app read permitted kitchen data and send proposals to **Recipes → Review**. Review now also handles proposed new recipes, meals and shopping items. Every MCP change waits for you to apply it; MCP calls do not use Merran AI credits. See [connecting an AI app](../../integrations/mcp/) for permissions and setup.

## Next steps

[Plan your meals](../planning/), [edit recipes](../recipes/), or review [AI privacy and retained data](../../project/ai-privacy/).
