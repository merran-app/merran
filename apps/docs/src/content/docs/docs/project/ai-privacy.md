---
title: AI privacy and data flow
description: Understand what Merran sends to AI services, what it keeps, and what approval does and does not control.
---

Self-hosting keeps Merran's application data on your server, but using an external AI provider sends task content to that provider. A local compatible endpoint changes the destination; it does not automatically make every integration local.

:::note[Implementation scope]
This describes the current repository code, pending verification against a released image. It is not a guarantee about a provider's retention, training, or billing terms. Check those terms and your account settings with each service you enable.
:::

## Before you start

Ask your household/server administrator which models and endpoints are configured and whether shared-key fallback is possible. Read [AI setup and costs](../../run/ai-setup/) to identify who pays and which destination can be chosen for each task.

Only include content you intend that service to process. Receipts, photos, notes, and dietary preferences can contain personal information beyond the ingredient names.

## What goes to AI services

| Action                       | Content the implementation can send                                                                                                                                    |
| ---------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Assistant message            | Your message, conversation history and attachments, your name, household name, date, household tastes/rules, and optional recipe or plan context from the current page |
| Assistant lookups            | Results from tools reading household recipes, tags, meal plans, shopping lists, and pantry; those results become model context                                         |
| AI page/text import          | Recipe/page text, source details and the content supplied for reading; structured imports do not need this AI step                                                     |
| Photo/PDF import             | The selected images or PDF content, not just the text visible in the result                                                                                            |
| Video import                 | Available description/captions, transcript and selected video frames; audio can separately go to OpenAI for transcription                                              |
| Tidy-up, swaps, note-to-edit | Relevant recipe content and task context, including cooking notes or substitution information                                                                          |
| Receipt reading              | The uploaded receipt images/PDF or pasted text, which may include names, addresses, identifiers and payment details printed on the receipt                             |
| AI discovery                 | Requested theme, household tastes/rules and discovery context; provider web search can process search queries                                                          |
| Nutrition assistance         | Recipe/ingredient quantities and food matching candidates, or recipe data for an estimate                                                                              |
| Store product picking        | Shopping item text and candidate product names, sizes, prices, sale and stock information                                                                              |
| Recipe photo generation      | A prompt based on the recipe name, description, ingredients, finishing instructions and chosen photo style                                                             |
| OpenAI read-aloud            | Text to speak and voice settings; Kokoro sends text to the configured Kokoro service instead                                                                           |
| Key testing                  | Authentication to the provider and a model-list request; named-provider credit testing can also send a small “Reply with OK” request                                   |

The assistant does not need to upload the whole database at once to expose household information: individual tool results can supply the relevant records during the conversation. Those lookups do not each have a separate approval prompt.

### Control current-page context

Before sending a message, use **Don't send what's on the screen** on the assistant's context indicator to omit that page context. This does not erase earlier messages or attachments, remove household tastes from the prompt, or disable the assistant's household lookup tools. Starting **New chat** avoids including that earlier conversation as history in the new chat; it does not delete the old one.

### Approval happens after processing

The provider has already processed the prompt when a proposal appears. **Dismiss** prevents applying that proposal to your kitchen data; it does not retract the request, refund its cost, or delete content at the provider. Read [Assistant proposals and approvals](../../use/assistant/) for the difference between proposals, direct actions, and background jobs.

## What stays on your server

Merran stores recipes, plans, pantry/list records, AI usage metadata and proposals in its application data. Assistant chats are saved with their messages and tool results; attachments are stored for later use in the conversation. Chat access in the application is scoped to the person and household. Household recipe data and applied changes are shared with household members.

Saved provider keys are sealed using the server's secret-management mechanism. Settings returns a suffix rather than the full key. A key entered in the web form still travels from that browser to your Merran server, and the server sends it to the configured provider to authenticate requests. This is not a promise that a server operator with access to the running service cannot use its credentials.

The usage records include household/person, task, provider, model, key reference, token counts and estimated cost. The person running the server controls its database, files, logs and backups. Protect those together with the server secret; see [updating and backups](../../run/updating-and-backups/).

## Reduce or remove retained content

1. Before sending files, remove unrelated pages or sensitive receipt details from the copy you upload.
2. Use **Earlier chats** to find a conversation and its **Delete** action when you no longer want it retained in Merran.
3. Confirm the chat is gone from your history.

**Expected result:** deleting a chat removes its messages and attached chat files from Merran's active storage. It is not a global erase of resulting recipes, applied changes, usage records, backups, or provider-held copies. Do not assume deleting a chat undoes a proposal you already applied.

Removing a provider key stops that saved credential from being selected in future requests. It does not revoke it with the provider, delete prior requests, or stop all AI if another household/server key is eligible. Environment keys must be changed in the environment.

## Using a local model

A server admin can add a private-network OpenAI-compatible endpoint and share it with chosen households. Select that endpoint explicitly for the tasks you want it to handle, then test each required capability.

Check every task's configuration: selecting a local model for the assistant does not automatically route photo generation, video transcription, speech, nutrition lookups, or other tasks to it. Dedicated media features can require external provider keys. A gateway may forward requests elsewhere; verify its routing with its operator. Local hardware and service operation also remain your responsibility.

## Other network services

AI settings are not a general network-isolation switch. Recipe importing contacts source websites; video imports contact video services; discovery can use provider web search; USDA nutrition and store connections contact their respective services. Cook-view speech recognition may use the browser vendor's service, even with local read-aloud. Your reverse proxy or tunnel can also sit between the browser and Merran.

The core manual workflow works without AI: [recipes](../../use/recipes/), [planning](../../use/planning/), [shopping and pantry](../../use/shopping-and-pantry/), and [cooking](../../use/cooking/). Avoiding AI tasks does not by itself stop non-AI integrations from contacting their services.

## Troubleshooting privacy expectations

| Expectation                                                 | What to check                                                                                       |
| ----------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| “I dismissed the card, so nothing was sent.”                | Proposal generation already sent task content. Approval controls applying the change.               |
| “I selected a local model, so all features are local.”      | Check per-task choices, media features, fallback keys, gateways and browser speech recognition.     |
| “I removed the key, so AI must be off.”                     | Another eligible household/server key or environment key may still be available. Check task status. |
| “I hid page context, so the assistant cannot read recipes.” | Page context and tool access are separate; tools can still retrieve household data.                 |
| “Deleting chat removes every copy.”                         | It removes active chat data in Merran, not backups, resulting kitchen data, or provider records.    |

## Next steps

Review [key ownership and spending limits](../../run/ai-setup/#which-key-pays) and [how to approve changes](../../use/assistant/) with the people sharing your household.
