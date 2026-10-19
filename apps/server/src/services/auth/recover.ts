import type { EntityManager } from "@mikro-orm/sql"
import {
  OauthAccessToken,
  OauthRefreshToken,
  OauthConsent,
  Session,
  TwoFactor,
  User,
} from "../../database/entities/index.ts"

/** Operator-only recovery: revoke sessions and grants before allowing re-enrollment. */
export async function resetSecondFactor(em: EntityManager, identifier: string) {
  const user = await em.findOne(User, {
    $or: [
      { username: identifier.toLowerCase() },
      { email: identifier.toLowerCase() },
    ],
  })
  if (!user) throw new Error("No account has that username or email.")
  await em.transactional(async (tx) => {
    await tx.nativeDelete(OauthAccessToken, { user: user.id })
    await tx.nativeDelete(OauthRefreshToken, { user: user.id })
    await tx.nativeDelete(OauthConsent, { user: user.id })
    await tx.nativeDelete(Session, { user: user.id })
    await tx.nativeDelete(TwoFactor, { user: user.id })
    await tx.nativeUpdate(User, { id: user.id }, { twoFactorEnabled: false })
  })
}
