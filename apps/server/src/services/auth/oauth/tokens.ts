import type { EntityManager } from "@mikro-orm/sql"
import {
  OauthAccessToken,
  OauthConsent,
} from "../../../database/entities/index.ts"
import { roleIn } from "../../households/households.ts"
import { AppError } from "../../../core/errors.ts"
import type { Authenticated } from "../session.ts"
import { permissionsFromScopes } from "../permissions.ts"
import { OAUTH_PREFIX, oauthResources, tokenHash } from "./provider.ts"

/** Every request rechecks the grant, person and household; a token is never a session. */
export async function withOAuthToken(
  em: EntityManager,
  token: string,
  publicUrl: string
): Promise<Authenticated> {
  const invalid = () =>
    new AppError(
      "unauthorized",
      "invalid_token",
      "This access token is no longer valid."
    )
  const access = await em.findOne(
    OauthAccessToken,
    { token: tokenHash(token.slice(OAUTH_PREFIX.length)) },
    { populate: ["user", "client", "session"] }
  )
  if (
    !access ||
    access.revoked ||
    access.expiresAt <= new Date() ||
    !access.user ||
    !access.referenceId
  )
    throw invalid()
  const user = access.user.getEntity()
  const client = access.client.getEntity()
  if (user.banned || client.disabled) throw invalid()
  // Losing the sign-in session also ends delegated access, including after recovery.
  if (!access.session || access.session.getEntity().expiresAt <= new Date())
    throw invalid()
  const resources = oauthResources(publicUrl)
  if (access.resources?.length !== 1) throw invalid()
  const audience =
    access.resources[0] === resources.mcp
      ? "mcp"
      : access.resources[0] === resources.api
        ? "api"
        : null
  if (!audience) throw invalid()
  const role = await roleIn(em, user.id, access.referenceId)
  if (!role) throw invalid()
  const consent = await em.findOne(OauthConsent, {
    client: { clientId: client.clientId },
    user: user.id,
    referenceId: access.referenceId,
  })
  if (
    !consent ||
    !access.scopes.every((scope) => consent.scopes.includes(scope)) ||
    !consent.resources?.includes(access.resources[0]!)
  )
    throw invalid()
  if (
    !consent.lastUsedAt ||
    Date.now() - consent.lastUsedAt.getTime() > 10 * 60 * 1000
  )
    await em.nativeUpdate(
      OauthConsent,
      { id: consent.id },
      { lastUsedAt: new Date() }
    )
  return {
    credential: {
      kind: "oauth",
      id: access.id,
      clientId: client.clientId,
      name: client.name ?? "Connected app",
      audience,
      permissions: permissionsFromScopes(access.scopes),
    },
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      username: user.username ?? null,
      displayUsername: user.displayUsername ?? null,
      role: user.role ?? null,
    },
    household: { id: access.referenceId, role },
    session: null,
    apiKey: null,
  }
}
