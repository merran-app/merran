import { describe, expect, test } from "vitest"
import { JobStopped } from "./runner.ts"
import { stopSignal, timeLimit, withStopSignal } from "./stop.ts"

describe("a job's stop signal", () => {
  test("is there for everything the job calls, and only for it", async () => {
    const controller = new AbortController()
    expect(stopSignal()).toBeUndefined()
    await withStopSignal(controller.signal, async () => {
      await Promise.resolve()
      expect(stopSignal()).toBe(controller.signal)
    })
    expect(stopSignal()).toBeUndefined()
  })

  test("ends a time limit when the job stops, with the job's reason", () => {
    const controller = new AbortController()
    withStopSignal(controller.signal, () => {
      const signal = timeLimit(60_000)
      expect(signal.aborted).toBe(false)
      controller.abort(new JobStopped("cancelled"))
      expect(signal.aborted).toBe(true)
      expect(signal.reason).toBeInstanceOf(JobStopped)
    })
  })

  test("leaves a time limit outside a job to its time", async () => {
    const signal = timeLimit(10)
    expect(signal.aborted).toBe(false)
    await new Promise((resolve) => setTimeout(resolve, 30))
    expect(signal.aborted).toBe(true)
    expect((signal.reason as Error).name).toBe("TimeoutError")
  })
})
