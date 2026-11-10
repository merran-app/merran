# A model for photos and PDFs

Design agreed November 9, 2026. It ports the idea behind bula87's fork ([8e17e90](https://github.com/bula87/merran/commit/8e17e90) and [3b81157](https://github.com/bula87/merran/commit/3b81157)), which added an image model that photo imports retried with after a failure. Here the model is used from the start, for every call with a photo or PDF in it, and nothing is retried.

## What it's for

A household picks one model for big tasks and one for small ones, and can pick a model for any task. Nothing lets it send photos and PDFs somewhere else. That matters when:

- The household runs a free local text model, on Ollama say, that can't read photos. Today a photo import, a receipt photo or a photo in the assistant fails, or the model ignores the photo.
- A cheaper model reads photos as well as the big one, or a different one reads them better.

Done means:

- Settings → Household → AI has a **Model for photos and PDFs**. When one is picked, every AI call with a photo or PDF in it uses that model: photo and PDF imports, a video's frames, receipts, and the assistant once a photo or PDF is in the chat.
- Settings → This server → AI has the same picker, as a default for households that haven't picked any models.
- Spend still counts under the task the call was for (Import, Receipts, Assistant), with the model actually used.
- With nothing picked, every call goes where it goes today.

Out of scope:

- The fork's translation model, and its retry with the image model after any error.
- A separate model for PDFs: one model reads both.
- Generated recipe photos, transcription and the server's voice, which use fixed models of their own, as today.

## Words

- A **photo or PDF call** is an AI call that needs a model that can read images or PDFs. Features already say so when they call AI: `needs` includes `"images"` or `"pdfs"`.
- The **Photos and PDFs model** is `vision` in the API and the code.

## Which model reads a photo or PDF

For a photo or PDF call, the first of these that's set is the only model tried, as a picked model is today:

1. The household's Photos and PDFs model.
2. The household's model for that task.
3. The household's model for the task's size, big or small.

When the household has picked none of them, the candidates are tried in order, as they are today:

1. The suggested model for each of the household's own keys.
2. The server's Photos and PDFs default.
3. The server's default for the task's size.
4. The suggested model for each of the server's keys.

So:

- The Photos and PDFs model wins over a task's own pick (decided November 9, 2026). One rule: photos go where the household sent them.
- The server's default applies only when the household has picked none of the three for that call, like the server's big and small defaults today. A household that picks its own models picks its own Photos and PDFs model too.
- A household's own keys still come before the server's.
- Calls with no photo or PDF are unchanged.

When the chosen model can't run (no key for it, the server's keys don't cover it, a limit reached, a key out of credit), the call says why, exactly as today. It doesn't fall back to the task's model.

The ability check is unchanged. A model Merran knows that can't read photos or PDFs, or can't use tools for the assistant, is refused with `ai_model_cant` and the message saying what to pick. A model at an address is tried as it is.

## How a call is known to have a photo or PDF

Every feature that sends photos or PDFs already passes `needs` to `useAi` or `prepareAi`:

- Recipe import (`readRecipe` in `services/recipes/import/ai-reader.ts`): photos, PDFs, and a video's frames, which go in as JPEG photos.
- Receipts (`services/pantry/receipts/receipts.ts`): photos, screenshots and PDFs.
- The assistant (`services/assistant/respond.ts`): the file types across the whole chat, earlier messages included.

`useAi` and `prepareAi` treat a call as a photo or PDF call when `needs` includes `"images"` or `"pdfs"`, and pass that on to resolution. No feature code changes.

The assistant sends a chat's earlier photos with each new message, so once a photo or PDF is in a chat, the rest of that chat uses the Photos and PDFs model. That model needs to use tools too; a known one that can't is refused as above.

## Code

### Shared (`packages/shared/src/ai/`)

- `HouseholdAi` gains `vision: ModelRef | null`, and `NO_HOUSEHOLD_AI` sets it to null.
- `AiPolicy` gains `vision: ModelRef | null`, the server's default for households that haven't picked, and `DEFAULT_AI_POLICY` sets it to null.
- `ResolveInput` gains `visual?: boolean`: the call has photos or PDFs in it. `resolveAi` follows the order above.

### Server (`apps/server/src/`)

- `services/ai/status.ts`: `resolveTask` takes whether the call is visual and passes it to `resolveAi`. `householdAiStatus` adds `vision`: the model and whose key for a photo import (the Import task, visual), or why none.
- `services/ai/run.ts`: `useAi` and `prepareAi` work out "visual" from `needs`.
- `modules/ai/settings.ts`: `aiPolicySchema` gains `vision`.
- `http/schemas/ai.ts`: the household's AI settings and the server's policy gain `vision`, nullable, defaulting to null so a body without it is still valid. The status gains `vision`. Descriptions and examples say what it's for.

Both are stored as JSON, and `householdAi` and `getPolicy` fill in fields added later from their defaults. So there's no migration and no environment variable: the policy is an internal setting.

After the schemas change: `pnpm --filter @merran/server openapi`, then the web and extension `api` scripts, whose two `schema.d.ts` files must match.

### Web (`apps/web/src/features/ai/`)

- `household-ai-card.tsx`:
  - A third picker, **Model for photos and PDFs**, under the big and small ones. With nothing picked it reads **As for each task**.
  - A hint below it: **Used for every photo and PDF: imports, receipts, and assistant chats with one in them.**
  - **Use the suggested models** clears it too, and shows when only it is set.
  - The status line adds **Photos and PDFs use {model}, on {whose}.** when that's a different model from big tasks'. When photos and PDFs can't run but big tasks can, it says why.
- `server-ai-cards.tsx`: the same picker next to the server's big and small defaults, with nothing picked reading **As for each task**.
- The picker shows each model's cost for an import, as the big model's picker does.
- New words go in `locales/en.json`, under `ai.models` and `ai.status`.

Pickers are selects, so the mobile drawer rule doesn't come into it.

## Errors

None new. A photo or PDF call that can't run gives the same `ai_noKey`, `ai_notCovered`, `ai_overLimit`, `ai_ownLimit`, `ai_model_cant` or out-of-credit error as any call, for the model it would have used.

## Tests

Written first, each watched failing.

Shared (`packages/shared/src/ai/ai.test.ts`), on `resolveAi`:

- A visual call uses the household's Photos and PDFs model.
- It wins over the task's own pick and over the size's.
- A call that isn't visual ignores it.
- With no Photos and PDFs model, a visual call uses the task's pick, then the size's.
- A household that picked nothing gets the server's Photos and PDFs default for a visual call, after its own keys' suggested models.
- A household that picked a big model doesn't get the server's Photos and PDFs default.
- A Photos and PDFs model with no key says why, and doesn't fall back.

Server, on SQLite and Postgres, with the fake AI recording which model was called:

- A photo import, a PDF import and a video import's frames use the Photos and PDFs model. A text import, and a page without recipe data, keep the Import model.
- A receipt photo uses it. A pasted receipt's text doesn't.
- An assistant message with a photo uses it, and so does the next message in that chat. A chat with no photo doesn't.
- Usage is recorded under the task, with the model used.
- The household's AI settings save and return `vision`, and a body without it saves null. The same for the server's policy.
- The status has `vision`.

## Docs

- `docs/platform.md`, under AI: the Photos and PDFs model in the tasks table, and how it's chosen, with today's date.
- `docs/features.md`: a row for picking a model for photos and PDFs, and the photo and assistant rows' notes.
- `apps/docs/src/content/docs/docs/run/ai-setup.md`: **Choose models** gains the picker, quoting its labels, and what it covers. The model-group table gains its row.

## Credit

Commits that reuse ideas or code from the fork carry `Co-authored-by: bula87 <bula87@gmail.com>`.
