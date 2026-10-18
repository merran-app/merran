import type { Router } from "../env.ts"

export const TOTALS_PAGE = "https://merran.app/telemetry"

/** People who type the address get the public page. */
export default (router: Router) => {
  router.get("/", (c) => c.redirect(TOTALS_PAGE, 302))
}
