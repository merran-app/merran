import { IsolationLevel } from "@mikro-orm/core"
import type { EntityManager } from "@mikro-orm/sql"
import { Account, User } from "../../database/entities/index.ts"
import { AppError } from "../../core/errors.ts"
import { createHousehold } from "../households/households.ts"
import type { Auth } from "./auth.ts"
import type { NewAccount } from "./accounts.ts"

/** All first-run records commit together; auth supplies the password format. */
export async function claimServer(
  em: EntityManager,
  auth: Auth,
  account: NewAccount & { household: string }
) {
  const password = await (await auth.$context).password.hash(account.password)
  return em.transactional(
    async (tx) => {
      if (await tx.count(User))
        throw new AppError(
          "conflict",
          "already_set_up",
          "This server is already set up. Sign in instead."
        )
      const user = tx.create(User, {
        name: account.name.trim(),
        email: account.email.trim().toLowerCase(),
        username: account.username.trim().toLowerCase(),
        displayUsername: account.username.trim(),
        role: "admin",
      })
      await tx.flush()
      tx.create(Account, {
        user,
        accountId: user.id,
        providerId: "credential",
        password,
      })
      const household = await createHousehold(tx, {
        name: account.household,
        ownerId: user.id,
      })
      return { user, household }
    },
    { isolationLevel: IsolationLevel.SERIALIZABLE }
  )
}
