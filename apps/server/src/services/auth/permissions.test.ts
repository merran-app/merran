import { describe, expect, test } from "vitest"
import { allows, DATA_SCOPES, permissionsFromScopes } from "./permissions.ts"

describe("shared household permissions", () => {
  test("write includes read only for the granted area", () => {
    const permissions = permissionsFromScopes(["recipes:write", "pantry:read"])
    expect(allows(permissions, "recipes", "read")).toBe(true)
    expect(allows(permissions, "recipes", "write")).toBe(true)
    expect(allows(permissions, "pantry", "write")).toBe(false)
    expect(allows(permissions, "plan", "read")).toBe(false)
  })

  test("identity, refresh, malformed and unknown scopes grant no household access", () => {
    expect(
      permissionsFromScopes([
        "openid",
        "profile",
        "email",
        "offline_access",
        "*",
        "admin:write",
        "household:write",
        "recipes:read:write",
        "Recipes:write",
      ])
    ).toEqual({})
  })

  test("scope order and duplicates cannot downgrade or broaden a grant", () => {
    expect(
      permissionsFromScopes(["recipes:write", "recipes:read", "recipes:read"])
    ).toEqual({ recipes: "write" })
    expect(permissionsFromScopes(["recipes:read", "recipes:write"])).toEqual({
      recipes: "write",
    })
  })

  test("household administration is never a delegated write permission", () => {
    expect(DATA_SCOPES).not.toContain("household:write")
    expect(allows({ household: "write" }, "household", "write")).toBe(false)
  })
})
