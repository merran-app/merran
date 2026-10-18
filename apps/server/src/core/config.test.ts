import { describe, expect, test } from "vitest"
import { loadConfig } from "./config.ts"
import { rmSync } from "node:fs"

describe("settings", () => {
  test("development setup uses new temporary SQLite storage, ignoring the real database", () => {
    const a = loadConfig({
      MERRAN_DEV_SETUP: "on",
      DATABASE_URL: "postgres://localhost/real",
    })
    const b = loadConfig({ MERRAN_DEV_SETUP: "on" })
    try {
      expect(a.database.kind).toBe("sqlite")
      expect(a.dataDir).not.toBe(b.dataDir)
      expect(a.secret).toBeUndefined()
      expect(loadConfig({}).devSetup).toBe(false)
    } finally {
      for (const path of [a.dataDir, b.dataDir]) {
        if (!/[\\/]merran-setup-[^\\/]+$/.test(path))
          throw new Error("Unexpected temporary path")
        rmSync(path, { recursive: true, force: true })
      }
    }
  })
  test("development setup is rejected in production and Docker", () => {
    expect(() =>
      loadConfig({ MERRAN_DEV_SETUP: "on", NODE_ENV: "production" })
    ).toThrow("only available")
    expect(() =>
      loadConfig({ MERRAN_DEV_SETUP: "on", MERRAN_INSTALL_METHOD: "docker" })
    ).toThrow("only available")
  })
  test("nothing needs setting", () => {
    const config = loadConfig({})

    expect(config.port).toBe(3000)
    expect(config.logLevel).toBe("info")
    expect(config.version).toMatch(/^\d+\.\d+\.\d+/)
  })

  test("an empty variable counts as not set", () => {
    expect(loadConfig({ PORT: "" }).port).toBe(3000)
  })

  test("values are read and checked", () => {
    const config = loadConfig({
      PORT: "8080",
      MERRAN_LOG_LEVEL: "debug",
      MERRAN_LOG_FORMAT: "json",
    })

    expect(config).toMatchObject({
      port: 8080,
      logLevel: "debug",
      logFormat: "json",
    })
  })

  test("everything wrong is listed at once", () => {
    expect(() =>
      loadConfig({ PORT: "eighty", MERRAN_LOG_LEVEL: "loud" })
    ).toThrow(/PORT[\s\S]*MERRAN_LOG_LEVEL/)
  })

  test("module settings set in the environment are kept, to lock them", () => {
    const config = loadConfig({
      MERRAN_SENTRY_ENVIRONMENT: "nas",
      MERRAN_TELEMETRY: "off",
    })

    expect(Object.fromEntries(config.fromEnv)).toEqual({
      "errorTracking.environment": "nas",
      "telemetry.enabled": false,
    })
  })

  test("module settings are checked at startup too", () => {
    expect(() =>
      loadConfig({ PORT: "eighty", MERRAN_SENTRY_SAMPLE_RATE: "2" })
    ).toThrow(/PORT[\s\S]*MERRAN_SENTRY_SAMPLE_RATE: Use a number from 0 to 1/)
  })

  test("trusted proxies are a list of addresses and ranges", () => {
    expect(
      loadConfig({ MERRAN_TRUSTED_PROXIES: "172.16.0.0/12, 127.0.0.1" })
        .trustedProxies
    ).toEqual(["172.16.0.0/12", "127.0.0.1"])
    expect(() => loadConfig({ MERRAN_TRUSTED_PROXIES: "my-proxy" })).toThrow(
      /MERRAN_TRUSTED_PROXIES/
    )
  })
})
