// Node.js 24+. Writes a recipe index to stdout; never writes to Merran.
const base = new URL(process.env.MERRAN_URL || "http://localhost:3000")
const key = process.env.MERRAN_API_KEY
if (!key) throw new Error("Set MERRAN_API_KEY to a key with recipes:read.")
if (
  !["http:", "https:"].includes(base.protocol) ||
  base.username ||
  base.password
)
  throw new Error("Use an HTTP(S) server URL without credentials.")

async function getPage(offset) {
  const url = new URL("/api/recipes", base)
  url.search = new URLSearchParams({
    limit: "100",
    offset: String(offset),
    sort: "name",
  })
  for (let attempt = 0; attempt < 3; attempt++) {
    const response = await fetch(url, {
      headers: { Authorization: `Bearer ${key}`, Accept: "application/json" },
      signal: AbortSignal.timeout(15000),
      redirect: "error", // Do not forward credentials to an unexpected destination.
    })
    if (response.status === 429 && attempt < 2) {
      const value = response.headers.get("retry-after")
      const delay =
        value && /^\d+$/.test(value)
          ? Number(value) * 1000
          : value
            ? Date.parse(value) - Date.now()
            : 5000
      await response.body?.cancel()
      if (!Number.isFinite(delay) || delay > 60000)
        throw new Error("Rate limited. Wait for Retry-After, then run again.")
      await new Promise((resolve) => setTimeout(resolve, Math.max(1000, delay)))
      continue
    }
    const body = await response.json().catch(() => null)
    if (!response.ok)
      throw new Error(
        `HTTP ${response.status}: ${body?.error?.code || "request_failed"}; request ${response.headers.get("x-request-id") || "unknown"}`
      )
    if (!Array.isArray(body?.recipes) || !Number.isFinite(body?.total))
      throw new Error(
        "Unexpected recipe response; check your server's OpenAPI schema."
      )
    return body
  }
}

const index = new Map()
let offset = 0
for (let page = 0; ; page++) {
  if (page >= 1000)
    throw new Error(
      "Stopped after 1,000 pages; check changing data or filters."
    )
  const body = await getPage(offset)
  for (const recipe of body.recipes)
    index.set(recipe.id, {
      id: recipe.id,
      name: recipe.name,
      slug: recipe.slug,
    })
  offset += body.recipes.length
  if (!body.recipes.length || offset >= body.total) break
}
console.log(JSON.stringify([...index.values()], null, 2))
