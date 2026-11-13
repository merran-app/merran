import { configureWebhooks } from "../../services/webhooks/state.ts"
import type { Module } from "../module.ts"
import { WEBHOOKS } from "./settings.ts"

/**
 * Webhooks: households tell their own tools, like Home Assistant and n8n,
 * when things happen. On unless the server's administrator turns it off.
 */
export const webhooks: Module = {
  id: "webhooks",
  settings: Object.values(WEBHOOKS),
  capabilities: ["webhooks"],

  async status({ settings }) {
    return (await settings.server(WEBHOOKS.enabled))
      ? { on: true }
      : { on: false, needs: "switch" }
  },

  async apply({ config, settings }) {
    configureWebhooks({
      enabled: await settings.server(WEBHOOKS.enabled),
      publicUrl: config.publicUrl ?? null,
    })
  },
}
