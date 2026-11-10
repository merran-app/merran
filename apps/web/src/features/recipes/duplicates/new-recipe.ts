/** How long a recipe counts as new, for saying it may be one the household has. */
const NEW_FOR_MS = 7 * 24 * 60 * 60 * 1000

/**
 * Whether a recipe was added in the last 7 days: only then does its page
 * say it may be one the household already has. Older pairs are on the
 * Possible duplicates page.
 */
export function isNewRecipe(createdAt: string, now = Date.now()) {
  const added = Date.parse(createdAt)
  if (Number.isNaN(added)) return false
  return now - added < NEW_FOR_MS
}
