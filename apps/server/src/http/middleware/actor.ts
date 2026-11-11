import { createMiddleware } from "hono/factory"
import type { AppEnv } from "../../core/context.ts"
import { actorOf, withActor } from "../../services/webhooks/actor.ts"

/**
 * Remembers who sent each request while it runs, so the webhook events it
 * records say who did it, how and with which key. It goes after sign-in.
 */
export function rememberActor() {
  return createMiddleware<AppEnv>(async (c, next) => {
    const actor = actorOf(c.var.user, c.var.credential, c.req.path)
    await withActor(actor, next)
  })
}
