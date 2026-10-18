import { describe, expect, test } from "vitest"
import {
  rangeOf,
  rangesOf,
  TELEMETRY_BANDS,
  TelemetryReportSchema,
  type TelemetryReport,
} from "./report.ts"

test("counts are sent only as ranges", () => {
  const bands = [1, 5, 20]
  expect(rangeOf(0, bands)).toBe("0")
  expect(rangeOf(1, bands)).toBe("1")
  expect(rangeOf(2, bands)).toBe("2-5")
  expect(rangeOf(5, bands)).toBe("2-5")
  expect(rangeOf(6, bands)).toBe("6-20")
  expect(rangeOf(21, bands)).toBe("21+")
  expect(rangeOf(450, [99, 499, 1999])).toBe("100-499")
})

test("every range a count can give is known", () => {
  expect(rangesOf(TELEMETRY_BANDS.households)).toEqual([
    "0",
    "1",
    "2-5",
    "6-20",
    "21+",
  ])
  expect(rangesOf(TELEMETRY_BANDS.recipes)).toEqual([
    "0",
    "1-99",
    "100-499",
    "500-1999",
    "2000+",
  ])
  for (const count of [0, 1, 3, 99, 100, 2000, 1_000_000]) {
    expect(rangesOf(TELEMETRY_BANDS.recipes)).toContain(
      rangeOf(count, TELEMETRY_BANDS.recipes)
    )
  }
})

describe("a summary", () => {
  const report: TelemetryReport = {
    installId: "6f1c3e1a-0b6e-4d2a-9a43-3f6d2b8f0c11",
    version: "0.1.0-alpha.2",
    install: "docker",
    arch: "arm64",
    database: "postgres 18",
    modules: { ai: true, errorTracking: false },
    aiProviders: ["anthropic", "openai-compatible"],
    households: "1",
    people: "2-5",
    recipes: "100-499",
  }
  const check = (changes: Record<string, unknown>) =>
    TelemetryReportSchema.safeParse({ ...report, ...changes }).success

  test("is taken as the server sends it", () => {
    expect(check({})).toBe(true)
    expect(check({ version: "0.0.0-edge.1a2b3c4" })).toBe(true)
  })

  test("from 0.1.0-alpha.1, without AI providers, is taken too", () => {
    const { aiProviders: _, ...first } = report
    expect(TelemetryReportSchema.safeParse(first).success).toBe(true)
  })

  test("is refused with anything it doesn't know", () => {
    expect(check({ hostname: "kitchen" })).toBe(false)
    expect(check({ installId: "kitchen" })).toBe(false)
    expect(check({ version: "latest" })).toBe(false)
    expect(check({ install: "helm" })).toBe(false)
    expect(check({ database: "mysql" })).toBe(false)
    expect(check({ people: "7" })).toBe(false)
    expect(check({ modules: { "Not An Id": true } })).toBe(false)
    expect(check({ aiProviders: ["anthropic", "anthropic"] })).toBe(false)
  })
})
