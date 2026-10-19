import type { Context } from "hono"
import { z } from "zod"
import type { AppEnv } from "../../core/context.ts"
import { removeSignInMethod } from "../../services/auth/methods.ts"
import { oidcConfiguration } from "../../modules/auth/oidc.ts"
import { passwordSignInAllowed } from "../../modules/auth/password-policy.ts"
import { revokeUserGrants } from "../../services/auth/oauth/revoke.ts"
import { Session } from "../../database/entities/sessions.ts"
import type { AppDeps } from "../../core/context.ts"
import {
  grantHousehold,
  oauthResources,
} from "../../services/auth/oauth/provider.ts"
import { roleIn, membershipsOf } from "../../services/households/households.ts"
import {
  OauthConsent,
  OauthAccessToken,
  OauthRefreshToken,
} from "../../database/entities/index.ts"
import { AUTH_SECURITY } from "../../modules/auth/settings.ts"
import { passkeyOrigin } from "../../modules/auth/index.ts"
import { AppError } from "../../core/errors.ts"
import { signedIn, serverAdmin } from "../middleware/auth.ts"

async function bodyOf<T>(request: Request, schema: z.ZodType<T>) {
  const parsed = schema.safeParse(
    await request
      .clone()
      .json()
      .catch(() => null)
  )
  if (!parsed.success)
    throw new AppError(
      "invalid",
      "invalid_auth_request",
      "Check the authentication request fields."
    )
  return parsed.data
}

async function listConnections(c: Context<AppEnv>) {
  const grants = await c.var.em.find(
    OauthConsent,
    { user: c.var.user!.id },
    { populate: ["client"], orderBy: { createdAt: "desc" } }
  )
  const memberships = await membershipsOf(c.var.em, c.var.user!.id)
  return c.json(
    grants.map((grant) => ({
      id: grant.id,
      clientId: grant.client.getProperty("clientId"),
      name: grant.client.getProperty("name") ?? null,
      referenceId: grant.referenceId,
      householdName:
        memberships
          .find((member) => member.household.id === grant.referenceId)
          ?.household.getEntity().name ?? null,
      scopes: grant.scopes,
      resources: grant.resources,
      createdAt: grant.createdAt.toISOString(),
      lastUsedAt: grant.lastUsedAt?.toISOString() ?? null,
    }))
  )
}

async function removeMethod(c: Context<AppEnv>, deps: AppDeps, path: string) {
  const removed =
    path === "/unlink-account"
      ? await bodyOf(c.req.raw, z.object({ accountId: z.uuid() }))
      : { passkeyId: (await bodyOf(c.req.raw, z.object({ id: z.uuid() }))).id }
  await removeSignInMethod(
    c.var.em,
    c.var.user!.id,
    c.var.session!.id,
    removed,
    {
      passwords: await passwordSignInAllowed(
        c.var.em,
        deps.config,
        deps.settings
      ),
      oidc: !!oidcConfiguration(deps.config),
      passkeys:
        !!passkeyOrigin(deps.config.publicUrl) &&
        (await deps.settings.server(AUTH_SECURITY.passkeys)),
    },
    deps.auth.options.session?.freshAge ?? 24 * 60 * 60
  )
  return c.json({ status: true })
}

async function continueAuthorization(c: Context<AppEnv>, deps: AppDeps) {
  const { householdId } = await bodyOf(
    c.req.raw,
    z.object({ householdId: z.string() })
  )
  if (
    !z.uuid().safeParse(householdId).success ||
    !(await roleIn(c.var.em, c.var.user!.id, householdId))
  )
    throw new AppError(
      "forbidden",
      "invalid_household",
      "Choose a household you belong to."
    )
  return grantHousehold.run(householdId, () => deps.auth.handler(c.req.raw))
}

async function disconnectConnection(c: Context<AppEnv>) {
  const { id } = await bodyOf(c.req.raw, z.object({ id: z.uuid() }))
  if (typeof id !== "string") return c.json({ error: "invalid_request" }, 400)
  await c.var.em.transactional(async (em) => {
    const consent = await em.findOne(
      OauthConsent,
      { id, user: c.var.user!.id },
      { populate: ["client"] }
    )
    if (!consent)
      throw new AppError(
        "not_found",
        "grant_not_found",
        "That connection no longer exists."
      )
    const grant = {
      user: c.var.user!.id,
      client: { clientId: consent.client.getProperty("clientId") },
      referenceId: consent.referenceId,
    }
    await em.nativeDelete(OauthAccessToken, grant)
    await em.nativeDelete(OauthRefreshToken, grant)
    await em.nativeDelete(OauthConsent, { id })
  })
  return c.json({ status: true })
}

export async function handleBetterAuth(
  c: Context<AppEnv>,
  deps: AppDeps,
  path: string,
  needsSession: boolean
) {
  if (needsSession && c.req.method === "POST") {
    const origin = c.req.header("Origin")
    const expected = new URL(deps.config.publicUrl ?? c.req.url).origin
    if (
      (origin && origin !== expected) ||
      c.req.header("Sec-Fetch-Site") === "cross-site"
    ) {
      throw new AppError(
        "forbidden",
        "invalid_origin",
        "Use this server's own origin for account changes."
      )
    }
  }
  if (
    (path === "/sign-in/email" || path === "/sign-in/username") &&
    !(await passwordSignInAllowed(c.var.em, deps.config, deps.settings))
  )
    throw new AppError(
      "forbidden",
      "password_sign_in_disabled",
      "Use single sign-on or a passkey on this server."
    )
  if (path.startsWith("/oauth2/") || path.startsWith("/admin/oauth2/")) {
    if (
      deps.config.fromEnv.get("auth.oauth") !== true ||
      !deps.config.publicUrl
    )
      throw new AppError("not_found", "oauth_disabled", "OAuth is not enabled.")
    if (path === "/oauth2/create-client") serverAdmin(c)
    if (path === "/oauth2/authorize") {
      const query = new URL(c.req.url).searchParams
      const resource = query.getAll("resource")
      if (
        resource.length !== 1 ||
        !Object.values(oauthResources(deps.config.publicUrl)).includes(
          resource[0]!
        )
      )
        return c.json(
          {
            error: "invalid_target",
            error_description: "Request exactly one Merran resource.",
          },
          400
        )
      if (
        !query.get("code_challenge") ||
        query.get("code_challenge_method") !== "S256"
      )
        return c.json(
          {
            error: "invalid_request",
            error_description: "PKCE S256 is required.",
          },
          400
        )
      if (c.var.requiresTwoFactor)
        return c.redirect(
          "/verify?redirect=" +
            encodeURIComponent(c.req.path + new URL(c.req.url).search)
        )
    }
  }
  if (
    path.startsWith("/passkey/") &&
    (!(await deps.settings.server(AUTH_SECURITY.passkeys)) ||
      !passkeyOrigin(deps.config.publicUrl))
  )
    throw new AppError(
      "forbidden",
      "passkeys_disabled",
      "Passkeys are not enabled for this server."
    )
  if (
    path === "/two-factor/enable" &&
    !(await deps.settings.server(AUTH_SECURITY.twoFactor)) &&
    !(await deps.settings.server(AUTH_SECURITY.requireAdminTwoFactor))
  )
    throw new AppError(
      "forbidden",
      "two_factor_disabled",
      "Authenticator enrollment is not enabled."
    )
  const verification =
    path === "/get-session" ||
    path === "/sign-out" ||
    (path === "/two-factor/enable" && !c.var.user?.twoFactorEnabled) ||
    (path.startsWith("/passkey/") && !c.var.user?.twoFactorEnabled)
  if (needsSession) signedIn(c, verification)
  if (path === "/oauth2/get-consents") {
    return listConnections(c)
  }
  if (path === "/passkey/delete-passkey" || path === "/unlink-account") {
    return removeMethod(c, deps, path)
  }
  if (path === "/oauth2/continue" || path === "/oauth2/consent") {
    return continueAuthorization(c, deps)
  }
  if (path === "/oauth2/delete-consent") {
    return disconnectConnection(c)
  }
  const response = await deps.auth.handler(c.req.raw)
  if (
    response.ok &&
    (path === "/change-password" || path === "/two-factor/disable")
  ) {
    await c.var.em.transactional(async (em) => {
      await revokeUserGrants(em, c.var.user!.id)
      if (path === "/two-factor/disable")
        await em.nativeDelete(Session, {
          user: c.var.user!.id,
          id: { $ne: c.var.session!.id },
        })
    })
  }
  return response
}
