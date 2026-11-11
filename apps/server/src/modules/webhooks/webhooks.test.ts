import { afterEach, expect, test } from "vitest"
import { createTestApp } from "../../test/app.ts"
import {
  configureWebhooks,
  linkBase,
  webhooksEnabled,
} from "../../services/webhooks/state.ts"

// Webhooks are on unless the server's administrator turns them off, and the
// state they keep is shared, so each test puts it back.
afterEach(() => configureWebhooks({ enabled: true, publicUrl: null }))

test("the webhooks capability is on by default", async () => {
  const { app, close } = await createTestApp({
    publicUrl: "http://merran.test",
  })
  try {
    const response = await app.request("/api/capabilities")
    expect(
      ((await response.json()) as { capabilities: string[] }).capabilities
    ).toContain("webhooks")
    expect(webhooksEnabled()).toBe(true)
    expect(linkBase()).toBe("http://merran.test")
  } finally {
    await close()
  }
})

test("MERRAN_WEBHOOKS=false turns it off", async () => {
  const { app, close } = await createTestApp({
    env: { MERRAN_WEBHOOKS: "false" },
  })
  try {
    const response = await app.request("/api/capabilities")
    expect(
      ((await response.json()) as { capabilities: string[] }).capabilities
    ).not.toContain("webhooks")
    expect(webhooksEnabled()).toBe(false)
  } finally {
    await close()
  }
})
