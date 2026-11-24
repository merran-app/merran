/**
 * Return URLs are local page paths, including after verification and
 * external sign-in. On its own, away from the sign-in client, so the routes
 * that check their search with it don't bring that client into every page's
 * first load.
 */
export function safeReturnTo(target: string | undefined) {
  if (
    !target ||
    !target.startsWith("/") ||
    target.startsWith("//") ||
    /[\\\u0000-\u001f]/.test(target)
  )
    return "/"
  return target
}
