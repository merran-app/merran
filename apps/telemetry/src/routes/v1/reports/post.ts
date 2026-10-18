import { TelemetryReportSchema } from "@merran/shared/telemetry"
import type { Context } from "hono"
import { utcDay } from "../../../days.ts"
import type { Env, Router } from "../../../env.ts"
import { countRejection, keepReport } from "../../../installs.ts"
import { readBody, slowDown, tooMany } from "../../../requests.ts"

/** A summary is about 400 bytes. */
const MAX_BYTES = 4096

type RefusedStatus = 400 | 413 | 415

/** Turns a summary down, saying why, and counts it with nothing of it. */
async function refuse(
  c: Context<{ Bindings: Env }>,
  status: RefusedStatus,
  reason: string,
  message: string
) {
  await countRejection(c.env.DB, utcDay(new Date()), reason)
  return c.json({ error: message.slice(0, 300) }, status)
}

/** A server's daily summary (docs/telemetry.md, "Checking reports"). */
export default (router: Router) => {
  router.post("/v1/reports", async (c) => {
    if (await tooMany(c)) return slowDown(c)
    if (!/^application\/json\b/i.test(c.req.header("content-type") ?? "")) {
      return refuse(c, 415, "not_json", "Send the summary as JSON.")
    }
    const body = await readBody(c.req.raw, MAX_BYTES)
    if (body === null) {
      return refuse(c, 413, "too_large", "That's bigger than any summary.")
    }
    let json: unknown
    try {
      json = JSON.parse(body)
    } catch {
      return refuse(c, 400, "not_json", "That isn't JSON.")
    }

    const parsed = TelemetryReportSchema.safeParse(json)
    if (!parsed.success) {
      const [issue] = parsed.error.issues
      if (issue?.code === "unrecognized_keys") {
        return refuse(
          c,
          400,
          "unknown_field",
          `Not part of the summary: ${issue.keys.join(", ")}`
        )
      }
      const field = String(issue?.path[0] ?? "summary")
      return refuse(
        c,
        400,
        `invalid_${field}`,
        `${issue?.path.join(".") || "summary"}: ${issue?.message ?? "Invalid"}`
      )
    }

    await keepReport(c.env.DB, parsed.data, utcDay(new Date()))
    return c.body(null, 204)
  })
}
