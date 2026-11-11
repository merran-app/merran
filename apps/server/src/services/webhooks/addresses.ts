import { AppError } from "../../core/errors.ts"
import { WEBHOOKS } from "../../modules/webhooks/settings.ts"
import { checkPublicLink } from "../fetch/public-fetch.ts"
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
 * one whose name leads only to public addresses, looked up now. Sending
 * checks again, since a name can start pointing home later.
 */
export async function checkWebhookAddress(
  raw: string,
  options: { homeNetwork: boolean }
): Promise<URL> {
  const url = parseAddress(raw)
  if (options.homeNetwork) return url

  try {
    return await checkPublicLink(url.href)
  } catch (error) {
    if (error instanceof AppError && error.code === "private_address") {
      throw addressError(
        "webhook_home_network",
        "This address is on your home network. The server admin can allow that in Settings → Server → Webhooks."
      )
    }
    throw error
  }
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
