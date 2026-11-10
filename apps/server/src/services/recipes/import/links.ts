import { linkKey, TRACKING_PARAM } from "@merran/shared"
import type { EntityManager } from "@mikro-orm/sql"
import { Recipe } from "../../../database/entities/index.ts"
import { checkLink } from "../../fetch/public-fetch.ts"

/** A link tidied to compare and keep: no #part, no tracking parameters. */
export function normalizeLink(raw: string) {
  const url = checkLink(raw.trim())
  url.hash = ""
  for (const key of [...url.searchParams.keys()]) {
    if (TRACKING_PARAM.test(key)) url.searchParams.delete(key)
  }
  return url.toString()
}

const VIDEO_HOSTS =
  /(^|\.)(tiktok\.com|youtube\.com|youtu\.be|instagram\.com|instagr\.am|facebook\.com|fb\.watch)$/i

/** TikTok, YouTube, Instagram and Facebook links, which need the video importer. */
export function isVideoLink(url: string) {
  return VIDEO_HOSTS.test(new URL(url).hostname)
}

/** A link compared as the page it's for, or as it is when it has no key. */
const keyOf = (url: string) => linkKey(url) ?? url

/**
 * For each of these links, the recipe the household already has from it,
 * if any: the same page under any address, so
 * "http://www.example.com/soup/" finds the recipe from
 * "https://example.com/soup". The oldest, when there are several. The
 * library is read once, however many links there are.
 */
export async function findBySourceUrls(em: EntityManager, urls: string[]) {
  const recipes = await em.find(
    Recipe,
    { sourceUrl: { $ne: null } },
    {
      fields: ["id", "slug", "name", "sourceUrl", "createdAt"],
      orderBy: { createdAt: "asc", id: "asc" },
    }
  )
  // Oldest first, so the first recipe for a page is the one kept.
  const byKey = new Map<string, (typeof recipes)[number]>()
  for (const recipe of recipes) {
    const key = keyOf(recipe.sourceUrl!)
    if (!byKey.has(key)) byKey.set(key, recipe)
  }
  const found = new Map<string, (typeof recipes)[number]>()
  for (const url of urls) {
    const recipe = byKey.get(keyOf(url))
    if (recipe) found.set(url, recipe)
  }
  return found
}

/** A recipe the household already has from one of these links, if any: the oldest. */
export async function findBySourceUrl(em: EntityManager, urls: string[]) {
  const found = [...(await findBySourceUrls(em, urls)).values()]
  const oldest = found.sort(
    (a, b) => a.createdAt.getTime() - b.createdAt.getTime()
  )[0]
  return oldest ?? null
}
