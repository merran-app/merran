import { Webhook } from "standardwebhooks"
import { describe, expect, it } from "vitest"
import { envelopeBody } from "./envelope.js"
import { newWebhookSecret, signatureHeader } from "./signing.js"

describe("signing", () => {
  it("signs the Standard Webhooks example", () => {
    const header = signatureHeader({
      id: "msg_p5jXN8AQM9LWM0D4loKWxJek",
      timestamp: 1614265330,
      body: '{"test": 2432232314}',
      secrets: ["whsec_MfKQ9r8GKYqrTwjUPD8ILPZIo2LaLaSw"],
    })

    expect(header).toBe("v1,g0hM9SsE+OTPJTGt/tmIKtSyZlE3uFJELVlNIOLJ1OE=")
  })

  it("two secrets give two signatures, each verifiable", () => {
    const secrets = [newWebhookSecret(), newWebhookSecret()]
    const id = "msg_test"
    const timestamp = Math.floor(Date.now() / 1000)
    const body = '{"hello":"world"}'

    const header = signatureHeader({ id, timestamp, body, secrets })

    expect(header.split(" ")).toHaveLength(2)
    for (const secret of secrets) {
      expect(() =>
        new Webhook(secret).verify(body, {
          "webhook-id": id,
          "webhook-timestamp": String(timestamp),
          "webhook-signature": header,
        })
      ).not.toThrow()
    }
  })

  it("a new secret is whsec_ and 32 random bytes", () => {
    const secret = newWebhookSecret()

    expect(secret).toMatch(/^whsec_[A-Za-z0-9+/]{43}=$/)
    expect(Buffer.from(secret.slice("whsec_".length), "base64")).toHaveLength(
      32
    )
    expect(newWebhookSecret()).not.toBe(secret)
  })

  it("the body is the type, when it happened and the data", () => {
    const body = envelopeBody({
      type: "recipe.created",
      createdAt: new Date("2026-11-10T18:04:12.511Z"),
      payload: { a: 1 },
    })

    expect(body).toBe(
      '{"type":"recipe.created","timestamp":"2026-11-10T18:04:12.511Z","data":{"a":1}}'
    )
  })
})
