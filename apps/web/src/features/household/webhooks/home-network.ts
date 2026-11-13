export type HomeNetworkSetting = {
  mode: "off" | "all" | "chosen"
  households: string[]
}

/**
 * The server settings change that lets a household's webhooks reach the home
 * network, or null when it already can. Other households that were chosen
 * keep their leave.
 */
export function allowHomeNetwork(
  current: HomeNetworkSetting,
  householdId: string
): Record<string, unknown> | null {
  if (current.mode === "all") return null

  if (current.mode === "off") {
    return {
      "webhooks.homeNetwork": "chosen",
      "webhooks.homeNetworkHouseholds": [householdId],
    }
  }

  if (current.households.includes(householdId)) return null
  return {
    "webhooks.homeNetworkHouseholds": [...current.households, householdId],
  }
}
