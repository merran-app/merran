import { createRoute } from "@hono/zod-openapi"
import type { AppDeps } from "../../../../core/context.ts"
import { openSessions } from "../../../../services/cooking/sessions.ts"
import { inHousehold, openToKeys } from "../../../middleware/auth.ts"
import type { Router } from "../../../router.ts"
import { CookingSessionsSchema } from "../../../schemas/cooking.ts"
import { jsonResponse, SIGNED_IN_ERRORS } from "../../../schemas/responses.ts"

const route = createRoute({
  method: "get",
  path: "/cooking/sessions",
  operationId: "listCookingSessions",
  tags: ["Cooking"],
  summary: "Who's cooking now",
  description:
    "Everyone in the household cooking now, in cook view, earliest first, with what they're cooking and their running timers. Cook view never reads this: it's for a sensor in Home Assistant or a kitchen display. Sessions end when cooking does, so an empty list means nobody's cooking.",
  ...openToKeys("plan", "read"),
  responses: {
    200: jsonResponse(CookingSessionsSchema, "Who's cooking now."),
    ...SIGNED_IN_ERRORS,
  },
})

export default (router: Router, _deps: AppDeps) => {
  router.openapi(route, async (c) => {
    const { em } = inHousehold(c)
    return c.json({ sessions: await openSessions(em) }, 200)
  })
}
