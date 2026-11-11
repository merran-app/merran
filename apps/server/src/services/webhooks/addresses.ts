import { lookup } from "node:dns/promises"
import { isIP } from "node:net"
import { AppError } from "../../core/errors.ts"
import { WEBHOOKS } from "../../modules/webhooks/settings.ts"
import { checkPublicLink, isLinkLocalAddress } from "../fetch/public-fetch.ts"
import type { Settings } from "../settings/settings.ts"

// Where a webhook may send. Home Assistant is usually on the home network,
// but on a shared server any household could otherwise make Merran call
// machines there, so that's only for the households the server admin allows
// (docs/webhooks.md, "The home network").

const MAX_ADDRESS_LENGTH = 2_000

/** Whether the server admin lets this household's webhooks reach the home network. */
export async function homeNetworkAllowed(
  settings: Settings,
  householdId: string
): Promise<boolean> {
  const homeNetwork = await settings.server(WEBHOOKS.homeNetwork)
  if (homeNetwork === "all") return true
  if (homeNetwork !== "chosen") return false

  const chosen = await settings.server(WEBHOOKS.homeNetworkHouseholds)
  return chosen.includes(householdId)
}

/**
 * An address a webhook may be saved with: http or https, with no user name
 * or password in it, and, unless the household may reach the home network,
 * one whose name leads only to public addresses, looked up now. Even when
 * it may, never a link-local one. Sending checks again, since a name can
 * start pointing home later.
 */
export async function checkWebhookAddress(
  raw: string,
  options: { homeNetwork: boolean }
): Promise<URL> {
  const url = parseAddress(raw)
  if (options.homeNetwork) return refuseLinkLocal(url)

  try {
    return await checkPublicLink(url.href)
  } catch (error) {
    if (error instanceof AppError && error.code === "private_address") {
      throw addressError(
        "webhook_home_network",
        "This address is on your home network. The server admin can allow that in Settings → Webhooks → Whole server."
      )
    }
    throw error
  }
}

/**
 * Refuses an address that is, or whose name leads to, a link-local address,
 * like 169.254.169.254, where a cloud server's metadata service hands out
 * its keys: the home network being allowed doesn't reach those. A name
 * that can't be looked up now may be one only the home network knows, so
 * it's allowed; sending refuses it if it turns out link-local.
 */
async function refuseLinkLocal(url: URL): Promise<URL> {
  const host = url.hostname.replace(/^\[|\]$/g, "")
  const addresses = isIP(host)
    ? [host]
    : (await lookup(host, { all: true }).catch(() => [])).map(
        (found) => found.address
      )

  if (addresses.some(isLinkLocalAddress)) {
    throw addressError(
      "webhook_address",
      "Webhooks can't reach link-local addresses, like 169.254.169.254."
    )
  }
  return url
}

/** The rules any address follows, wherever it leads. */
function parseAddress(raw: string): URL {
  if (raw.length > MAX_ADDRESS_LENGTH) {
    throw addressError(
      "webhook_address",
      "Use an address of at most 2,000 characters."
    )
  }

  let url: URL
  try {
    url = new URL(raw)
  } catch {
    throw notAnAddress()
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw notAnAddress()
  }
  // fetch refuses an address with a password in it, so it goes in a header.
  if (url.username || url.password) {
    throw addressError(
      "webhook_address",
      "Put a user name or password in a header, not the address."
    )
  }
  return url
}

const notAnAddress = () =>
  addressError(
    "webhook_address",
    "Use a full address, starting with http:// or https://."
  )

function addressError(code: string, message: string) {
  return new AppError("invalid", code, message, { address: message })
}
