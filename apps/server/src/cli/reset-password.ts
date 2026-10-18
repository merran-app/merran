import { emitKeypressEvents } from "node:readline"
import { loadConfig } from "../core/config.ts"
import { loadSecret } from "../core/secret.ts"
import { openDatabase } from "../database/orm.ts"
import { createAuth } from "../services/auth/auth.ts"
import { resetPassword } from "../services/auth/reset-password.ts"

/** No echo, command arguments or environment variables containing passwords. */
function hiddenPrompt(label: string): Promise<string> {
  const input = process.stdin
  if (!input.isTTY)
    throw new Error(
      "Use an interactive terminal: docker exec -it merran merran reset-password <username>."
    )
  process.stdout.write(label)
  emitKeypressEvents(input)
  const wasRaw = input.isRaw
  input.setRawMode(true)
  input.resume()
  return new Promise((resolve, reject) => {
    let value = ""
    const done = () => {
      input.off("keypress", keypress)
      input.setRawMode(wasRaw)
      input.pause()
      process.stdout.write("\n")
    }
    const keypress = (
      text: string | undefined,
      key: { name?: string; ctrl?: boolean }
    ) => {
      if (key.ctrl && key.name === "c") {
        done()
        reject(new Error("Cancelled."))
        return
      }
      if (key.name === "return" || key.name === "enter") {
        done()
        resolve(value)
        return
      }
      if (key.name === "backspace") value = [...value].slice(0, -1).join("")
      else if (text && !key.ctrl && !/[\x00-\x1f\x7f]/.test(text)) value += text
    }
    input.on("keypress", keypress)
  })
}

export async function resetAccountPassword(args: string[]) {
  if (args.length !== 1)
    throw new Error("Usage: merran reset-password <username-or-email>")
  if (!process.stdin.isTTY)
    throw new Error(
      "Password reset needs an interactive terminal (-it in Docker)."
    )
  const password = await hiddenPrompt("New password (10 to 128 characters): ")
  if (password !== (await hiddenPrompt("Confirm new password: ")))
    throw new Error("Passwords don't match. Nothing changed.")
  const config = loadConfig()
  if (config.devSetup)
    throw new Error(
      "Unset MERRAN_DEV_SETUP and set MERRAN_DATA_DIR to the temporary directory printed at startup."
    )
  const database = await openDatabase(config.database)
  try {
    const auth = createAuth({ config, database, secret: loadSecret(config) })
    await resetPassword(database.em.fork(), auth, args[0]!, password)
    console.log("Password changed. All signed-in devices were signed out.")
    return 0
  } finally {
    await database.close()
  }
}
