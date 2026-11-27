import {
  checkTastes,
  missingDiets,
  type Diet,
  type HouseholdTastes,
} from "@merran/shared"
import type { EntityManager } from "@mikro-orm/sql"
import { AppError } from "../../../../core/errors.ts"
import type { AppDeps } from "../../../../core/context.ts"
import {
  FollowedSite,
  Recipe,
  RecipeSite,
  SiteRecipe,
  User,
  type SiteRecipeState,
} from "../../../../database/entities/index.ts"
import { SITES } from "../../../../modules/sites/settings.ts"
import { enqueue } from "../../../jobs/jobs.ts"
import { getTastes } from "../../../households/tastes.ts"
import { normalizeLink } from "../../import/links.ts"
import { allSuggestedSites, dataFor, type Course } from "./data.ts"
import { findFeed } from "./feeds.ts"
import { READ_SITES } from "./read-job.ts"

// Following recipe sites: a household picks sites, and sees their newest
// recipes, read from the shelf (shelf.ts) Merran keeps for every household.

/** A site's newest recipes shown, and the most the spotlight gets. */
const NEWEST = 24

/** How many of the followed sites' recipes the spotlight looks through at a time. */
const LOOK_THROUGH = 48

/**
 * Newest first. The id last, as it's made in time order, so recipes posted
 * and kept at the same moment always come in the same order and no page
 * repeats or skips one.
 */
const NEWEST_FIRST = {
  publishedAt: "desc",
  createdAt: "desc",
  id: "desc",
} as const

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** Refuses when the server admin has turned recipe sites off. */
export async function sitesReady(deps: Pick<AppDeps, "settings">) {
  if (!(await deps.settings.server(SITES.enabled))) {
    throw new AppError(
      "unprocessable",
      "sites_off",
      "Recipe sites are off on this server. The server admin can turn them on in Settings, Import and export, Whole server."
    )
  }
}

/** The language a person reads Merran in, for collections and suggestions. */
export async function languageOf(em: EntityManager, userId: string) {
  const user = await em.findOne(
    User,
    { id: userId },
    { fields: ["preferences"] }
  )
  return user?.preferences?.language ?? "en"
}

/** Recipes the household has from these links, by link. */
export async function libraryByUrl(em: EntityManager, urls: string[]) {
  if (urls.length === 0)
    return new Map<string, { slug: string; name: string }>()
  const recipes = await em.find(
    Recipe,
    { sourceUrl: { $in: [...new Set(urls)] } },
    { fields: ["slug", "name", "sourceUrl"], orderBy: { createdAt: "asc" } }
  )
  const found = new Map<string, { slug: string; name: string }>()
  for (const recipe of recipes) {
    if (recipe.sourceUrl && !found.has(recipe.sourceUrl)) {
      found.set(recipe.sourceUrl, { slug: recipe.slug, name: recipe.name })
    }
  }
  return found
}

/** Whether a recipe on the shelf suits the household: no avoided food, on its diets. */
export function suits(row: SiteRecipe, tastes: HouseholdTastes) {
  if (missingDiets(row.diets as Diet[], tastes.diets).length > 0) return false
  const check = checkTastes(
    {
      name: row.name ?? "",
      lines: row.ingredients,
      diets: row.diets as Diet[],
    },
    tastes.avoid
  )
  return check.ruledOut.length === 0
}

/** Words some sites start every description with, that say nothing here. */
const BOILERPLATE =
  /^\s*(recipe\s+video\s+(above|below)|jump\s+to\s+recipe)[.!:]*\s*/i

/** A recipe's own description, without its site's boilerplate. */
function cleanDescription(description: string | null | undefined) {
  const cleaned = description?.replace(BOILERPLATE, "").trim()
  return cleaned ? cleaned[0]!.toUpperCase() + cleaned.slice(1) : null
}

/** A recipe on the shelf, as the app shows it. */
export function describeShelfRecipe(
  row: SiteRecipe,
  options: {
    inLibrary: { slug: string; name: string } | null
    suits: boolean
  }
) {
  return {
    id: row.id,
    url: row.url,
    name: row.name ?? row.url,
    site: row.siteName,
    description: cleanDescription(row.description),
    minutes: row.minutes ?? null,
    courses: row.courses as Course[],
    photo:
      row.photoUrl && row.photo !== ""
        ? `/api/sites/recipes/${row.id}/photo`
        : null,
    publishedAt: row.publishedAt?.toISOString() ?? null,
    inLibrary: options.inLibrary,
    suits: options.suits,
  }
}
export type ShelfRecipeView = ReturnType<typeof describeShelfRecipe>

/** Shelf recipes as the household sees them: in its library or not, suiting it or not. */
export async function describeForHousehold(
  em: EntityManager,
  householdId: string,
  rows: readonly SiteRecipe[]
) {
  const [library, tastes] = await Promise.all([
    libraryByUrl(
      em,
      rows.map((row) => row.url)
    ),
    getTastes(em, householdId),
  ])
  return rows.map((row) =>
    describeShelfRecipe(row, {
      inLibrary: library.get(row.url) ?? null,
      suits: suits(row, tastes),
    })
  )
}

/**
 * Sites a household follows, each with its newest recipes. Those take a
 * query for each site; how many each has, the library and the household's
 * tastes are read once for them all.
 */
async function describeFollowed(
  em: EntityManager,
  householdId: string,
  followed: readonly FollowedSite[]
) {
  if (followed.length === 0) return []
  const sites = followed.map((row) => row.site.getEntity())
  const [newest, counts] = await Promise.all([
    Promise.all(
      sites.map((site) =>
        em.find(
          SiteRecipe,
          { site, state: "recipe" },
          { orderBy: NEWEST_FIRST, limit: NEWEST }
        )
      )
    ),
    em.countBy(SiteRecipe, ["site", "state"], {
      where: {
        site: { $in: sites.map((site) => site.id) },
        state: { $in: ["recipe", "waiting"] },
      },
    }),
  ])
  const described = await describeForHousehold(em, householdId, newest.flat())
  const byId = new Map(described.map((recipe) => [recipe.id, recipe]))

  // countBy keys each count by the site's id and the state, joined with ~~~.
  const count = (site: RecipeSite, state: SiteRecipeState) =>
    counts[`${site.id}~~~${state}`] ?? 0

  return followed.map((row, index) => {
    const site = sites[index]!
    return {
      id: row.id,
      name: site.name,
      url: site.url,
      feedUrl: site.feedUrl,
      recipes: newest[index]!.map((recipe) => byId.get(recipe.id)!),
      /** Its recipes in all, for Show more. */
      total: count(site, "recipe"),
      /** New posts not opened yet. */
      waiting: count(site, "waiting"),
      /** Not read for the first time yet. */
      reading: !site.readAt,
      readAt: site.readAt?.toISOString() ?? null,
      error: site.error ?? null,
      followedAt: row.createdAt.toISOString(),
    }
  })
}
export type FollowedSiteView = Awaited<
  ReturnType<typeof describeFollowed>
>[number]

/** The household's sites, oldest followed first, and sites it might follow. */
export async function listSites(
  em: EntityManager,
  householdId: string,
  language: string
) {
  const followed = await em.find(
    FollowedSite,
    {},
    { populate: ["site"], orderBy: { createdAt: "asc", id: "asc" } }
  )
  return {
    sites: await describeFollowed(em, householdId, followed),
    suggestions: suggestionsBesides(language, followed),
  }
}

/**
 * A page of a followed site's recipes, newest first as `listSites` shows
 * them, and how many it has in all: for Show more.
 */
export async function siteRecipes(
  em: EntityManager,
  householdId: string,
  followedId: string,
  page: { offset: number; limit: number }
) {
  const followed = await findFollowed(em, followedId)
  const [rows, total] = await em.findAndCount(
    SiteRecipe,
    { site: followed.site.id, state: "recipe" },
    { orderBy: NEWEST_FIRST, offset: page.offset, limit: page.limit }
  )
  return {
    recipes: await describeForHousehold(em, householdId, rows),
    total,
  }
}

/** Sites that work well with Merran, in a language, but those followed. */
function suggestionsBesides(language: string, followed: FollowedSite[]) {
  const following = new Set(followed.map((row) => row.site.getEntity().feedUrl))
  return dataFor(language)
    .sites.filter((site) => !following.has(site.feedUrl))
    .map((site) => ({
      name: site.name,
      url: site.url,
      description: site.description,
    }))
}

/**
 * How many sites the household follows, and the sites it might follow,
 * without reading any of their recipes: for the pages that only ask
 * whether to suggest some.
 */
export async function siteSuggestions(em: EntityManager, language: string) {
  const followed = await em.find(FollowedSite, {}, { populate: ["site"] })
  return {
    following: followed.length,
    suggestions: suggestionsBesides(language, followed),
  }
}

/** A short name for a site from its feed's title: "RecipeTin Eats". */
function siteName(title: string | null, siteUrl: string) {
  const cleaned = title
    ?.replace(/\s*[|»:–—-]\s*(feed|rss|recipes?|blog|home)\s*$/i, "")
    .trim()
  if (cleaned && cleaned.length <= 60) return cleaned
  return new URL(siteUrl).hostname.replace(/^www\./, "")
}

/**
 * Follows a site, by any of its pages, its feed, or a suggestion. It's read
 * straight away when no one's read it lately.
 */
export async function followSite(
  deps: Pick<AppDeps, "settings" | "fetcher">,
  em: EntityManager,
  householdId: string,
  raw: string
) {
  await sitesReady(deps)
  const url = normalizeLink(raw)
  const host = new URL(url).hostname.replace(/^www\./, "")
  const suggested = allSuggestedSites().find(
    (site) =>
      site.url === url ||
      site.feedUrl === url ||
      new URL(site.url).hostname.replace(/^www\./, "") === host
  )

  let feedUrl: string
  let name: string
  let siteUrl: string
  let language: string | null = null
  if (suggested) {
    feedUrl = suggested.feedUrl
    name = suggested.name
    siteUrl = suggested.url
  } else {
    const found = await findFeed(deps.fetcher, url)
    feedUrl = found.feedUrl
    siteUrl = found.feed.siteUrl ?? `${new URL(found.feedUrl).origin}/`
    name = siteName(found.feed.title, siteUrl)
    language = found.feed.language?.split("-")[0] ?? null
  }

  let site = await em.findOne(RecipeSite, { feedUrl })
  if (!site) {
    site = em.create(RecipeSite, { name, url: siteUrl, feedUrl, language })
    await em.flush()
  }
  if (await em.findOne(FollowedSite, { site })) {
    throw new AppError(
      "conflict",
      "site_followed",
      `You're following ${site.name} already.`
    )
  }
  const followed = em.create(FollowedSite, { household: householdId, site })
  await em.flush()
  if (!site.readAt || site.nextReadAt <= new Date()) {
    await enqueue(em, {
      kind: READ_SITES,
      key: `${READ_SITES}:${site.id}`,
      payload: { siteId: site.id },
      maxAttempts: 1,
    })
  }
  const [described] = await describeFollowed(em, householdId, [followed])
  return described!
}

/**
 * Up to 24 recipes from the sites the household follows that suit it,
 * newest first, for Recipes' spotlight and Today's idea. They're looked
 * through 48 at a time, so a run of new posts with a food it avoids still
 * leaves it older ones; the library is looked up only for those kept.
 */
export async function followedRecipes(em: EntityManager, householdId: string) {
  const followed = await em.find(FollowedSite, {}, { fields: ["site"] })
  if (followed.length === 0) return []
  const sites = followed.map((row) => row.site.id)
  const tastes = await getTastes(em, householdId)

  const kept: SiteRecipe[] = []
  let offset = 0
  while (kept.length < NEWEST) {
    const rows = await em.find(
      SiteRecipe,
      { site: { $in: sites }, state: "recipe" },
      { orderBy: NEWEST_FIRST, offset, limit: LOOK_THROUGH }
    )
    for (const row of rows) {
      if (kept.length === NEWEST) break
      // A post read between two looks moves the rest down one, so one
      // could come round again.
      if (kept.some((other) => other.id === row.id)) continue
      if (suits(row, tastes)) kept.push(row)
    }
    // A short look was the last there is.
    if (rows.length < LOOK_THROUGH) break
    offset += LOOK_THROUGH
  }

  const library = await libraryByUrl(
    em,
    kept.map((row) => row.url)
  )
  return kept.map((row) =>
    describeShelfRecipe(row, {
      inLibrary: library.get(row.url) ?? null,
      suits: true,
    })
  )
}

/** A recipe on the shelf, by its id. */
export async function findShelfRecipe(em: EntityManager, id: string) {
  const row = UUID.test(id) ? await em.findOne(SiteRecipe, { id }) : null
  if (!row) {
    throw new AppError(
      "not_found",
      "site_recipe_not_found",
      "There's no such recipe."
    )
  }
  return row
}

/** What's on the shelf, for Settings, Import and export, Whole server. */
export async function shelfSummary(em: EntityManager) {
  const [sites, recipes, classics, working, latest] = await Promise.all([
    em.count(RecipeSite, {}),
    em.count(SiteRecipe, { state: "recipe" }),
    em.count(SiteRecipe, { classic: true }),
    em.count(SiteRecipe, { classic: true, state: "recipe" }),
    em.findOne(
      RecipeSite,
      { readAt: { $ne: null } },
      { orderBy: { readAt: "desc" }, fields: ["readAt"] }
    ),
  ])
  return {
    sites,
    recipes,
    classics: { working, all: classics },
    readAt: latest?.readAt?.toISOString() ?? null,
  }
}

/** A site the household follows, by the id it's followed under. */
async function findFollowed(em: EntityManager, id: string) {
  const followed = UUID.test(id) ? await em.findOne(FollowedSite, { id }) : null
  if (!followed) {
    throw new AppError(
      "not_found",
      "site_not_found",
      "You're not following that site."
    )
  }
  return followed
}

/** Stops following a site. Its recipes stay on the shelf for others. */
export async function unfollowSite(em: EntityManager, id: string) {
  const followed = await findFollowed(em, id)
  await em.remove(followed).flush()
}
