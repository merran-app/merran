/** Household permissions shared by API keys and connected applications. */
export const API_AREAS = [
  "household",
  "recipes",
  "plan",
  "list",
  "pantry",
  "imports",
  "assistant",
] as const

export type ApiArea = (typeof API_AREAS)[number]
export type ApiAccess = "read" | "write"
export type Permissions = Partial<Record<ApiArea, ApiAccess>>

/** Write includes read. Household metadata never has a write permission. */
export function allows(
  permissions: Permissions,
  area: ApiArea,
  access: ApiAccess
) {
  if (area === "household" && access === "write") return false
  const given = permissions[area]
  return given === "write" || (given === "read" && access === "read")
}

/** Unknown scopes never grant access. OAuth's identity/refresh scopes aren't data permissions. */
export function permissionsFromScopes(scopes: readonly string[]): Permissions {
  const permissions: Permissions = {}
  for (const area of API_AREAS) {
    if (area !== "household" && scopes.includes(`${area}:write`)) {
      permissions[area] = "write"
    } else if (scopes.includes(`${area}:read`)) {
      permissions[area] = "read"
    }
  }
  return permissions
}

export const DATA_SCOPES = API_AREAS.flatMap((area) =>
  area === "household" ? [`${area}:read`] : [`${area}:read`, `${area}:write`]
)
