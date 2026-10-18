import type { Module } from "../module.ts"
import { EMAIL } from "./settings.ts"
import { emailConfiguration } from "./sender.ts"
import { invitationOrigin } from "./invitations.ts"

export const email: Module = {
  id: "email",
  settings: Object.values(EMAIL),
  async capabilities({ config }) {
    try {
      invitationOrigin(config.publicUrl)
      return ["email.invites"]
    } catch {
      return []
    }
  },
  async status({ settings }) {
    const config = await emailConfiguration(settings)
    return config.on ? { on: true } : { on: false, needs: config.needs }
  },
}
