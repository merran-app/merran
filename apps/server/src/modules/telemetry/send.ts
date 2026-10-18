import type { EntityManager } from "@mikro-orm/sql"
import { AppError } from "../../core/errors.ts"
import type { JobDeps, JobHandler } from "../../services/jobs/runner.ts"
import { RECEIVER_LIVE, RECEIVER_URL, TELEMETRY_URL } from "./receiver.ts"
import { buildReport } from "./report.ts"
import { TELEMETRY, type LastResult } from "./settings.ts"

/**
 * The daily summary, sent only if the server admin said yes: exactly what
 * Settings → This server → Telemetry shows. A receiver that can't be reached
 * isn't a failed job, just a day without a summary; one that refuses the
 * summary is, since the project needs to hear about it.
 */
export const sendTelemetryJob: JobHandler = {
  kind: "telemetry.send",
  async run({ em, deps }) {
    if (!RECEIVER_LIVE) return { sent: false }
    const enabled = await deps.settings.server(TELEMETRY.enabled)
    await forgetOldId(em, deps, enabled)
    if (!enabled) return { sent: false }

    const report = await buildReport(em, deps, deps.modules)
    const keep = (outcome: LastResult["outcome"], detail: string | null) =>
      deps.settings.keepServer(em, TELEMETRY.lastResult, {
        at: new Date().toISOString(),
        outcome,
        detail,
      })

    let response
    try {
      response = await deps.fetcher(TELEMETRY_URL, {
        json: report,
        accept: "application/json",
        maxBytes: 100_000,
        keepErrors: true,
      })
    } catch (error) {
      if (!(error instanceof AppError) || error.kind !== "upstream") throw error
      response = null
    }

    if (response && response.status < 300) {
      await deps.settings.keepServer(em, TELEMETRY.reportedId, report.installId)
      await keep("sent", null)
      return { sent: true }
    }
    if (response?.status === 410) {
      await keep("retired", null)
      return { sent: false, outcome: "retired" }
    }
    if (!response || response.status === 429 || response.status >= 500) {
      deps.logger.warn(
        "Couldn't reach the Merran project's telemetry receiver; trying again tomorrow"
      )
      await keep("unreachable", null)
      return { sent: false, outcome: "unreachable" }
    }
    const detail = refusal(response.body)
    await keep("refused", detail)
    throw new AppError(
      "upstream",
      "telemetry_refused",
      `The Merran project's receiver turned the summary down: ${detail}`
    )
  },
}

/**
 * Tells the receiver to forget the id it last took a summary from, once
 * telemetry's turned off or a new id's been made, so that row goes now
 * rather than 30 days on. Best effort: it's never tried again.
 */
async function forgetOldId(em: EntityManager, deps: JobDeps, enabled: boolean) {
  const reported = await deps.settings.server(TELEMETRY.reportedId)
  if (!reported) return
  if (enabled && reported === (await deps.settings.server(TELEMETRY.installId)))
    return
  await deps.settings.keepServer(em, TELEMETRY.reportedId, null)
  try {
    await deps.fetcher(`${RECEIVER_URL}/v1/installs/${reported}`, {
      method: "DELETE",
      accept: "application/json",
      maxBytes: 10_000,
      keepErrors: true,
    })
  } catch (error) {
    if (!(error instanceof AppError) || error.kind !== "upstream") throw error
  }
}

/** What the receiver said was wrong, kept short: it's shown to the admin. */
function refusal(body: Buffer) {
  const text = body.toString("utf8")
  let detail = text
  try {
    const parsed = JSON.parse(text) as { error?: unknown }
    if (typeof parsed.error === "string") detail = parsed.error
  } catch {
    // Not JSON: the text itself will do.
  }
  return detail.trim().slice(0, 300) || "no reason given"
}
