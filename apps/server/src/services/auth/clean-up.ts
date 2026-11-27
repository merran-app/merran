import type { EntityManager } from "@mikro-orm/sql"
import {
  OauthAccessToken,
  OauthClientAssertion,
  OauthRefreshToken,
  RateLimit,
  Session,
  Verification,
} from "../../database/entities/index.ts"

/** How long a rate limit's row stays after its last request. */
export const KEEP_RATE_LIMITS_MS = 24 * 60 * 60 * 1000

/**
 * For the daily clean-up: clears what sign-in leaves behind. Better Auth
 * removes an expired session or code only when someone comes back for it,
 * and a rate limit's row only when its key is used again. Returns how many
 * of each went.
 */
export async function clearExpiredSignIns(
  em: EntityManager,
  now: Date = new Date()
) {
  const expired = { expiresAt: { $lt: now } }
  // Tokens point at their session, set null when it goes.
  const sessions = await em.nativeDelete(Session, expired)
  const verifications = await em.nativeDelete(Verification, expired)
  const accessTokens = await em.nativeDelete(OauthAccessToken, expired)
  const refreshTokens = await em.nativeDelete(OauthRefreshToken, expired)
  const assertions = await em.nativeDelete(OauthClientAssertion, expired)
  const rateLimits = await em.nativeDelete(RateLimit, {
    lastRequest: { $lt: now.getTime() - KEEP_RATE_LIMITS_MS },
  })
  return {
    sessions,
    verifications,
    tokens: accessTokens + refreshTokens + assertions,
    rateLimits,
  }
}
