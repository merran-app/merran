import type { Context } from "hono"
import type { Env } from "./env.ts"

type C = Context<{ Bindings: Env }>

/**
 * Whether this address has sent too much in the past minute. The address is
 * only the rate limiter's key: Cloudflare counts it in memory, and the
 * receiver never keeps it.
 */
export async function tooMany(c: C) {
  const limiter = c.env.REPORT_LIMIT
  if (!limiter) return false
  const key = c.req.header("cf-connecting-ip") ?? "unknown"
  return !(await limiter.limit({ key })).success
}

export function slowDown(c: C) {
  c.header("Retry-After", "60")
  return c.json(
    { error: "Too much from one place. Try again in a minute." },
    429
  )
}

/** The body as text, or null if it's more than `max` bytes. */
export async function readBody(request: Request, max: number) {
  if (Number(request.headers.get("content-length") ?? 0) > max) return null
  if (!request.body) return ""
  const reader = request.body.getReader()
  const chunks: Uint8Array[] = []
  let size = 0
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    size += value.byteLength
    if (size > max) {
      await reader.cancel()
      return null
    }
    chunks.push(value)
  }
  const bytes = new Uint8Array(size)
  let at = 0
  for (const chunk of chunks) {
    bytes.set(chunk, at)
    at += chunk.byteLength
  }
  return new TextDecoder().decode(bytes)
}

/** For what anyone can read, like the totals: cached, from any site. */
export const PUBLIC_HEADERS = {
  "Cache-Control": "public, max-age=3600",
  "Access-Control-Allow-Origin": "*",
}
