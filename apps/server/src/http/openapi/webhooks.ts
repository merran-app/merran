import { z, type OpenAPIHono } from "@hono/zod-openapi"
import { WEBHOOK_EVENTS } from "@merran/shared"
import type { AppEnv } from "../../core/context.ts"
import {
  WEBHOOK_SUMMARIES,
  webhookEnvelopeSchema,
} from "../../services/webhooks/payloads.ts"

type Registry = OpenAPIHono<AppEnv>["openAPIRegistry"]

/** The headers every delivery carries, in the Standard Webhooks format. */
const DeliveryHeadersSchema = z.object({
  "webhook-id": z.string().openapi({
    description:
      "This delivery's id. It stays the same on every retry, so a receiver can use it to ignore one it has handled already.",
    example: "msg_2KWPBgLlAfxdpx2AI54pPJ85f4W",
  }),
  "webhook-timestamp": z.string().openapi({
    description:
      "When this attempt was sent, in seconds since 1970. It changes on every retry. Receivers should refuse one that's far from now.",
    example: "1731268800",
  }),
  "webhook-signature": z.string().openapi({
    description:
      "`v1,` and a base64 HMAC-SHA256 signature of `{webhook-id}.{webhook-timestamp}.{body}`, made with the webhook's secret. Several, separated by spaces, while a secret is being replaced.",
    example: "v1,K5oZfzN95Z9UVu1EsfQmfVNQhnkZ2pj9o9NDN/H/pI4=",
  }),
})

/**
 * Describes each webhook event in the spec's `webhooks` section, so the
 * API reference shows what a receiver gets. Pass the top-level app's
 * registry, never the `/api` router's: mounting a router prefixes what it
 * holds with its path, and the events would become `/api/recipe.created`.
 */
export function registerWebhookEvents(registry: Registry): void {
  for (const { type } of WEBHOOK_EVENTS) {
    const { summary, description } = WEBHOOK_SUMMARIES[type]
    registry.registerWebhook({
      method: "post",
      // A webhook is keyed by its name, which is the event's.
      path: type,
      summary,
      description,
      request: {
        headers: DeliveryHeadersSchema,
        body: {
          content: {
            "application/json": { schema: webhookEnvelopeSchema(type) },
          },
        },
      },
      responses: {
        200: {
          description:
            "Any 2xx answer counts as delivered. 410 Gone pauses the webhook.",
        },
      },
    })
  }
}
