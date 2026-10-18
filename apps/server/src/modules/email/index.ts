import type { Module } from "../module.ts"
import { EMAIL } from "./settings.ts"
import { emailConfiguration } from "./sender.ts"

export const email: Module = {
  id: "email",
  settings: Object.values(EMAIL),
  // Invitations and recovery expose their capabilities when their flows are built.
  async status({ settings }) {
    const config = await emailConfiguration(settings)
    return config.on ? { on: true } : { on: false, needs: config.needs }
  },
}
