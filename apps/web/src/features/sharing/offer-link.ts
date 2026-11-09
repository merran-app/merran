export type LinkToOffer = {
  title: string
  text: string
  url: string
}

/** What happened to the link: sent on, copied, or the person changed their mind. */
export type LinkOffered = "shared" | "copied" | "cancelled"

function isNamed(err: unknown, name: string) {
  return err instanceof Error && err.name === name
}

/**
 * Offers a link through the device's share sheet, or copies it where there
 * isn't one.
 *
 * A NotAllowedError is thrown on again rather than swallowed: Safari gives
 * it when a tap's permission to share has run out, which happens after the
 * request that made the link. The caller can then ask for a fresh tap.
 */
export async function offerLink(
  link: LinkToOffer,
  nav: Pick<Navigator, "share" | "clipboard"> = navigator
): Promise<LinkOffered> {
  if (typeof nav.share === "function") {
    try {
      await nav.share(link)
      return "shared"
    } catch (err) {
      if (isNamed(err, "AbortError")) return "cancelled"
      if (isNamed(err, "NotAllowedError")) throw err
      // Any other failure still leaves the link to copy.
    }
  }

  await nav.clipboard.writeText(link.url)
  return "copied"
}

/** Whether an error from offerLink is Safari asking for a fresh tap. */
export function needsFreshTap(err: unknown) {
  return isNamed(err, "NotAllowedError")
}
