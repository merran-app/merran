---
title: AI setup and costs
description: Connect providers, choose models, manage household and server keys, and troubleshoot requests.
sidebar:
  order: 2
---

AI is optional. Set up one provider or compatible endpoint, check which key pays, and try a small task before enabling background work.

:::note[Alpha documentation]
This guide follows the current repository implementation. Installation and workflows still need verification against an actual released image before publication. Your installed version may offer different models or controls.
:::

## Before you start

- Complete [first-run setup](../../get-started/setup/). Household owners/admins configure household AI; server admins configure shared keys and policy.
- Have an API key from Anthropic, OpenAI, or Google, or an OpenAI-compatible endpoint reachable from the Merran server. An account in a provider's chat app is not the credential Merran accepts.
- Check billing, model access, and data handling with the provider or endpoint operator. Read [AI privacy and data flow](../../project/ai-privacy/) before uploading household content.

Merran currently supports Anthropic, OpenAI, Google, and OpenAI-compatible addresses such as Ollama, LM Studio, or a gateway. Compatibility varies by model and task; appearing in a model list does not prove support for tools, images, PDFs, or structured answers.

## Connect a household provider

:::note[Available in alpha.4]
The **Add a key** dialog now includes provider-specific steps and a button to open its key page. The same guidance appears for household and shared server keys.
:::

### Get a provider key

| Provider           | Where to register or create a key                                     | In Merran                 |
| ------------------ | --------------------------------------------------------------------- | ------------------------- |
| Anthropic / Claude | [Claude Platform API keys](https://platform.claude.com/settings/keys) | **Open Claude API keys**  |
| OpenAI             | [OpenAI Platform API keys](https://platform.openai.com/api-keys)      | **Open OpenAI API keys**  |
| Google / Gemini    | [Google AI Studio](https://aistudio.google.com/apikey)                | **Open Google AI Studio** |

Sign in or create an account, create an API key, then return to Merran and paste it into **Key**. Check the provider's API billing and available credit. ChatGPT and Claude chat subscriptions do not include API usage; Google's quotas and charges depend on the project and model. These are provider pages, so Merran does not create the account or manage billing for you. **AI setup guide** opens this guide in another tab while you keep the dialog open.

For compatible services, the dialog shows **Connect your own AI service** instead of a provider signup button. Get the API address and any required key from the service or gateway operator.

### Add the key

1. Open **Settings → AI** in the intended household.
2. In **Keys**, under **Your own keys**, choose **Add a key**.
3. Choose the provider under **From**, paste the complete **Key**, and choose **Test and add**.
4. Check the resulting key status. Only a suffix is shown afterward; the saved key cannot be read back through this screen.
5. In **Models**, set **Monthly limit on your own keys, in US dollars** if wanted, then **Save**. A blank limit means no limit.
6. Review the status describing the model and whether it uses **your own key** or **the server's keys**.

**Expected result:** eligible tasks can use the household's provider key. If controls are missing, a household admin must make the change, or the server policy may prohibit adding keys.

Adding a key tests the provider's model list and can also send a tiny generation request to check credit. That credit check can be billable; the updated dialog explains this before **Test and add**. A successful model-list test alone does not prove that every task can run or that the account has credit. Adding another key for the same named provider at the same scope replaces its earlier saved key; compatible addresses can coexist.

## Share server keys

1. As a server admin, open **Settings → AI → Whole server → AI keys** and use **Add a key**.
2. In **Who may use the server's AI**, under **Households covered**, choose who the server's keys cover: households a server admin is in, chosen households, every household, or no household. For **Chosen households**, pick them from the list that appears.
3. Set **Monthly limit for each household, in US dollars**. Under **Tasks they cover**, choose **Change** to pick tasks. Under **Models they cover**, turn off **Any model** to pick models, grouped by provider. Each section's summary line shows how it's set. Under **Models households start with**, choose the models a household uses until it picks its own.
4. Decide whether **Households may add keys of their own** and **Households may add addresses of their own** should be allowed, then **Save**.
5. Check the target household's AI settings and status to confirm access.

**Expected result:** the covered households can use shared keys for permitted tasks/models. The default policy covers only households that a server admin belongs to, has no monthly limit, permits household keys, and does not permit household-added addresses.

The shared monthly limit is **per household**, not one cap across the whole server. A policy restricting server-funded tasks does not itself prohibit those tasks on an eligible household key.

Server keys can also come from `MERRAN_ANTHROPIC_API_KEY`, `MERRAN_OPENAI_API_KEY`, or `MERRAN_GOOGLE_API_KEY`. Those appear as **From the environment** and must be removed or changed in the server environment. An environment key takes precedence over a saved server key for the same provider. Recreate the container after environment changes, as described in [Configuration](../configuration/).

## Connect a compatible or local endpoint

1. For a home-network service, use the server-admin **AI keys** card. Select **An address of your own (Ollama, LM Studio, OpenRouter…)** under **From**.
2. Give it a **Name**, enter the API **Address** (usually ending in `/v1`), and supply **Key, if it needs one**.
3. Choose **Test and add**. The endpoint must return a nonempty model list.
4. Share it with the intended households through the server policy, then select its model in household AI settings.

**Expected result:** the address's reported models appear as choices. Use an address reachable from the server/container; `localhost` inside a container refers to that container, not automatically to the machine running your model.

Household-added addresses require explicit server policy permission and still cannot target private-network addresses. Local services therefore belong in the server-admin card. Compatible endpoints do not receive Merran's built-in provider web-search tools. Their models are tried as supplied, so test the actual task: a text chat working does not establish PDF or tool support.

## Choose models

1. In **Settings → AI**, under **Models**, choose **Model for big tasks** and **Model for small tasks**, or leave **Suggested for your keys** selected.
2. Each task sits under the model for its size and follows it. Choose **Change one** to show a group's tasks and pick a different model for one. A changed task is marked **Changed** and wins over its group's model; **As for big tasks** or **As for small tasks** returns it to its group. **Use the suggested models** clears every choice.
3. Choose **Model for photos and PDFs** to send every photo and PDF to one model, ahead of any task's own: photo and PDF imports, video frames, receipts, and assistant chats with one in them. **As for each task** leaves them with each task's model.
4. Choose **Save** and try that task with a small, non-sensitive example.

| Model group     | Tasks using it by default                                                                                          |
| --------------- | ------------------------------------------------------------------------------------------------------------------ |
| Big tasks       | Assistant conversations, recipe importing, tidying, cooking notes into edits                                       |
| Small tasks     | Ingredient swaps, nutrition, product picking, receipts, discovery, prep reminders                                  |
| Photos and PDFs | Once one is picked: photo and PDF imports, video frames, receipts, and assistant chats with a photo or PDF in them |

A server admin has the same **Model for photos and PDFs** in **Settings → AI → Whole server**, for households that haven't picked models of their own. Once an assistant chat has a photo or PDF in it, the rest of that chat uses the photos and PDFs model, so pick one that can use tools too.

These are model-selection groups, not guarantees of speed or quality. The assistant needs tool support; photo/PDF tasks need the corresponding input support; structured tasks need valid structured answers. Named-provider choices come from Merran's bundled catalog, while compatible endpoints supply their own list. A catalog entry can still be unavailable to your account. Choose a model your provider actually accepts.

Image generation, transcription, and server read-aloud use dedicated implementations rather than simply using the selected chat model: recipe photos support OpenAI or Google keys, video transcription uses OpenAI, and OpenAI read-aloud needs an OpenAI key. Kokoro is a separate optional voice service. See [Cooking](../../use/cooking/) for device-voice requirements.

### Which key pays?

For a task's selected model, Merran first tries an eligible household key, then an eligible shared server key. Without a fixed model selection, it considers defaults for available keys. Server use also requires coverage for the household, task, and model, and available monthly allowance.

If the household allowance is exhausted, an eligible server key can still pay. Conversely, using a household key can allow work when server coverage or allowance is unavailable. A fixed model selection limits the alternatives: Merran does not promise to switch to a different provider just because another key exists.

Keys reported out of credit are temporarily passed over for an hour. Non-streaming AI requests may try another eligible key; an assistant stream that fails does not silently restart the whole reply. After topping up, use **Test** or update **Credit** to clear the recorded condition. Check the status again before resuming work.

## Understand limits and costs

**Spending**, at the top of **Settings → AI**, shows this month's total, how much of each limit is used on **The server's keys** and **Your own keys**, the last six months, and this month by task and by person; background jobs have their own grouping. Server admins have **AI spend** on the **Whole server** side, by household, month and model, and each key in **AI keys** shows a bar of its credit left once credit is entered. Accounting months follow the household's time zone.

Merran records token usage and estimates cost using its bundled prices; speech and images use separate estimates. Model-menu per-use prices are illustrations, not quotes for your next request. Long conversations, large files, searches, retries, and background jobs can change the bill.

:::caution[Limits are not a billing guarantee]
Merran checks recorded spending, and an estimate where supplied, before calls. It records usage afterward. Concurrent calls, streaming, unrecorded failures, credit tests, and provider charges not represented in token estimates can make the actual bill exceed the displayed amount or limit. Models without a known price—including compatible endpoints—count as zero and may display **free**, even when the endpoint charges money. Use your provider's billing controls and dashboard as well.
:::

The **Credit** action lets you enter **Credit now, in US dollars** from the provider dashboard. Merran subtracts its recorded usage from that starting value and warns when about a fifth remains. It does not fetch the live balance or count use outside Merran. **Stop counting** removes that estimate; entering credit does not buy a top-up.

There is no single fixed price per recipe or chat. Check the provider's current API billing dashboard before choosing a budget. Local hosting also has its own hardware and operating costs, even if Merran records no model charge.

## Which features need AI?

| Feature                                                                          | AI requirement                                                                                   |
| -------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| Manual recipes, editing, tags, scaling and units                                 | None                                                                                             |
| Structured recipe-page import and Mealie/Paprika migration                       | None; reading an unstructured page can use AI fallback                                           |
| Manual planning, Fill the week, scheduled Plan each week                         | None; library suggestions use rules and preferences                                              |
| Shopping lists, quantity combining, pantry deductions and put-away               | None                                                                                             |
| Cook steps, checklists, timers                                                   | None; browser voice and optional server voice have separate requirements                         |
| Assistant, AI discovery, tidy-up, note-to-edit proposals, swaps, receipt reading | Usable AI for that task                                                                          |
| Text/photo/PDF recipe import                                                     | AI; model must support the input                                                                 |
| Video recipe import                                                              | AI plus the video module/tools; audio transcription additionally needs OpenAI                    |
| Nutrition                                                                        | Can use USDA data without AI; AI can help match ingredients or estimate nutrition when available |
| Store products                                                                   | Store integration required; AI can choose among products, with a non-AI fallback                 |
| Generated recipe photos                                                          | Optional photo feature and a usable OpenAI or Google key                                         |

The global AI module can appear available because a key exists somewhere on the server. That does not mean your household has permission, credit, or a suitable model for every task. A task in the model settings is also not evidence that a standalone user feature is available in your release.

## Try a request and review the result

Open **Ask the assistant**, start **New chat**, and ask a small question about a recipe you are comfortable sharing. A readable reply confirms that this model can answer; inspect **Spending** afterward. Then try a proposed change and review its card before applying it. Follow [Assistant proposals and approvals](../../use/assistant/) for the full workflow.

**Tidy up new recipes** is an opt-in household setting. When enabled, imports can trigger background AI calls with suggestions waiting in **Review**. Turning it off prevents that automatic tidy-up; it does not disable every other AI feature or cancel all work already running.

## Troubleshooting failed requests

| Message or symptom                                          | What to check                                                                                                                                                                          |
| ----------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| No AI key / not covered                                     | Confirm the active household, a usable key, and server coverage for the household, task, and model. Ask an admin if you cannot edit settings.                                          |
| Monthly limit reached                                       | Check whether it is the household-key or server-key allowance. Wait for the next accounting month or have the responsible admin change it. A different eligible key may still be used. |
| Out of credit                                               | Check the provider dashboard, top up there if wanted, then **Test** in Merran. Credit estimates are not the live balance.                                                              |
| Provider refuses the key                                    | Check that it was copied whole and belongs to the chosen provider. Replace it if revoked.                                                                                              |
| **Enter it again**                                          | The server can no longer decrypt that saved key, often after a master-key change. Remove and re-add it; preserve the server secret in [backups](../updating-and-backups/).             |
| Model cannot read photos/PDFs, use tools, or fill in a form | Choose a model with the required capability. A successful key test does not test all capabilities.                                                                                     |
| No models / address is not an AI provider                   | Check the API base address and model installation. Test connectivity from the server; private-network endpoints must be added by a server admin.                                       |
| Model shown but requests fail                               | Check provider account access and the model ID. Try another available model or return to the suggested setting.                                                                        |
| Busy / rate limit                                           | Wait before retrying; check provider rate limits separately from Merran's spending limits.                                                                                             |
| Unreachable / provider error                                | Check server network access and the provider/endpoint status. Keep credentials out of logs you share.                                                                                  |
| Answer could not be read                                    | Retry with a smaller, clearer input or choose a model that handles structured output. Check whether an earlier attempt saved anything before retrying.                                 |

When reporting a failure, include the Merran version, task, provider/model, displayed error, and whether the key is household or shared. Remove keys, private recipe/receipt content, and personal details from screenshots or logs.

## Next steps

Read [AI privacy](../../project/ai-privacy/) and [proposal review](../../use/assistant/), then return to [Recipes](../../use/recipes/). Release verification remains a separate prerequisite for publishing these instructions.
