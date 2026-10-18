import { readFileSync } from "node:fs"
import { join } from "node:path"
import { loadConfig } from "../core/config.ts"
import { User } from "../database/entities/index.ts"
import { openDatabase } from "../database/orm.ts"

/** Reads the running server's code, never generates a different one. */
export async function showSetupCode() {
  const config = loadConfig()
  if (config.devSetup) {
    console.error(
      "Development setup uses a temporary directory. Read its code in the startup log, or unset MERRAN_DEV_SETUP and set MERRAN_DATA_DIR to the logged directory for this command."
    )
    return 1
  }
  const database = await openDatabase(config.database)
  try {
    if (await database.em.fork().count(User)) {
      console.error(
        "This server is already set up. Sign in, or use merran reset-password <username>."
      )
      return 1
    }
    let code: string
    try {
      code = readFileSync(join(config.dataDir, "setup-code"), "utf8").trim()
    } catch {
      console.error(
        "No active setup code. Start Merran and use its data directory."
      )
      return 1
    }
    if (
      !/^[23456789ABCDEFGHJKMNPQRSTUVWXYZ]{4}(-[23456789ABCDEFGHJKMNPQRSTUVWXYZ]{4}){2}$/.test(
        code
      )
    )
      throw new Error("The setup-code file isn't valid. Restart Merran.")
    console.log(`MERRAN SETUP CODE: ${code}`)
    return 0
  } finally {
    await database.close()
  }
}
