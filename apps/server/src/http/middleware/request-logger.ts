import type { MiddlewareHandler } from "hono"
import type { Logger } from "pino"
import type { AppEnv } from "../../core/context.ts"

/** Gives each request a logger tagged with its id, and logs how it went. */
export function requestLogger(logger: Logger): MiddlewareHandler<AppEnv> {
  return async (c, next) => {
    const log = logger.child({ requestId: c.var.requestId })
    c.set("logger", log)
    const started = performance.now()
    await next()
    log.info(
      {
        method: c.req.method,
        // A calendar feed URL is itself a credential; keep it out of logs.
        path: c.req.path.startsWith("/api/plan/calendar/feed/")
          ? "/api/plan/calendar/feed/[redacted]"
          : c.req.path,
        status: c.res.status,
        ms: Math.round(performance.now() - started),
      },
      "request"
    )
  }
}
