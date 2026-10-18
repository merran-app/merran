import type { Totals } from "../../../daily/totals.ts"
import type { Router } from "../../../env.ts"
import { PUBLIC_HEADERS } from "../../../requests.ts"

/** Up to two years of nights, for the page's charts of change over time. */
export default (router: Router) => {
  router.get("/v1/history", async (c) => {
    const { results } = await c.env.DB.prepare(
      "SELECT totals FROM days ORDER BY day DESC LIMIT 731"
    ).all<{ totals: string }>()
    const days = results.reverse().map((row) => {
      const { day, servers, versions } = JSON.parse(row.totals) as Totals
      return { day, servers, versions }
    })
    return c.json(days, 200, PUBLIC_HEADERS)
  })
}
