// What cook view does about its cooking session as it opens, and when
// cooking starts. A session this device was in carries on, wherever cook
// view opens, as a reload must; a new one starts only past Get ready.

/** What to do first: ask after the remembered session, start one, or wait. */
export type OpeningStep = "check-in" | "start" | "wait"

/** What to do once the remembered session has answered. */
export type AfterCheckIn = "keep" | "start" | "wait"

export function openingStep(
  remembered: string | null,
  begun: boolean
): OpeningStep {
  if (remembered) return "check-in"
  return begun ? "start" : "wait"
}

/**
 * A session still open carries on, and so does one the server couldn't be
 * asked about: it's likely still open, and starting another would say
 * cooking started twice. One that's ended is replaced once cooking starts.
 */
export function afterCheckIn(
  answer: "open" | "gone" | "failed",
  begun: boolean
): AfterCheckIn {
  if (answer !== "gone") return "keep"
  return begun ? "start" : "wait"
}
