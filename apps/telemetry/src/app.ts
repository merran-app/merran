import { Hono } from "hono"
import type { Env } from "./env.ts"
import routes from "./routes/index.ts"

/** The receiver's routes (docs/telemetry.md, "The API"). */
export function createApp() {
  const app = new Hono<{ Bindings: Env }>()
  routes(app)
  app.notFound((c) => c.json({ error: "There's nothing here." }, 404))
  app.onError((err, c) => {
    console.error(err)
    return c.json({ error: "Something went wrong." }, 500)
  })
  return app
}
