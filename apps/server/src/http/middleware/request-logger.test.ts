import { describe, expect, test } from "vitest"
import { loggablePath } from "./request-logger.ts"

const TOKEN = "q1w2e3r4t5y6u7i8o9p0a1s2d3f4g5h6j7k8l9z0x1c"

describe("the path a request is logged with", () => {
  test.each([
    [`/api/plan/calendar/feed/${TOKEN}`, "/api/plan/calendar/feed/[redacted]"],
    [`/api/shared/${TOKEN}`, "/api/shared/[redacted]"],
    [`/api/shared/${TOKEN}/photo`, "/api/shared/[redacted]/photo"],
    [`/r/${TOKEN}`, "/r/[redacted]"],
    [`/r/${TOKEN}/cook`, "/r/[redacted]/cook"],
  ])("leaves the token out of %s", (path, logged) => {
    expect(loggablePath(path)).toBe(logged)
    expect(loggablePath(path)).not.toContain(TOKEN)
  })

  test("keeps every other path as it is", () => {
    for (const path of [
      "/api/recipes/lemon-pasta",
      "/api/shared",
      "/recipes",
    ]) {
      expect(loggablePath(path)).toBe(path)
    }
  })
})
