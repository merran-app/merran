import type { EntityManager } from "@mikro-orm/sql"
import {
  OauthAccessToken,
  OauthRefreshToken,
  OauthConsent,
} from "../../../database/entities/index.ts"

/** Used inside the caller's transaction when credentials are recovered or replaced. */
export async function revokeUserGrants(em: EntityManager, userId: string) {
  await em.nativeDelete(OauthAccessToken, { user: userId })
  await em.nativeDelete(OauthRefreshToken, { user: userId })
  await em.nativeDelete(OauthConsent, { user: userId })
}
