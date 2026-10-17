import assert from "node:assert/strict"
import test from "node:test"
import { readSettings, renderSettings } from "./settings-reference.mjs"

test("registered settings resolve source constants and exclude internal state", () => {
  const settings = readSettings()
  const byKey = new Map(settings.map((s) => [s.key, s]))
  assert.equal(byKey.get("server.port").default, 3000)
  assert.equal(byKey.get("server.port").envOnly, true)
  assert.deepEqual(byKey.get("stores.leanOnSales").choices, [
    "off",
    "some",
    "lots",
  ])
  assert.equal(byKey.get("photos.style").level, "household")
  for (const key of [
    "ai.policy",
    "ai.envKeys",
    "telemetry.installId",
    "updates.latest",
  ])
    assert.equal(byKey.has(key), false)
  for (const setting of settings.filter((s) => s.kind === "secret"))
    assert.equal(setting.default, null)
  const page = renderSettings(settings)
  assert.doesNotMatch(page, /¢|1\.5|4¢/)
  assert.match(page, /provider charges/i)
  assert.match(page, /apps\/server\/src\/modules\/stores\/settings.ts/)
})
