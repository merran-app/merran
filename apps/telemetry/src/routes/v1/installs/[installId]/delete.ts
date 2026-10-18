import { TelemetryReportSchema } from "@merran/shared/telemetry"
import type { Router } from "../../../../env.ts"
import { forget } from "../../../../installs.ts"
import { slowDown, tooMany } from "../../../../requests.ts"

/**
 * A server forgetting its old id, after a new one or turning telemetry off,
 * so its row goes now rather than 30 days on. Only that server and its admin
 * have seen the id.
 */
export default (router: Router) => {
  router.delete("/v1/installs/:installId", async (c) => {
    if (await tooMany(c)) return slowDown(c)
    const id = TelemetryReportSchema.shape.installId.safeParse(
      c.req.param("installId")
    )
    if (!id.success) return c.json({ error: "That isn't an install id." }, 400)
    await forget(c.env.DB, id.data)
    return c.body(null, 204)
  })
}
