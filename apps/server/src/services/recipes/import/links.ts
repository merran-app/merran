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

/**
 * A recipe the household already has from one of these links, if any:
 * the same page under any address, so "http://www.example.com/soup/" finds
 * the recipe from "https://example.com/soup". The oldest, when there are
 * several.
 */
export async function findBySourceUrl(em: EntityManager, urls: string[]) {
  const keyOf = (url: string) => linkKey(url) ?? url
  const wanted = new Set(urls.map(keyOf))
  const recipes = await em.find(
    Recipe,
    { sourceUrl: { $ne: null } },
    {
      fields: ["id", "slug", "name", "sourceUrl", "createdAt"],
      orderBy: { createdAt: "asc", id: "asc" },
    }
  )
  const found = recipes.find(
    (recipe) => recipe.sourceUrl && wanted.has(keyOf(recipe.sourceUrl))
  )
  return found ?? null
}
