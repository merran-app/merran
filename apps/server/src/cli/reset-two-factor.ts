import { loadConfig } from "../core/config.ts"
import { openDatabase } from "../database/orm.ts"
import { resetSecondFactor } from "../services/auth/recover.ts"

export async function resetAccountSecondFactor(args: string[]) {
  if (args.length !== 1)
    throw new Error("Usage: merran reset-two-factor <username-or-email>")
  const config = loadConfig()
  if (config.devSetup)
    throw new Error(
      "Unset MERRAN_DEV_SETUP and use the running server's data directory."
    )
  const database = await openDatabase(config.database)
  try {
    await resetSecondFactor(database.em.fork(), args[0]!)
    console.log(
      "Authenticator removed. Sessions and connected app grants were revoked. Sign in again to enroll a new authenticator."
    )
    return 0
  } finally {
    await database.close()
  }
}
