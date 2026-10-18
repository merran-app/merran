import type { Settings } from "../../services/settings/settings.ts"
import { RECEIVER_LIVE, TOTALS_PAGE } from "./receiver.ts"
import { TELEMETRY } from "./settings.ts"

/**
 * Whether to ask the server admin about telemetry: once, the first time they
 * open Merran after setup (or after the release that turns the receiver on).
 * Not if they've answered, chosen in Settings already, or the environment
 * has decided.
 */
export async function shouldAsk(settings: Settings) {
  if (!RECEIVER_LIVE) return false
  if (await settings.server(TELEMETRY.asked)) return false
  const state = (await settings.describeServer()).find(
    (setting) => setting.key === TELEMETRY.enabled.key
  )
  return state?.source === "default"
}

/** How telemetry's going, for the Telemetry card and the question. */
export async function telemetryStatus(settings: Settings) {
  return {
    receiving: RECEIVER_LIVE,
    ask: await shouldAsk(settings),
    last: await settings.server(TELEMETRY.lastResult),
    totals: TOTALS_PAGE,
  }
}
