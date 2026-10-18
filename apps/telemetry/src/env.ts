import type { Hono } from "hono"

// What Cloudflare gives the Worker (wrangler.jsonc). Only the parts the
// receiver uses are typed here, so the same code runs on Node's SQLite in
// tests, and could move to Node and SQLite anywhere (docs/telemetry.md).

/** The part of Cloudflare's D1 the receiver uses. */
export interface Database {
  prepare(query: string): Statement
  /** Runs the statements in one transaction. */
  batch(statements: Statement[]): Promise<unknown[]>
}

export interface Statement {
  bind(...values: (string | number | null)[]): Statement
  first<T>(): Promise<T | null>
  all<T>(): Promise<{ results: T[] }>
  run(): Promise<unknown>
}

/**
 * Cloudflare's rate limiting binding: approximate, counted in memory at each
 * Cloudflare location.
 */
export interface RateLimiter {
  limit(options: { key: string }): Promise<{ success: boolean }>
}

export type Env = {
  DB: Database
  /** Not there outside Cloudflare, as in tests. */
  REPORT_LIMIT?: RateLimiter
}

export type Router = Hono<{ Bindings: Env }>
