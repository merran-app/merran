import { AsyncLocalStorage } from "node:async_hooks"

// A job's stop signal, for everything it calls. The runner runs each job
// inside `withStopSignal`, so Stop reaches every fetch and AI call a job
// makes, those added later included, without a signal passed through every
// function on the way: as `withActor` does for who made a change.

const storage = new AsyncLocalStorage<AbortSignal>()

/** Runs `run` with the job's stop signal there for whatever it calls. */
export function withStopSignal<T>(signal: AbortSignal, run: () => T): T {
  return storage.run(signal, run)
}

/** The stop signal of the job this is running in; none in a request. */
export function stopSignal(): AbortSignal | undefined {
  return storage.getStore()
}

/**
 * A signal that aborts after `ms`, or as soon as the job running this is
 * stopped, with the job's reason. Outside a job, just the time limit.
 */
export function timeLimit(ms: number): AbortSignal {
  const timeout = AbortSignal.timeout(ms)
  const stop = stopSignal()
  return stop ? AbortSignal.any([stop, timeout]) : timeout
}

/** Throws the job's reason, if the job running this has been stopped. */
export function throwIfStopped() {
  const stop = stopSignal()
  if (stop?.aborted) throw stop.reason
}
