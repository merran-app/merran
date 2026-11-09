import type { MiddlewareHandler } from "hono"
import type { Logger } from "pino"
import type { AppEnv } from "../../core/context.ts"

/**
 * Links that are themselves credentials: a calendar feed's token, and a shared
 * recipe's, in the API and in the web pages that show it.
 */
const SECRET_PATHS = [
  /^(\/api\/plan\/calendar\/feed\/)[^/]+/,
  /^(\/api\/shared\/)[^/]+/,
  /^(\/r\/)[^/]+/,
]

/** A request's path as it may be logged: link tokens left out. */
export function loggablePath(path: string) {
  for (const secret of SECRET_PATHS) {
    if (secret.test(path)) return path.replace(secret, "$1[redacted]")
  }
  return path
}

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
        path: loggablePath(c.req.path),
        status: c.res.status,
        ms: Math.round(performance.now() - started),
      },
      "request"
    )
  }
}
