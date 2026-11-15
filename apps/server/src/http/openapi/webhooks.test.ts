import { WEBHOOK_EVENTS } from "@merran/shared"
import { describe, expect, test } from "vitest"
import { webhookEnvelopeSchema } from "../../services/webhooks/payloads.ts"
import { exampleIn, type Operation } from "../../test/api-reference.ts"
import { createOpenApiFile } from "./file.ts"

type Spec = {
  webhooks?: Record<string, { post?: Operation }>
  components?: { schemas?: Record<string, unknown> }
}

describe("webhook events in the API reference", () => {
  test("every event is in the spec's webhooks section", async () => {
    const spec = JSON.parse(await createOpenApiFile()) as Spec
    const webhooks = spec.webhooks ?? {}

    expect(Object.keys(webhooks)).toEqual(
      WEBHOOK_EVENTS.map((event) => event.type)
    )

    for (const { type } of WEBHOOK_EVENTS) {
      const operation = webhooks[type]?.post
      const body = operation?.requestBody?.content?.["application/json"]
      expect(body?.schema, `${type} needs a body`).toBeTruthy()

      const headers = operation?.parameters
        ?.filter((parameter) => parameter.in === "header")
        .map((parameter) => parameter.name)
      expect(headers).toEqual([
        "webhook-id",
        "webhook-timestamp",
        "webhook-signature",
      ])

      // What the reference shows must be something a delivery can send.
      const example = exampleIn(body, spec.components?.schemas ?? {})
      expect(example, `${type} needs an example`).toBeDefined()
      expect(() => webhookEnvelopeSchema(type).parse(example)).not.toThrow()
    }
  })
})
