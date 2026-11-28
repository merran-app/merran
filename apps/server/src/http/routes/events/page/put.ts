import { createRoute, z } from "@hono/zod-openapi"
import type { AppDeps } from "../../../../core/context.ts"
import { LIVE_PAGES } from "../../../../services/events/events.ts"
import { inHousehold } from "../../../middleware/auth.ts"
import type { Router } from "../../../router.ts"
import {
  SESSION_SECURITY,
  SIGNED_IN_ERRORS,
} from "../../../schemas/responses.ts"

const route = createRoute({
  method: "put",
  path: "/events/page",
  operationId: "openPage",
  tags: ["Live"],
  summary: "Say which page is open",
  description:
    "Says which page this device has open, on its live stream that's open already (the same `client`), so who's on the list or the plan changes without connecting again. A device with no stream open says its page when it connects.",
  // A key isn't a person on a page.
  security: SESSION_SECURITY,
  request: {
    body: {
      required: true,
      content: {
        "application/json": {
          schema: z
            .object({
              client: z.string().min(1).max(64).openapi({
                description: "This device's id, as it connected with.",
              }),
              page: z.enum(LIVE_PAGES).nullable().openapi({
                description: "The page open, or null for any other.",
              }),
            })
            .openapi({ example: { client: "kyle-laptop", page: "list" } }),
        },
      },
    },
  },
  responses: {
    204: { description: "Noted." },
    ...SIGNED_IN_ERRORS,
  },
})

export default (router: Router, { events }: AppDeps) => {
  router.openapi(route, (c) => {
    const { householdId, userId } = inHousehold(c)
    const { client, page } = c.req.valid("json")
    events.movePage(householdId, { personId: userId, client }, page)
    return c.body(null, 204)
  })
}
