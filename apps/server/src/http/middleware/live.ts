import { delegatedCredential } from "../../services/auth/credentials.ts"
import { createMiddleware } from "hono/factory"
import type { AppEnv } from "../../core/context.ts"
import type { EventBus, LiveArea } from "../../services/events/events.ts"

/** The header a device sends with each request: which it is, so it isn't told what it did. */
export const CLIENT_HEADER = "x-merran-client"

/** What a change to each part of the API changes, by its path. */
const CHANGES: [RegExp, LiveArea[]][] = [
  // Asking for ideas changes nothing.
  [/^\/api\/plan\/suggest$/, []],
  [/^\/api\/list\/items\/[^/]+\/substitutions\/suggest$/, []],
  [
    /^\/api\/list\/(items\/[^/]+\/substitutions|substitutions\/undo)$/,
    ["list", "plan", "pantry", "recipes"],
  ],
  // The list follows the plan, and cooking uses up the pantry.
  [/^\/api\/plan(\/|$)/, ["plan", "list", "pantry"]],
  // A recipe added to the list goes on the plan too, or changes a meal
  // there, and so does its Undo.
  [/^\/api\/list\/recipes(\/undo)?$/, ["list", "plan", "pantry"]],
  // Shopping put away goes in the pantry; listing meals sets food aside,
  // and what isn't at home after all comes off it.
  [
    /^\/api\/list\/(put-away|from-plan|for-meals|covered\/[^/]+\/not-at-home)$/,
    ["list", "pantry"],
  ],
  // Checking off puts food away, and taking checked rows off or clearing
  // puts away what never went in.
  [/^\/api\/list\/(items(\/[^/]+|\/bulk)?|restore|clear)$/, ["list", "pantry"]],
  [/^\/api\/list(\/|$)/, ["list"]],
  // Product choices and cart transfers change shopping progress on every device.
  [/^\/api\/stores(\/|$)/, ["list"]],
  // Reading a receipt changes nothing; adding one fills the pantry from the list.
  [/^\/api\/pantry\/receipts\/[^/]+\/add$/, ["pantry", "list"]],
  [/^\/api\/pantry\/receipts(\/|$)/, []],
  // What ran out cooking is used up, and goes on the list.
  [/^\/api\/pantry\/ran-out$/, ["pantry", "list"]],
  [/^\/api\/pantry(\/|$)/, ["pantry"]],
  // Recipes, most specific first. Nothing's saved by asking for stand-ins or
  // by finding links in some text.
  [/^\/api\/recipes\/(import\/links\/check|[^/]+\/stand-ins)$/, []],
  // The plan's nutrition totals follow a recipe's nutrition. (The
  // library-wide run, at /api/recipes/nutrition, falls to the last rule.)
  [/^\/api\/recipes\/[^/]+\/nutrition$/, ["recipes", "plan"]],
  // What the plan, the list and the pantry show of a recipe (its name,
  // photo, servings, lines and what's left out) changes with an edit, a
  // swap, what it needs, a photo or a restored version; Made it cooks a
  // meal; and Recently deleted takes meals off the plan. A recipe's own
  // path is any one part but the names of the collections beside it.
  [
    /^\/api\/recipes\/(bulk|deleted(\/.*)?|(?!(?:import|nutrition|photos|tidy|tags|duplicates)$)[^/]+(\/(photo|photo\/make|swap|needs|made|versions\/[^/]+\/restore))?)$/,
    ["recipes", "plan", "list", "pantry"],
  ],
  // The rest only show in recipes, Review and tags: a new recipe, an
  // import, a rating, diets, pairings, sharing, cook notes, duplicates,
  // tags, and the library runs (which tell of their own work as they go).
  [/^\/api\/recipes(\/|$)/, ["recipes"]],
  // Shared to Merran, sites followed, a collection imported, a search for
  // more: recipes, and the shelf and searches kept with them.
  [/^\/api\/(share|sites|collections|discover|imports)(\/|$)/, ["recipes"]],
  // Applying a suggestion can add a recipe, meals, things for the list or
  // tastes; applying or dismissing one changes Review.
  [/^\/api\/proposals(\/|$)/, ["recipes", "plan", "list", "household"]],
  [/^\/api\/households\/current\/(tastes|themes|on-hand)$/, ["household"]],
  // A household's AI keys and models.
  [/^\/api\/households\/current\/ai(\/|$)/, ["household"]],
  // Turning put-away on puts away what's checked off already.
  [/^\/api\/households\/current$/, ["household", "list", "pantry"]],
  // Its people, invites, shares, webhooks and imports.
  [/^\/api\/households\/current\//, ["household"]],
]

/** What a change to this path changes: the first rule that matches it. */
export function areasFor(path: string): LiveArea[] {
  return CHANGES.find(([pattern]) => pattern.test(path))?.[1] ?? []
}

/**
 * After a change goes through (anything but a read that answered without
 * an error), tells the household's open pages and other devices what
 * changed, and who did it.
 */
export function announceChanges(events: EventBus) {
  return createMiddleware<AppEnv>(async (c, next) => {
    await next()
    const method = c.req.method
    if (method === "GET" || method === "HEAD" || method === "OPTIONS") return
    if (c.error || c.res.status >= 400) return
    const { household, user } = c.var
    const delegated = delegatedCredential(c.var.credential)
    if (!household) return
    const areas = areasFor(c.req.path)
    const by = user
      ? { id: user.id, name: delegated ? delegated.name : user.name }
      : null
    const client = c.req.header(CLIENT_HEADER)?.slice(0, 64) || null
    for (const area of areas) events.changed(household.id, { area, by, client })
  })
}
