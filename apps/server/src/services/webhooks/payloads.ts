import { z } from "@hono/zod-openapi"
import { MEALS, type WebhookEventType } from "@merran/shared"
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

/** The stores a list can be sent to. */
export const STORES = ["kroger", "walmart"] as const

/** What kinds of import send `import.finished`. */
const IMPORT_KINDS = ["links", "collection", "app", "archive"] as const

/** The apps Merran imports from, for an `app` import. */
const IMPORT_APPS = ["mealie", "paprika"] as const

/** Where a thing waiting in Review came from. */
const REVIEW_SOURCES = ["mcp", "cook_note"] as const

const RECIPE_EXAMPLE = {
  id: IDS.lemonChicken,
  slug: "lemon-chicken",
  title: "Lemon Chicken",
  url: "https://merran.example.com/recipes/lemon-chicken",
}

const SIDE_EXAMPLE = {
  id: IDS.garlicRice,
  slug: "garlic-rice",
  title: "Garlic Rice",
  url: "https://merran.example.com/recipes/garlic-rice",
}

const MEAL_EXAMPLE = {
  entryId: IDS.planEntry,
  date: "2026-10-15",
  meal: "dinner" as const,
  pool: false,
  title: "Lemon Chicken",
  recipe: RECIPE_EXAMPLE,
  side: SIDE_EXAMPLE,
}

/** What every event starts with, in the examples: Sam, in the app. */
const CONTEXT_EXAMPLE = {
  household: { id: IDS.household, name: "The Riveras" },
  by: { id: IDS.sam, name: "Sam Rivera" },
  via: "app" as const,
  key: null,
}

/** The same, for work Merran finishes on its own, in the background. */
const MERRAN_CONTEXT_EXAMPLE = {
  household: CONTEXT_EXAMPLE.household,
  by: null,
  via: "merran" as const,
  key: null,
}

/**
 * Who did it in each event's example, as its guide says: the events that
 * finish in the background are Merran's own work. A cooking note turned
 * into an edit is too, which is `review.waiting`'s example.
 */
function contextExample(type: WebhookEventType) {
  switch (type) {
    case "import.finished":
    case "tidy.ready":
    case "review.waiting":
      return MERRAN_CONTEXT_EXAMPLE
    default:
      return CONTEXT_EXAMPLE
  }
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
  "import.finished": {
    import: { id: IDS.job },
    kind: "links" as const,
    app: null,
    added: 11,
    skipped: 1,
    failed: 0,
    url: `https://merran.example.com/recipes/import/${IDS.job}`,
  },
  "tidy.ready": {
    count: 12,
    recipes: [RECIPE_EXAMPLE, SIDE_EXAMPLE],
    url: "https://merran.example.com/recipes/review",
  },
  "review.waiting": {
    source: "cook_note" as const,
    count: 1,
    recipe: RECIPE_EXAMPLE,
    url: "https://merran.example.com/recipes/review",
  },
  "plan.changed": {
    days: ["2026-10-15", "2026-10-16"],
    pools: ["2026-10-11"],
    added: 2,
    moved: 1,
    changed: 0,
    removed: 0,
  },
  "plan.autoplanned": {
    week: "2026-10-18",
    meals: 5,
    url: "https://merran.example.com/plan?week=2026-10-18",
  },
  "meal.cooked": { ...MEAL_EXAMPLE, servings: 4, planned: true },
  "meal.skipped": MEAL_EXAMPLE,
  "list.changed": {
    lists: [{ id: IDS.shoppingList, name: "Groceries", left: 8, checked: 14 }],
    added: 0,
    checked: 14,
    unchecked: 0,
    changed: 0,
    removed: 0,
  },
  "list.completed": {
    list: { id: IDS.costcoList, name: "Costco" },
    bought: 9,
    left: 0,
  },
  "list.sent": {
    store: { id: "kroger" as const, name: "Kroger" },
    sent: 23,
    notFound: 2,
  },
  "pantry.changed": {
    added: 6,
    usedUp: 2,
    moved: 0,
    changed: 1,
    removed: 0,
  },
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

/** A whole number of things, for the counts events carry. */
const count = (description: string) =>
  z.number().int().min(0).openapi({ description })

/** Where something is in Merran, or null without MERRAN_PUBLIC_URL. */
export function appLink(path: string): string | null {
  const base = linkBase()
  return base ? `${base}${path}` : null
}

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

/** A planned meal as events carry it: when, which meal, and what's on it. */
export const MealRefSchema = z.object({
  entryId: z.string().openapi({ description: "The meal's entry in the plan." }),
  date: z.string().openapi({
    description:
      "Its day, as YYYY-MM-DD. For a meal in the week's pool, the first day of that week.",
  }),
  meal: z.enum(MEALS),
  pool: z.boolean().openapi({
    description:
      "Whether it's in the week's pool, waiting for a day, rather than planned for one.",
  }),
  title: z.string().openapi({
    description:
      "The recipe's name, or the note for a meal that's only a note.",
  }),
  recipe: RecipeRefSchema.nullable().openapi({
    description: "The recipe. Null for a meal that's only a note.",
  }),
  side: RecipeRefSchema.nullable().openapi({
    description: "The side dish, if it has one.",
  }),
})
export type MealRef = z.infer<typeof MealRefSchema>

/** A shopping list and how far along it is. */
export const ListTallySchema = z.object({
  id: z.string(),
  name: z.string(),
  left: count("How many things on it aren't checked off."),
  checked: count("How many things on it are checked off."),
})
export type ListTally = z.infer<typeof ListTallySchema>

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
  "import.finished": z
    .object({
      import: z
        .object({ id: z.string() })
        .openapi({ description: "The import, which is a job in Jobs." }),
      kind: z.enum(IMPORT_KINDS).openapi({
        description:
          "What was imported: a batch of `links`, a `collection`, another `app`'s files, or a Merran `archive`.",
      }),
      app: z.enum(IMPORT_APPS).nullable().openapi({
        description:
          "Which app the files came from, for `app`. Null otherwise.",
      }),
      added: count("How many recipes were added."),
      skipped: count("How many were skipped, like ones already in Merran."),
      failed: count(
        "How many couldn't be imported. Always 0 for an archive, where one that fails stops the whole import."
      ),
      url: z.string().nullable().openapi({
        description:
          "Where to see the import in Merran. Null when the server has no public address (MERRAN_PUBLIC_URL).",
      }),
    })
    .openapi({ example: EXAMPLES["import.finished"] }),
  "tidy.ready": z
    .object({
      count: z.number().int().min(1).openapi({
        description: "How many recipes have suggestions waiting.",
      }),
      recipes: z.array(RecipeRefSchema).max(10).openapi({
        description:
          "Up to 10 of those recipes. `count` says how many there are in all.",
      }),
      url: z.string().nullable().openapi({
        description:
          "Review in Merran. Null when the server has no public address (MERRAN_PUBLIC_URL).",
      }),
    })
    .openapi({ example: EXAMPLES["tidy.ready"] }),
  "review.waiting": z
    .object({
      source: z.enum(REVIEW_SOURCES).openapi({
        description:
          "Where it came from: an AI app's proposal over `mcp`, or a `cook_note` turned into an edit.",
      }),
      count: z.number().int().min(1).openapi({
        description: "How many things are waiting from this.",
      }),
      recipe: RecipeRefSchema.nullable().openapi({
        description: "The recipe it's about, if there is one.",
      }),
      url: z.string().nullable().openapi({
        description:
          "Review in Merran. Null when the server has no public address (MERRAN_PUBLIC_URL).",
      }),
    })
    .openapi({ example: EXAMPLES["review.waiting"] }),
  "plan.changed": z
    .object({
      days: z.array(z.string()).openapi({
        description: "The days touched, as YYYY-MM-DD, earliest first.",
      }),
      pools: z.array(z.string()).openapi({
        description:
          "The weeks whose pool was touched, each by its first day as YYYY-MM-DD.",
      }),
      added: count("How many meals were added."),
      moved: count(
        "How many meals were moved to another day or meal, or had their dishes put in another order."
      ),
      changed: count(
        "How many meals had their recipe, side, note or servings changed."
      ),
      removed: count("How many meals were removed."),
    })
    .openapi({ example: EXAMPLES["plan.changed"] }),
  "plan.autoplanned": z
    .object({
      week: z.string().openapi({
        description: "The week it planned, by its first day as YYYY-MM-DD.",
      }),
      meals: count("How many meals it planned."),
      url: z.string().nullable().openapi({
        description:
          "That week in the plan. Null when the server has no public address (MERRAN_PUBLIC_URL).",
      }),
    })
    .openapi({ example: EXAMPLES["plan.autoplanned"] }),
  "meal.cooked": z
    .object({
      ...MealRefSchema.shape,
      servings: z.number().nullable().openapi({
        description: "How many servings were made, if it was said.",
      }),
      planned: z.boolean().openapi({
        description:
          "Whether the meal was on the plan before it was made, rather than added by making it.",
      }),
    })
    .openapi({ example: EXAMPLES["meal.cooked"] }),
  "meal.skipped": z
    .object(MealRefSchema.shape)
    .openapi({ example: EXAMPLES["meal.skipped"] }),
  "list.changed": z
    .object({
      lists: z.array(ListTallySchema).openapi({
        description: "Each list touched, with how far along it is now.",
      }),
      added: count("How many things were added."),
      checked: count("How many were checked off."),
      unchecked: count("How many were unchecked."),
      changed: count("How many had their name, amount, aisle or list changed."),
      removed: count("How many were removed."),
    })
    .openapi({ example: EXAMPLES["list.changed"] }),
  "list.completed": z
    .object({
      list: named(EXAMPLES["list.completed"].list),
      bought: count("How many things on it were checked off."),
      left: count(
        "How many were still unchecked, when it's put away with things left."
      ),
    })
    .openapi({ example: EXAMPLES["list.completed"] }),
  "list.sent": z
    .object({
      store: z
        .object({ id: z.enum(STORES), name: z.string() })
        .openapi({ example: EXAMPLES["list.sent"].store }),
      sent: count("How many things were sent to the store's cart."),
      notFound: count("How many the store didn't have a product for."),
    })
    .openapi({ example: EXAMPLES["list.sent"] }),
  "pantry.changed": z
    .object({
      added: count("How many things were put away."),
      usedUp: count("How many were used up."),
      moved: count("How many were moved to another place."),
      changed: count(
        "How many had their amount, aisle, name or use-by date changed."
      ),
      removed: count("How many were removed."),
    })
    .openapi({ example: EXAMPLES["pantry.changed"] }),
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
  const example = { ...contextExample(type), ...EXAMPLES[type] }
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
  "import.finished": {
    summary: "An import finished",
    description:
      "Sent when an import runs to its end: a batch of links, a collection, an import from Mealie or Paprika, or a Merran archive. It says what kind it was and how many recipes were added, skipped and failed. An import that fails as a whole or is stopped sends nothing; it shows on its page and in Jobs. Archive imports always report 0 failed, because one recipe that fails fails the whole import. Links in a batch still send `recipe.created` each, but recipes from another app or an archive don't.",
  },
  "tidy.ready": {
    summary: "Tidy up has suggestions",
    description:
      "Sent when Tidy up finishes with suggestions waiting in Review, for one recipe or a run of many, whether it was started by hand or on its own. It counts the recipes and names up to 10 of them. A run that's stopped sends nothing.",
  },
  "review.waiting": {
    summary: "Something is waiting in Review",
    description:
      "Sent when something new waits in Review that didn't come from your own chat: an AI app's proposal over MCP, or a cooking note that became an edit. A cooking note turned into an edit is sent as Merran's own work.",
  },
  "plan.changed": {
    summary: "The plan changed",
    description:
      "Sent when meals are added, moved, changed or removed, whatever did it: someone in the app, the autoplan, a proposal, Repeat last week, Clear, Undo, or Made it. Changes are gathered for 30 seconds and sent as one event for each person, so someone adding a whole week sends one. Marking meals made or Didn't isn't a plan change; those send `meal.cooked` and `meal.skipped`. Undo sends this, but never `meal.cooked` or `meal.skipped` again.",
  },
  "plan.autoplanned": {
    summary: "The autoplan planned a week",
    description:
      "Sent when the autoplan plans a week, on its schedule or when someone runs it. It also sends `plan.changed` for the meals it added.",
  },
  "meal.cooked": {
    summary: "A meal was made",
    description:
      'Sent when a meal is marked made anywhere: cook view, the plan, Today\'s "Did you make these?", or a recipe made off the plan. It says whether the meal was planned and how many servings were made. Undo never sends it again, and setting a meal back to planned sends nothing.',
  },
  "meal.skipped": {
    summary: "A meal was skipped",
    description:
      "Sent when a planned meal is marked Didn't. Undo never sends it again, and setting a meal back to planned sends nothing.",
  },
  "list.changed": {
    summary: "The shopping list changed",
    description:
      "Sent when things on a list are added, checked off, unchecked, changed or removed. Changes are gathered for 30 seconds and sent as one event for each person, so someone checking off 30 things sends one. It lists each shopping list touched with how many things are left and checked. Merging duplicate lines and moving things when a list is removed send nothing.",
  },
  "list.completed": {
    summary: "A shopping list was finished",
    description:
      "Sent when the last unchecked thing on a list is checked off, however it's done, or when Put away clears a list that still has unchecked things. A list that was finished already sends nothing more when it's put away, so one trip sends one. Undo and Clear checked don't send it.",
  },
  "list.sent": {
    summary: "A shopping list was sent to a store",
    description:
      "Sent when a list goes to a store's cart: Kroger's, or Walmart's through the extension. It says how many things were sent and how many the store had no product for. The extension reports each stretch of a Walmart fill, with what's new since its last report, so a fill that's stopped and carried on sends one for each stretch and counts each product once. An extension too old to report sends nothing for Walmart.",
  },
  "pantry.changed": {
    summary: "The pantry changed",
    description:
      "Sent when things are put away, used up, moved, changed or removed. Changes are gathered for 30 seconds and sent as one event for each person.",
  },
  "webhook.test": {
    summary: "A test was sent",
    description:
      "Sent only when someone chooses Send a test for a webhook, and only to that webhook, even when it's paused. It's tried once, never retried, and never pauses the webhook.",
  },
}
