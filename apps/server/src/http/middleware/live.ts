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
  // Shopping put away goes in the pantry; listing meals sets food aside.
  [/^\/api\/list\/(put-away|from-plan)$/, ["list", "pantry"]],
  [/^\/api\/list(\/|$)/, ["list"]],
  // Product choices and cart transfers change shopping progress on every device.
  [/^\/api\/stores(\/|$)/, ["list"]],
  // Reading a receipt changes nothing; adding one fills the pantry from the list.
  [/^\/api\/pantry\/receipts\/[^/]+\/add$/, ["pantry", "list"]],
  [/^\/api\/pantry\/receipts(\/|$)/, []],
  [/^\/api\/pantry(\/|$)/, ["pantry"]],
  // Made it cooks the meal; Recently deleted takes meals off the plan.
  [/^\/api\/recipes(\/|$)/, ["recipes", "plan", "list", "pantry"]],
  [/^\/api\/households\/current\/(tastes|themes|on-hand)$/, ["household"]],
  // A household's AI keys and models.
  [/^\/api\/households\/current\/ai(\/|$)/, ["household"]],
  [/^\/api\/households\/current$/, ["household"]],
]

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
    const areas = CHANGES.find(([path]) => path.test(c.req.path))?.[1] ?? []
    const by = user
      ? { id: user.id, name: delegated ? delegated.name : user.name }
      : null
    const client = c.req.header(CLIENT_HEADER)?.slice(0, 64) || null
    for (const area of areas) events.changed(household.id, { area, by, client })
  })
}
