import type { EntityManager } from "@mikro-orm/sql"
import {
  Account,
  Session,
  User,
  OauthAccessToken,
  OauthRefreshToken,
  OauthConsent,
} from "../../database/entities/index.ts"
import { AppError } from "../../core/errors.ts"
import type { Auth } from "./auth.ts"

/** Use the auth service's password format, then revoke all signed-in devices. */
export async function resetPassword(
  em: EntityManager,
  auth: Auth,
  identifier: string,
  password: string
) {
  if (password.length < 10 || password.length > 128)
    throw new Error("Use a password of 10 to 128 characters.")
  const user = await em.findOne(User, {
    $or: [
      { username: identifier.toLowerCase() },
      { email: identifier.toLowerCase() },
    ],
  })
  if (!user)
    throw new AppError(
      "not_found",
      "user_not_found",
      "No account has that username or email."
    )
  const hash = await (await auth.$context).password.hash(password)
  await em.transactional(async (tx) => {
    const account = await tx.findOne(Account, {
      user: user.id,
      providerId: "credential",
    })
    if (account) account.password = hash
    else
      tx.create(Account, {
        user: user.id,
        providerId: "credential",
        accountId: user.id,
        password: hash,
      })
    await tx.nativeDelete(OauthAccessToken, { user: user.id })
    await tx.nativeDelete(OauthRefreshToken, { user: user.id })
    await tx.nativeDelete(OauthConsent, { user: user.id })
    await tx.nativeDelete(Session, { user: user.id })
  })
}
