import type { Router } from "../../../env.ts"
import { PUBLIC_HEADERS } from "../../../requests.ts"

/** The newest night's totals, for the public page. */
export default (router: Router) => {
  router.get("/v1/totals", async (c) => {
    const row = await c.env.DB.prepare(
      "SELECT totals FROM days ORDER BY day DESC LIMIT 1"
    ).first<{ totals: string }>()
    if (!row) {
      return c.json(
        { error: "No totals yet: they're worked out each night." },
        404,
        PUBLIC_HEADERS
      )
    }
    return c.body(row.totals, 200, {
      ...PUBLIC_HEADERS,
      "Content-Type": "application/json",
    })
  })
}
