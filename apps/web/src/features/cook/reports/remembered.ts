// Which cooking session this device is in for each cooking (a recipe, a
// meal of it), so a reload carries on with it rather than starting again.
// Kept as long as cook view keeps its place: a meal's cooking is over
// within a few hours.

const KEEP_HOURS = 12
const key = (progressId: string) => `merran-cooking-session.${progressId}`

type Remembered = { id: string; savedAt: number }

export function rememberSession(progressId: string, sessionId: string) {
  const remembered: Remembered = { id: sessionId, savedAt: Date.now() }
  try {
    localStorage.setItem(key(progressId), JSON.stringify(remembered))
  } catch {
    // Not remembered: a reload starts a new session, and cooking goes on.
  }
}

/** The session this cooking is in on this device, if it was lately. */
export function rememberedSession(progressId: string): string | null {
  try {
    const saved = JSON.parse(
      localStorage.getItem(key(progressId)) ?? "null"
    ) as Partial<Remembered> | null
    if (typeof saved?.id !== "string" || typeof saved.savedAt !== "number") {
      return null
    }
    if (Date.now() - saved.savedAt > KEEP_HOURS * 3_600_000) return null
    return saved.id
  } catch {
    return null
  }
}

export function forgetSession(progressId: string) {
  try {
    localStorage.removeItem(key(progressId))
  } catch {
    // Nothing kept to forget.
  }
}
