import { createApp } from "./app.ts"
import { runDaily } from "./daily/run.ts"
import type { Env } from "./env.ts"

// The Worker (wrangler.jsonc): requests go to the routes, and the nightly
// cron works out the totals.

const app = createApp()

export default {
  fetch: app.fetch,
  scheduled(
    controller: { scheduledTime: number },
    env: Env,
    ctx: { waitUntil(promise: Promise<unknown>): void }
  ) {
    ctx.waitUntil(runDaily(env, new Date(controller.scheduledTime)))
  },
}
