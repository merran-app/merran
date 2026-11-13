import { z } from "@hono/zod-openapi"
import type { WebhookEventType } from "@merran/shared"
import { IDS, TIMES } from "../../http/schemas/examples.ts"
import { ACTOR_VIAS } from "./actor.ts"
import { linkBase } from "./state.ts"

// What each event carries, as the schemas the API reference describes them
// with. Events carry ids, names, titles and links, never whole recipes, so
// a leaked delivery log reveals little; a receiver fetches more through the
// API with its own key (docs/webhooks.md).

/** The parts of a recipe an edit can change, for `recipe.updated`. */
export const RECIPE_PARTS = [
  "details",
  "ingredients",
  "steps",
  "tags",
  "photo",
  "diets",
] as const
export type RecipePart = (typeof RECIPE_PARTS)[number]

/**
 * How a recipe was added. Pages, the extension and shares arrive as `link`;
 * imports of other apps and archives don't send `recipe.created`.
 */
const CREATED_ORIGINS = [
  "manual",
  "link",
  "video",
  "text",
  "photo",
  "assistant",
] as const

const RECIPE_EXAMPLE = {
  id: IDS.lemonChicken,
  slug: "lemon-chicken",
  title: "Lemon Chicken",
  url: "https://merran.example.com/recipes/lemon-chicken",
}

/** What every event starts with, in the examples. */
const CONTEXT_EXAMPLE = {
  household: { id: IDS.household, name: "The Riveras" },
  by: { id: IDS.sam, name: "Sam Rivera" },
  via: "app" as const,
  key: null,
}

/** A sample of what each event carries besides, for the API reference. */
const EXAMPLES = {
  "recipe.created": {
    recipe: RECIPE_EXAMPLE,
    origin: "link" as const,
    sourceUrl: "https://example.com/lemon-chicken",
  },
  "recipe.updated": {
    recipe: RECIPE_EXAMPLE,
    parts: ["ingredients", "steps"] satisfies RecipePart[],
  },
  "recipe.deleted": { recipe: RECIPE_EXAMPLE },
  "recipe.restored": { recipe: RECIPE_EXAMPLE },
  "webhook.test": { webhook: { id: IDS.webhook, name: "Home Assistant" } },
}

/** Something with a name, like a household, a person or an API key. */
const named = (example: { id: string; name: string }) =>
  z.object({ id: z.string(), name: z.string() }).openapi({ example })

/** A recipe as events carry it: enough to name it and link to it. */
export const RecipeRefSchema = z
  .object({
    id: z.string(),
    slug: z.string(),
    title: z.string(),
    url: z.string().nullable().openapi({
      description:
        "Its page in Merran. Null when the server has no public address (MERRAN_PUBLIC_URL).",
    }),
  })
  .openapi({ example: RECIPE_EXAMPLE })
export type RecipeRef = z.infer<typeof RecipeRefSchema>

/** The recipe in an event, from the recipe as it's saved. */
export function recipeRef(recipe: {
  id: string
  slug: string
  name: string
}): RecipeRef {
  const base = linkBase()
  return {
    id: recipe.id,
    slug: recipe.slug,
    title: recipe.name,
    url: base ? `${base}/recipes/${recipe.slug}` : null,
  }
}

/** Whose household it happened in, who did it, how, and with which key. */
const EventContextSchema = z.object({
  household: named(CONTEXT_EXAMPLE.household),
  by: named(CONTEXT_EXAMPLE.by).nullable().openapi({
    description:
      "Who did it. Null when Merran did it on its own: a schedule, a timer going off, or work it does in the background, like importing a batch of links.",
  }),
  via: z.enum(ACTOR_VIAS).openapi({
    description:
      "How it was done: `app` by someone signed in, `api` with an API key or OAuth connection on the REST API, `mcp` by an AI app through /mcp, or `merran` by Merran on its own.",
  }),
  key: named({ id: IDS.apiKey, name: "Home Assistant" }).nullable().openapi({
    description:
      "The API key or OAuth connection used, for `api` and `mcp`. Null otherwise.",
  }),
})

/** What each event carries besides who did it. */
export const WEBHOOK_PAYLOADS = {
  "recipe.created": z
    .object({
      recipe: RecipeRefSchema,
      origin: z.enum(CREATED_ORIGINS).openapi({
        description:
          "How it was added. Pages, the extension and shares arrive as `link`.",
      }),
      sourceUrl: z.string().nullable().openapi({
        description: "The link it came from, if it came from one.",
      }),
    })
    .openapi({ example: EXAMPLES["recipe.created"] }),
  "recipe.updated": z
    .object({
      recipe: RecipeRefSchema,
      parts: z.array(z.enum(RECIPE_PARTS)).min(1).openapi({
        description: "Which parts of the recipe changed.",
      }),
    })
    .openapi({ example: EXAMPLES["recipe.updated"] }),
  "recipe.deleted": z
    .object({ recipe: RecipeRefSchema })
    .openapi({ example: EXAMPLES["recipe.deleted"] }),
  "recipe.restored": z
    .object({ recipe: RecipeRefSchema })
    .openapi({ example: EXAMPLES["recipe.restored"] }),
  "webhook.test": z
    .object({ webhook: named(EXAMPLES["webhook.test"].webhook) })
    .openapi({ example: EXAMPLES["webhook.test"] }),
} satisfies Record<WebhookEventType, z.ZodObject>

/** What an event of type `T` carries besides who did it. */
export type EventData<T extends WebhookEventType> = z.infer<
  (typeof WEBHOOK_PAYLOADS)[T]
>

/** The fields of an event of type `T`, kept apart from the other events'. */
type PayloadShape<T extends WebhookEventType> =
  (typeof WEBHOOK_PAYLOADS)[T]["shape"]

/** The body a delivery of an event of `type` sends. */
export function webhookEnvelopeSchema<T extends WebhookEventType>(type: T) {
  const example = { ...CONTEXT_EXAMPLE, ...EXAMPLES[type] }
  const shape: PayloadShape<T> = WEBHOOK_PAYLOADS[type].shape
  const data = EventContextSchema.extend(shape).openapi({ example })
  return z
    .object({
      type: z.literal(type),
      timestamp: z.string().openapi({
        description:
          "When it happened, which isn't always when it's sent: deliveries can arrive out of order.",
      }),
      data,
    })
    .openapi({ example: { type, timestamp: TIMES.now, data: example } })
}

/** Each event's line and description in the API reference. */
export const WEBHOOK_SUMMARIES: Record<
  WebhookEventType,
  { summary: string; description: string }
> = {
  "recipe.created": {
    summary: "A recipe was added",
    description:
      "Sent when a recipe is added: typed in, imported from a link, a page, text, photos or a video, sent from the extension or a share, or applied from a proposal. Links imported many at once send one each, but recipes brought in from another app or a Merran archive don't send it.",
  },
  "recipe.updated": {
    summary: "A recipe was changed",
    description:
      "Sent when someone saves edits to a recipe, applies a tidy-up or proposal, saves a swap, restores a version, or changes its photo, diets or what can be left out, saying which parts changed. Nothing is sent when nothing changed, and stars, cooking notes, tags changed on many recipes at once, renamed tags and background nutrition, photo and food-matching runs don't send it.",
  },
  "recipe.deleted": {
    summary: "A recipe was deleted",
    description:
      "Sent when a recipe goes to Recently deleted. Deleting it for good from there sends nothing more.",
  },
  "recipe.restored": {
    summary: "A recipe was restored",
    description: "Sent when a recipe comes back from Recently deleted.",
  },
  "webhook.test": {
    summary: "A test was sent",
    description:
      "Sent only when someone chooses Send a test for a webhook, and only to that webhook, even when it's paused. It's tried once, never retried, and never pauses the webhook.",
  },
}
