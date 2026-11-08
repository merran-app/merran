# Recipe Sharing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A household member shares one recipe as a link, through the phone's share sheet or by copying it, and anyone with the link can read, scale and cook it without an account, with no editing and no AI.

**Architecture:** A household-scoped `RecipeShare` row holds each shared recipe's token. Two public routes under `/api/shared/{token}` return a trimmed recipe and its photo. The web app has a guest page at `/r/$token` that reuses the recipe and cook components. The server fills `index.html`'s head for `/r/*` paths with link-preview tags and schema.org JSON-LD.

**Tech Stack:** Hono + @hono/zod-openapi, MikroORM (SQLite and Postgres), vitest (server), React + TanStack Router/Query, shadcn/ui on Base UI, node:test (web), Astro Starlight (guides).

**Spec:** [docs/recipe-sharing.md](../../recipe-sharing.md). Read it first. This plan argues from it.

## Global Constraints

- Every rule in `AGENTS.md` applies: routes mirror the API (folder per path part, `[param]`, file per method, `index.ts` only registers); words people read go in `apps/web/src/locales/en.json`; phones get drawers (the app's `Dialog` in `components/ui/dialog.tsx` already becomes a drawer on mobile, so use it); readable, expanded code; match the code around you.
- Token: `randomBytes(32).toString("base64url")`, 43 characters, checked against `/^[A-Za-z0-9_-]{43}$/` before any lookup. Stored as itself (spec: Decisions).
- Link URL: `${config.publicUrl}/r/${token}`. Never built from the request's Host. Without `MERRAN_PUBLIC_URL`, `POST …/share` answers 400 with code `share_public_url` and message "Set MERRAN_PUBLIC_URL before sharing recipes by link." (as calendar links do).
- Public routes: `security: []`, `Cache-Control: no-store`, `Referrer-Policy: no-referrer`, `KeyRateLimit(120)` per token (120 a minute), 429 with `Retry-After`, and one 404 (`{ error: { code: "not_found", message: "This recipe isn't shared." } }`) for every way a link can fail.
- Household setting: `settings.sharing.recipes`, read through `recipeSharingOn(settings)`, which is `true` unless saved `false`.
- **Stop sharing deletes the row** rather than setting `revokedAt`. This lets `recipe` be unique, so a double-tap can't make two links, and sharing again still makes a new token. (Small departure from the spec's field list; Task 7 updates the spec to match.)
- A share belongs to the household. It keeps working after the member who made it leaves (`createdBy` is set to null when the user is deleted). Admins can stop it.
- Exact copy (put in `en.json` under `sharing.*`): **Share**, **Share…**, **Copy link**, **Link copied**, **Stop sharing**, **Shared**, "Anyone with this link can see and cook this recipe. They can't change it.", **Shared by {{household}}**, **Start cooking** (reuse `recipes.startCooking`), **Made with Merran**, "Use a recipe app? Paste this link into it to save a copy.", **This recipe isn't shared anymore**, **Let members share recipes by link**, **Sharing** (the settings section).
- After API changes: `pnpm --filter @merran/server openapi`, then `pnpm --filter @merran/web api` and `pnpm --filter @merran/extension api`. On this machine the `api` scripts fail from Git Bash: run them in PowerShell with `$env:pnpm_config_cache_dir` pointing into `.local/`.
- Run Prettier only from the root (`pnpm format`) or on named folders, never on `docs/`.

## Review Focus

1. **A recipe moved to Recently deleted, then restored.** While it's deleted the link answers 404. Once restored, the same link works again, because deleting a recipe doesn't stop sharing it. Owned by Task 3.
2. **A recipe with no photo.** `photo` is null, the photo route answers 404, the head has no `og:image`, and `twitter:card` is `summary`. Owned by Tasks 3 and 4.
3. **A long or multi-line summary in a preview.** `og:description` is whitespace-collapsed and cut to 200 characters with "…". Owned by Task 4.
4. **A double-tap on Share.** Two `POST …/share` sent together give the same URL and one row. Owned by Task 1.
5. **The member who shared it leaves the household.** The link keeps working, and the admin list shows no name for them. Owned by Task 1.

---

### Task 1: The share record and the household's share routes

**Files:**
- Create: `apps/server/src/database/entities/recipe_shares.ts`
- Modify: `apps/server/src/database/entities/index.ts` (export and register `RecipeShare`)
- Modify: `apps/server/src/database/entities/households.ts` (`HouseholdSettings.sharing?: { recipes: boolean }`)
- Create: `apps/server/src/services/recipes/sharing/shares.ts`
- Create: `apps/server/src/http/schemas/sharing.ts`
- Create: `apps/server/src/http/routes/recipes/[recipe]/share/{index,get,post,delete}.ts`
- Modify: `apps/server/src/http/routes/recipes/[recipe]/index.ts` (register `share`)
- Create: migrations through `pnpm --filter @merran/server db:migration recipe-shares`
- Test: `apps/server/src/http/routes/recipes/[recipe]/share/share.test.ts`

**Interfaces:**
- Produces, entity `RecipeShare` (table `recipe_shares`, `filters: householdFilter`):
  - `id: id()`, `household: householdRef()`
  - `recipe`: many-to-one `Recipe`, `.unique()`, delete rule cascade
  - `token: p.string().unique()`
  - `createdBy`: many-to-one `User`, nullable, delete rule set null
  - `createdAt: createdAt()`, `openedAt: p.datetime().nullable()`
- Produces, in `services/recipes/sharing/shares.ts`:
  - `recipeSharingOn(settings: HouseholdSettings | null | undefined): boolean`
  - `shareOf(em: EntityManager, idOrSlug: string): Promise<RecipeShare | null>`: uses `findRecipe`, so a missing or deleted recipe throws `recipe_not_found`.
  - `shareRecipe(em: EntityManager, householdId: string, userId: string, idOrSlug: string): Promise<RecipeShare>`: returns the existing share or makes one. Throws `AppError("forbidden", "sharing_off", "Your household has turned off sharing recipes by link.")` when off. Catches a unique-constraint violation from a racing request and returns the row that won.
  - `stopSharing(em: EntityManager, idOrSlug: string): Promise<void>`: deletes the row if any.
  - `shareUrl(publicUrl: string, token: string): string` returns `${publicUrl}/r/${token}`.
- Produces, in `http/schemas/sharing.ts`: `RecipeShareSchema = z.object({ url: z.string(), createdAt: z.string() }).openapi("RecipeShare")`.
- Routes: `GET`, `POST` and `DELETE /recipes/{recipe}/share`, all `...openToKeys("recipes", "read")`, using `RecipeParam`.
  - `GET` → `200 { share: RecipeShareSchema | null }`
  - `POST` → `200 RecipeShareSchema`, or 400 `share_public_url`, or 403 `sharing_off`
  - `DELETE` → `204`

- [ ] **Step 1: Write the failing tests** in `share.test.ts`. Use `createTestApp({ publicUrl: "http://merran.test" })` (check how `publicUrl` reaches `config.publicUrl` in `test/app.ts`), `setUpServer`, and a member through `join(app, await inviteToken(owner), account("share_member"))`. Create a recipe with `owner.post("/api/recipes", …)` as `recipes.test.ts` does.
  - `"a member shares a recipe and gets the same link again"`: `POST` gives 200 with `url` matching `/^http:\/\/merran\.test\/r\/[A-Za-z0-9_-]{43}$/`, a second `POST` gives the same `url`, and `GET` returns `{ share: { url, createdAt } }`.
  - `"a double-tap makes one link"`: `Promise.all` of two `POST`s gives two equal `url`s.
  - `"stop sharing, then sharing again, makes a new link"`: `DELETE` gives 204, `GET` gives `{ share: null }`, and a new `POST` gives a different `url`.
  - `"another household can't share or see this recipe's link"`: `owner.post("/api/households", { name: "Other" })`, switch to it as `mcp.test.ts` does, then `GET` and `POST` by the original slug give 404.
  - `"sharing is refused while the household has it off"`: set `settings.sharing.recipes = false` directly through the test app's ORM (the household `PATCH` arrives in Task 2), then `POST` gives 403 with code `sharing_off`.
  - `"without a public URL, sharing explains why"`: a second `createTestApp()` without `publicUrl`, then `POST` gives 400 with code `share_public_url`.
  - `"a share outlives the member who made it"`: the member shares, the owner removes the member (`DELETE /api/households/current/members/{memberId}`), and `owner.get(…/share)` still returns the same `url`.
- [ ] **Step 2: Run them and watch them fail.** `pnpm --filter @merran/server test -- "routes/recipes/\[recipe\]/share"`. Expected: FAIL with 404s, because the routes don't exist yet.
- [ ] **Step 3: Write the entity, the settings type, the service and the three routes** as the Interfaces block says. Copy the calendar link routes' style (`plan/calendar/links/post.ts`) for the public-URL check and the error.
- [ ] **Step 4: Make the migrations.** `pnpm --filter @merran/server db:migration recipe-shares`. Read both files. The SQLite one must keep the unique indexes on `recipe_id` and `token` and both foreign keys' delete rules.
- [ ] **Step 5: Run the tests again.** Same command. Expected: PASS. Then `pnpm --filter @merran/server test -- migrations` passes.
- [ ] **Step 6: Commit:** "Let a household share a recipe by link".

### Task 2: The household switch and the admin list

**Files:**
- Modify: `apps/server/src/http/schemas/households.ts` (`HouseholdSchema` and `HouseholdChangesSchema` gain `recipeSharing: z.boolean()`, described like `putAwayWhenChecked`; the household description function sets `recipeSharing: recipeSharingOn(household.settings)`)
- Modify: `apps/server/src/http/routes/households/current/patch.ts` (saves `settings.sharing = { recipes }`)
- Create: `apps/server/src/http/routes/households/current/shares/{index,get}.ts`
- Modify: `apps/server/src/http/routes/households/current/index.ts`
- Modify: `apps/server/src/http/schemas/sharing.ts` (`HouseholdShareSchema`)
- Test: `apps/server/src/http/routes/households/current/shares/shares.test.ts`

**Interfaces:**
- Consumes: `recipeSharingOn`, `shareUrl` and `RecipeShare` from Task 1.
- Produces: `listShares(em: EntityManager, publicUrl: string): Promise<HouseholdShare[]>` in `shares.ts`, newest first.
- Produces: `HouseholdShareSchema = { recipe: { slug, name }, url, sharedBy: { name } | null, createdAt, openedAt: string | null }`.
- Produces: `GET /households/current/shares` behind `asHouseholdAdmin(c)`, returning `200 { shares: HouseholdShare[] }`.

- [ ] **Step 1: Write the failing tests.**
  - `"an admin turns sharing off and on, and links pause rather than end"`: the owner shares a recipe. Then `PATCH /api/households/current { recipeSharing: false }` gives `recipeSharing: false`. Then `PATCH { recipeSharing: true }`, and `GET …/share` still has the same `url`. (Task 3 checks that the public route answers 404 while sharing is off.)
  - `"members can't change the switch or read the list"`: a member's `PATCH { recipeSharing: false }` gives 403, and their `GET /api/households/current/shares` gives 403.
  - `"the admin list says who shared what"`: the member shares one recipe and the owner another. The list has two entries with `sharedBy.name`, newest first, and `openedAt: null`.
- [ ] **Step 2: Run them and watch them fail.** `pnpm --filter @merran/server test -- households/current/shares`. Expected: FAIL.
- [ ] **Step 3: Implement** the schema field, the `PATCH` save, `listShares` and the route.
- [ ] **Step 4: Run them again.** Expected: PASS. Also run `pnpm --filter @merran/server test -- households` to make sure the existing household tests still pass with the new field.
- [ ] **Step 5: Commit:** "Let household admins pause sharing and see what's shared".

### Task 3: The public shared recipe and its photo

**Files:**
- Create: `apps/server/src/services/recipes/sharing/shared-recipe.ts`
- Modify: `apps/server/src/services/recipes/sharing/shares.ts` (`sharedForToken`)
- Modify: `apps/server/src/http/schemas/sharing.ts` (`SharedRecipeSchema`)
- Create: `apps/server/src/http/routes/shared/index.ts`, `shared/[token]/{index,get}.ts`, `shared/[token]/photo/{index,get}.ts`
- Modify: `apps/server/src/http/routes/index.ts` (register `shared`)
- Test: `apps/server/src/http/routes/shared/shared.test.ts`

**Interfaces:**
- Produces: `sharedForToken(em: EntityManager, token: string): Promise<{ recipe: Recipe; household: Household; token: string } | null>`. It:
  - checks the token's shape
  - finds the share across households (`ACROSS_HOUSEHOLDS`)
  - requires `recipeSharingOn(household.settings)`
  - loads the recipe with `findRecipe(forHousehold(em, household.id), recipe.id)`, so a deleted recipe gives null
  - sets `openedAt = now` when it's null or more than an hour old
- Produces: `describeShared(recipe: Recipe, householdName: string, token: string): SharedRecipe` in `shared-recipe.ts`. Each field is set by hand, never spread from `describeRecipe`:
  - `name`, `description`, `servings`, `yieldText`, `prepMinutes`, `cookMinutes`, `totalMinutes`, `diets`, `nutrition`, `sourceUrl`
  - `photo: { full, card } | null`, as `/api/shared/${token}/photo?size=…&v=${recipe.image}`
  - `ingredients: { id, section, text, quantity, quantityMax, unit, food, note }[]` and `steps: { id, section, text }[]`. The `id`s are positional (`i1`, `i2`… and `s1`, `s2`…), never database ids.
  - `household: { name }`
- Produces: `SharedRecipeSchema` (`.openapi("SharedRecipe")`) matching exactly those keys.
- Routes:
  - `GET /shared/{token}` (`operationId: "getSharedRecipe"`, `tags: ["Sharing"]`)
  - `GET /shared/{token}/photo` with `size` and `v` as the recipe photo route has them. It streams through `readPhoto(files, household.id, recipe.image, size)` with `Cache-Control: public, max-age=31536000, immutable` when `v` matches, or `no-store` otherwise.

- [ ] **Step 1: Write the failing tests.**
  - `"anyone with the link reads the recipe, signed out"`: a plain `fetch(app, …)` with no cookie (see how `TestClient` calls the app) gives 200, `Cache-Control: no-store` and `Referrer-Policy: no-referrer`.
  - `"only the allowed fields are shared"`: `expect(Object.keys(body).sort()).toEqual([...ALLOWED].sort())` for the top level, each ingredient and each step. Also `JSON.stringify(body)` contains neither the recipe's database id nor its slug, nor any of the cook note, rating or tag text set up for the test.
  - `"a link fails the same way however it fails"`: an unknown well-formed token, a malformed token, after stop sharing, with sharing off, and with the recipe in Recently deleted. All give 404 with an identical body.
  - `"a restored recipe is shared again"`: delete, then restore (the deleted-recipes route `recipes.test.ts` uses), and the same token gives 200.
  - `"being signed in changes nothing"`: the owner's `TestClient`, and a request with another household's API key, both get a body deep-equal to the signed-out one.
  - `"the photo route only serves this link's recipe"`: with a photo set as `photo.test.ts` does, `/photo` gives 200 `image/webp`. Recipe B's token can't fetch recipe A's photo (there's no parameter for it, so check that two tokens give different bytes when the photos differ). A recipe without a photo gives `photo: null` and a 404 from `/photo`.
  - `"opening a link notes when, at most hourly"`: the first `GET` sets `openedAt`, and a second `GET` straight after doesn't change it.
  - `"too many reads are slowed"`: 121 `GET`s give a final 429 with a `Retry-After` header.
- [ ] **Step 2: Run them and watch them fail.** `pnpm --filter @merran/server test -- routes/shared`. Expected: FAIL.
- [ ] **Step 3: Implement** `sharedForToken`, `describeShared`, the schema and both routes. Copy the calendar feed's headers and rate limit (`plan/calendar/feed/[token]/get.ts`).
- [ ] **Step 4: Run them again.** Expected: PASS.
- [ ] **Step 5: Run every server test on both databases.** `pnpm --filter @merran/server db:test-postgres`, then `pnpm --filter @merran/server test:all`. Expected: PASS. The route-layout test must pass with the new folders.
- [ ] **Step 6: Commit:** "Show a shared recipe to anyone with its link".

### Task 4: Link previews and recipe data in the page's head

**Files:**
- Create: `apps/server/src/services/recipes/sharing/page-head.ts`
- Modify: `apps/server/src/http/web-app.ts` (`serveWebApp(app, dir, logger, publicUrl: string | null)`. The `app.get("*")` handler fills the head for `/r/{token}` and `/r/{token}/cook`.)
- Modify: `apps/server/src/app.ts` (pass `deps.config.publicUrl ?? null`)
- Test: `apps/server/src/services/recipes/sharing/page-head.test.ts`, and `apps/server/src/http/web-app.test.ts` (create it if there isn't one)

**Interfaces:**
- Consumes: `sharedForToken`, `describeShared` and `SharedRecipe` from Task 3.
- Produces, in `page-head.ts`:
  - `previewDescription(shared: SharedRecipe): string`: the summary with whitespace collapsed, cut to 200 characters with "…", or `A recipe from ${household.name}`.
  - `recipeJsonLd(shared: SharedRecipe, pageUrl: string, base: string): Record<string, unknown>`: schema.org `Recipe` with `name`, `description`, `image` (absolute full photo URL), `recipeYield`, `prepTime`, `cookTime` and `totalTime` (ISO 8601 `PT#H#M`), `recipeIngredient` (lines' `text`), `recipeInstructions` (`HowToStep`, with `HowToSection` where steps have sections), `nutrition` (`NutritionInformation`), `author: { "@type": "Organization", name: household.name }`, and `url`.
  - `sharedPageHead(shared: SharedRecipe, pageUrl: string, base: string): string`: the `<title>`, `og:title`, `og:description`, `og:image` (only with a photo), `og:url`, `og:type` = `article`, `twitter:card` (`summary_large_image` with a photo, `summary` without), `<meta name="robots" content="noindex">`, and the JSON-LD `<script>`. Attribute text is HTML-escaped. The JSON's `<` is written as `<`.
  - `withHead(index: string, head: string): string`: replaces the index's `<title>…</title>` with `head`.
- When `publicUrl` is null, or the token doesn't resolve, the page is served unchanged with no recipe data.

- [ ] **Step 1: Write the failing tests** in `page-head.test.ts`:
  - `"the JSON-LD imports back through Merran's own importer"`: `readRecipeData(withHead(INDEX, sharedPageHead(shared, url, base)), url)` gives the same name, the ingredient lines' text in order, the steps' text in order, and yields and times that match.
  - `"hostile text can't break out of the head"`: a name of `</script><script>alert(1)</script>` and a summary containing `"` and `<`. The result has exactly one `</script>` after the JSON-LD opening, and `og:title`'s attribute value parses back to the original text through cheerio.
  - `"long summaries are cut for previews"`: 500 characters with newlines give at most 200 characters, ending in "…", with no newline.
  - `"no photo means a small card and no image"`.
- [ ] **Step 2: Write the failing integration test** in `web-app.test.ts`: `createTestApp` with `webDir` pointed at a temporary folder holding a minimal `index.html` (add a `webDir` option to `createTestApp` if there isn't one). Then:
  - `GET /r/{token}` has `og:title` set to the recipe's name.
  - `GET /r/{unknown token}` is the unchanged `index.html`.
  - `GET /recipes/x` is unchanged.
- [ ] **Step 3: Run them and watch them fail.** `pnpm --filter @merran/server test -- page-head web-app`. Expected: FAIL.
- [ ] **Step 4: Implement** `page-head.ts` and the `web-app.ts` change. Match the path with `/^\/r\/([A-Za-z0-9_-]{43})(\/cook)?$/`. Use `c.var.em` (set for every request by `entityManager`). Keep `Cache-Control: no-cache`.
- [ ] **Step 5: Run them again.** Expected: PASS.
- [ ] **Step 6: Commit:** "Give shared recipe links a preview and recipe data".

### Task 5: The API's schemas for the apps

**Files:**
- Modify: `apps/server/openapi.json`, `apps/web/src/lib/api/schema.d.ts`, `apps/extension/…/schema.d.ts` (all generated)
- Modify: `apps/docs/src/content/docs/docs/api/index.md` (a line beside the calendar feed: the `shared` routes are the second exception that needs no sign-in, and their link is the secret)

- [ ] **Step 1: Regenerate.** `pnpm --filter @merran/server openapi`, then the web and extension `api` scripts (in PowerShell; see Global Constraints).
- [ ] **Step 2: Check.** The two `schema.d.ts` files match each other, and `pnpm typecheck` passes.
- [ ] **Step 3: Commit:** "Regenerate the API schemas for recipe sharing".

### Task 6: Sharing from the app

**Files:**
- Create: `apps/web/src/features/sharing/offer-link.ts`, `offer-link.test.ts`
- Create: `apps/web/src/features/sharing/queries.ts`
- Create: `apps/web/src/features/sharing/share-dialog.tsx`, `share-button.tsx`
- Create: `apps/web/src/features/household/sharing-card.tsx`
- Modify: `apps/web/src/routes/_app/recipes/$slug/index.tsx` (the Share button in the `page-actions` row, and a **Shared** badge by the title)
- Modify: `apps/web/src/features/recipes/recipe-menu.tsx` (a **Share** item that opens `ShareDialog`)
- Modify: `apps/web/src/routes/_app/settings/household.tsx` (a "sharing" section holding `SharingCard`, for `canManage`)
- Modify: `apps/web/src/locales/en.json` (`sharing.*`)
- Modify: `apps/web/package.json` (add `src/features/sharing/offer-link.test.ts` to `test`)

**Interfaces:**
- Consumes: `GET`, `POST` and `DELETE /api/recipes/{recipe}/share`, `GET /api/households/current/shares`, and `recipeSharing` on the household, through the regenerated `api` client.
- Produces:
  - `offerLink(link: { title: string; text: string; url: string }, nav?: Pick<Navigator, "share" | "clipboard">): Promise<"shared" | "copied" | "cancelled">`: uses `nav.share` when it's there. An `AbortError` gives `"cancelled"`. Otherwise it falls back to `nav.clipboard.writeText(url)` and gives `"copied"`.
  - `recipeShareQuery(slug: string)`, `useShareRecipe(slug)` (`POST`, which updates `recipeShareQuery`'s cache), `useStopSharing(slug)`, and `householdSharesQuery`.
  - `ShareButton({ recipe }: { recipe: Pick<Recipe, "slug" | "name"> })`: not shown when the household has `recipeSharing: false`.
  - `ShareDialog({ recipe, open, onOpenChange })`.
- Behaviour:
  - When there's no link yet, the first tap `await`s `POST` and then calls `offerLink`. If Safari refuses the share sheet there (a `NotAllowedError`), open `ShareDialog` instead, whose **Share…** button calls `offerLink` from a fresh tap.
  - When a link exists, tapping Share opens `ShareDialog`.
  - `"copied"` shows a **Link copied** toast. `"cancelled"` does nothing.
  - **Stop sharing** confirms through `confirm-dialog.tsx`.
  - A 400 `share_public_url` shows the server's message in a toast.

- [ ] **Step 1: Write the failing node test** in `offer-link.test.ts`:
  - with `share` present, it's called with `{ title, text, url }` and gives `"shared"`
  - `share` rejecting with `new DOMException("", "AbortError")` gives `"cancelled"` and doesn't touch the clipboard
  - with no `share`, it writes the URL to the clipboard and gives `"copied"`
- [ ] **Step 2: Run it and watch it fail.** `pnpm --filter @merran/web test`. Expected: FAIL (the module doesn't exist).
- [ ] **Step 3: Implement** `offer-link.ts`. Run the test again. Expected: PASS.
- [ ] **Step 4: Build the queries, `ShareButton`, `ShareDialog`, the menu item, the badge and `SharingCard`.** `SharingCard` has a `Switch` for **Let members share recipes by link** (saved through the household `PATCH`, as `PantryCard` saves `putAwayWhenChecked`) and the list of shares, each with **Stop sharing**. Every label goes in `en.json`.
- [ ] **Step 5: Check.** `pnpm typecheck`, `pnpm format:check`, `pnpm --filter @merran/web test`, and `pnpm --filter @merran/web check:contrast` if any colors were added.
- [ ] **Step 6: Try it** on the dev server (see the `run` skill; use the Claude admin account in "The Johnsons" on 127.0.0.1:5173). On desktop Chrome, Share copies the link and shows **Link copied**. The dialog, Stop sharing, the badge and the settings card all work. At phone width, the dialog opens as a drawer.
- [ ] **Step 7: Commit:** "Share a recipe from its page, its menu and settings".

### Task 7: The guest recipe page and guest cooking

**Files:**
- Create: `apps/web/src/routes/r/$token/index.tsx`, `apps/web/src/routes/r/$token/cook.tsx` (top level, outside `_app` and `_focus`, so they don't need sign-in)
- Create: `apps/web/src/features/sharing/shared-recipe-query.ts`, `guest-recipe.ts`, `guest-recipe.test.ts`, `shared-page.tsx`, `shared-unavailable.tsx`
- Modify: `apps/web/src/features/cook/cook-view.tsx` (`guest?: { token: string }`)
- Modify: `apps/web/src/features/recipes/use-tastes.ts` and `features/cook/server-voice.ts`, only as far as letting `CookView` turn their queries off
- Modify: `apps/web/src/locales/en.json`, and `apps/web/package.json` (add `guest-recipe.test.ts`)

**Interfaces:**
- Consumes: `GET /api/shared/{token}` (`SharedRecipe`).
- Produces:
  - `sharedRecipeQuery(token: string)`, which treats a 404 as `null` rather than an error.
  - `asGuestRecipe(shared: SharedRecipe): Recipe`: fills every `Recipe` field the shared data doesn't have with its empty value (`null`, `[]`, `false`), so `IngredientList`, `StepList`, `useServings` and `CookView` take it unchanged. `slug` is set to the token.
- `CookView` with `guest`:
  - no stand-ins or swaps
  - no tastes query, no capability query and no server voice
  - no servings save, no plan entry, no **Made it** and no After cooking
  - no `LastCookNote`
  - finishing goes to `/r/$token`
  - progress is kept under `shared:${token}`
  - the browser's own speech still works
- The page: a plain header with Merran's mark and **Shared by {{household}}**, then the photo, title, summary and times, then `ServingsStepper`, `UnitToggle`, `IngredientList`, `StepList`, the nutrition section (if it renders from data alone), then **Start cooking**, and a footer with **Made with Merran** (linking to https://merran.app) and the recipe-app hint. A `null` query shows `SharedUnavailable`: **This recipe isn't shared anymore**.

- [ ] **Step 1: Write the failing node test** in `guest-recipe.test.ts`: `asGuestRecipe` on a fixture `SharedRecipe` keeps the ingredients' and steps' order and text, sets `slug` to the token, and leaves `rating`, `tags` and `needs` empty.
- [ ] **Step 2: Run it and watch it fail.** `pnpm --filter @merran/web test`. Expected: FAIL.
- [ ] **Step 3: Implement** `asGuestRecipe` and the query. Run the test again. Expected: PASS.
- [ ] **Step 4: Build both routes**, the page, the unavailable screen, and `CookView`'s `guest` mode as above. Hooks stay unconditional; turn their queries off with `enabled: !guest`.
- [ ] **Step 5: Check.** `pnpm typecheck`, `pnpm format:check`, `pnpm --filter @merran/web test`.
- [ ] **Step 6: Try it signed out** in a private window on the dev server:
  - The shared link shows the recipe. Scaling and US/metric work. **Start cooking** steps through with timers.
  - In the network panel, every request under `/api/` goes to `/api/shared/…`, and nothing redirects to `/login`.
  - A stopped link shows **This recipe isn't shared anymore**.
- [ ] **Step 7: Commit:** "Let anyone with a shared link read and cook the recipe".

### Task 8: Guides, feature list and the hand checks

**Files:**
- Create: `apps/docs/src/content/docs/docs/use/sharing-recipes.md` (quotes the `en.json` labels exactly; covers sharing, the share sheet versus copying, what people who get it can and can't do, stopping, the admin switch and list, and needing `MERRAN_PUBLIC_URL`)
- Modify: `apps/docs/src/content/docs/docs/use/recipes.md` and `cooking.md` (link to it), and the docs sidebar config if guides are listed by hand
- Modify: `docs/features.md` (the row moves to **Built**)
- Modify: `docs/recipe-sharing.md` ("Stop sharing deletes the share", in place of `revoked at`; implemented date)
- Check: `apps/docs/src/components/landing/` still says nothing untrue about sharing

- [ ] **Step 1: Write the guide and make the doc changes.**
- [ ] **Step 2: Check.** `pnpm docs:build` passes with every link checked.
- [ ] **Step 3: The hand checks from the spec**, with the dev server reachable from a phone (a `MERRAN_PUBLIC_URL` the phone can open):
  - the share sheet on an iPhone and an Android phone, in the browser and the installed app (watch the first share on the iPhone, where Task 6's fallback is)
  - previews in Messages, Mail, WhatsApp and Slack
  - Import from a link into a second household
  - cooking from the shared page with the screen kept awake
  Record what each client did in the spec's "Tests" section.
- [ ] **Step 4: Run all the checks CI runs.** `pnpm typecheck`, `pnpm format:check`, `pnpm --filter @merran/server test:all`, `pnpm --filter @merran/web test`, and `pnpm --filter @merran/extension build`.
- [ ] **Step 5: Commit:** "Document sharing recipes by link".
