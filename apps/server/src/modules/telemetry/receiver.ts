// The Merran project's telemetry receiver (docs/telemetry.md), whose code
// is apps/telemetry.

/**
 * Whether the receiver is answering yet. Until it is, Settings doesn't offer
 * telemetry, setup doesn't ask, and nothing is sent: 0.1.0-alpha.1 sent to
 * an address that didn't answer. Turned on in the first release after
 * telemetry.merran.app is live.
 */
export const RECEIVER_LIVE: boolean = false

export const RECEIVER_URL = "https://telemetry.merran.app"

/** Where the daily summary goes. The version in the path is the summary's. */
export const TELEMETRY_URL = `${RECEIVER_URL}/v1/reports`

/** The public page with the totals from every server that sends one. */
export const TOTALS_PAGE = "https://merran.app/telemetry"
