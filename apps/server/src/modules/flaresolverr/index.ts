import type { Module } from "../module.ts"
import { FLARESOLVERR } from "./settings.ts"

/**
 * FlareSolverr: the server admin's own, beside Merran, for importing links
 * from sites that turn servers away. Off until it has an address; Merran's
 * background reads never use it.
 */
export const flaresolverr: Module = {
  id: "flaresolverr",
  settings: Object.values(FLARESOLVERR),

  async status({ settings }) {
    return (await settings.server(FLARESOLVERR.url))
      ? { on: true }
      : { on: false, needs: "url" }
  },
}
