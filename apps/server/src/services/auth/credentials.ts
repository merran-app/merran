import type { Permissions } from "./permissions.ts"
import { AppError } from "../../core/errors.ts"

/** Only verified credentials enter request context; tokens and secrets never do. */
export type Credential =
  | { kind: "session"; id: string }
  | {
      kind: "apiKey"
      id: string
      name: string
      permissions: Permissions
    }
  | {
      kind: "oauth"
      id: string
      name: string
      clientId: string
      /** The resource this grant was issued for, checked before entering context. */
      audience: "mcp" | "api"
      permissions: Permissions
    }

export type DelegatedCredential = Exclude<Credential, { kind: "session" }>

export function delegatedCredential(credential: Credential | null | undefined) {
  return credential && credential.kind !== "session" ? credential : null
}

/** Resource-bound tokens cannot be reused through another interface. */
export function requireAudience(
  credential: DelegatedCredential,
  audience: "api" | "mcp"
) {
  if (credential.kind === "oauth" && credential.audience !== audience) {
    throw new AppError(
      "forbidden",
      "wrong_token_audience",
      "This access token was issued for a different resource."
    )
  }
}
