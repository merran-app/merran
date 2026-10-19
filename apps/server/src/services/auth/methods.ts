import type { EntityManager } from "@mikro-orm/sql"
import {
  Account,
  Passkey,
  Session,
  User,
} from "../../database/entities/index.ts"
import { AppError } from "../../core/errors.ts"

type Method = { accountId: string } | { passkeyId: string }
type EnabledMethods = { passkeys: boolean; oidc: boolean; passwords: boolean }

/** Check and remove together so simultaneous requests cannot remove both final methods. */
export async function removeSignInMethod(
  em: EntityManager,
  userId: string,
  sessionId: string,
  removed: Method,
  enabled: EnabledMethods,
  freshAgeSeconds: number
) {
  await em.transactional(async (tx) => {
    // Acquire a write lock before reading methods on both SQLite and Postgres.
    await tx.nativeUpdate(User, { id: userId }, { updatedAt: new Date() })
    const session = await tx.findOne(Session, { id: sessionId, user: userId })
    if (!session || session.expiresAt <= new Date()) {
      throw new AppError("unauthorized", "signed_out", "Sign in first.")
    }
    if (
      "accountId" in removed &&
      freshAgeSeconds > 0 &&
      Date.now() - session.createdAt.getTime() >= freshAgeSeconds * 1000
    ) {
      throw new AppError(
        "unauthorized",
        "session_not_fresh",
        "Sign in again before unlinking an account."
      )
    }
    const owned =
      "accountId" in removed
        ? await tx.findOne(Account, { id: removed.accountId, user: userId })
        : await tx.findOne(Passkey, { id: removed.passkeyId, user: userId })
    if (!owned) {
      throw new AppError(
        "not_found",
        "sign_in_method_not_found",
        "That sign-in method no longer exists."
      )
    }
    await assertCanRemoveMethod(tx, userId, removed, enabled)
    if ("accountId" in removed) {
      await tx.nativeDelete(Account, { id: removed.accountId, user: userId })
    } else {
      await tx.nativeDelete(Passkey, { id: removed.passkeyId, user: userId })
    }
  })
}

/** Count usable methods, not just linked rows: a disabled provider cannot be a fallback. */
export async function assertCanRemoveMethod(
  em: EntityManager,
  userId: string,
  removed: { accountId?: string; passkeyId?: string },
  enabled: EnabledMethods
) {
  const accounts = await em.find(Account, { user: userId })
  if (
    accounts.some(
      (account) =>
        account.id !== removed.accountId &&
        ((account.providerId === "credential" &&
          enabled.passwords &&
          !!account.password) ||
          (account.providerId === "oidc" && enabled.oidc))
    )
  )
    return
  if (
    enabled.passkeys &&
    (await em.count(Passkey, {
      user: userId,
      ...(removed.passkeyId ? { id: { $ne: removed.passkeyId } } : {}),
    }))
  )
    return
  throw new AppError(
    "forbidden",
    "last_sign_in_method",
    "Add another working sign-in method before removing this one."
  )
}
