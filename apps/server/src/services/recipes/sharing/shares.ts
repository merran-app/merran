import { randomBytes } from "node:crypto"
import { UniqueConstraintViolationException } from "@mikro-orm/core"
import type { EntityManager } from "@mikro-orm/sql"
import type { Logger } from "pino"
import { AppError } from "../../../core/errors.ts"
import {
  Household,
  Recipe,
  RecipeShare,
  type HouseholdSettings,
} from "../../../database/entities/index.ts"
import {
  ACROSS_HOUSEHOLDS,
  forHousehold,
  NOT_DELETED_FILTER,
} from "../../../database/scope.ts"
import { findRecipe, UUID } from "../recipes.ts"

const SEE_DELETED = { filters: { [NOT_DELETED_FILTER]: false } }

/**
 * A recipe, even one in Recently deleted: its link can still be looked at and
 * stopped there, because deleting a recipe doesn't end its link.
 */
async function findRecipeEvenDeleted(em: EntityManager, idOrSlug: string) {
  const recipe = await em.findOne(
    Recipe,
    UUID.test(idOrSlug) ? { id: idOrSlug } : { slug: idOrSlug },
    SEE_DELETED
  )
  if (!recipe) {
    throw new AppError(
      "not_found",
      "recipe_not_found",
      "There's no such recipe."
    )
  }
  return recipe
}

/** Households can share recipes by link unless they've turned it off. */
export function recipeSharingOn(
  settings: HouseholdSettings | null | undefined
) {
  return settings?.sharing?.recipes !== false
}

/** A recipe's link, or null while it isn't shared. */
export async function shareOf(em: EntityManager, idOrSlug: string) {
  const recipe = await findRecipeEvenDeleted(em, idOrSlug)
  return em.findOne(RecipeShare, { recipe: recipe.id })
}

/** The recipe's link: the one it has, or a new one. */
export async function shareRecipe(
  em: EntityManager,
  householdId: string,
  userId: string,
  idOrSlug: string
) {
  const household = await em.findOneOrFail(Household, householdId)
  if (!recipeSharingOn(household.settings)) {
    throw new AppError(
      "forbidden",
      "sharing_off",
      "Your household has turned off sharing recipes by link."
    )
  }

  const recipe = await findRecipe(em, idOrSlug)
  const existing = await em.findOne(RecipeShare, { recipe: recipe.id })
  if (existing) return existing

  const share = em.create(RecipeShare, {
    household: householdId,
    recipe: recipe.id,
    token: randomBytes(32).toString("base64url"),
    createdBy: userId,
  })
  try {
    await em.flush()
  } catch (error) {
    // Two taps at once: the other request's link won, so give that one.
    if (!(error instanceof UniqueConstraintViolationException)) throw error
    em.clear()
    const winner = await shareOf(em, idOrSlug)
    if (!winner) throw error
    return winner
  }
  return share
}

/** Ends the link. Sharing again makes a new one. */
export async function stopSharing(em: EntityManager, idOrSlug: string) {
  const recipe = await findRecipeEvenDeleted(em, idOrSlug)
  await em.nativeDelete(RecipeShare, { recipe: recipe.id })
}

/** Everything the household has shared, newest first, for its admins. */
export async function listShares(
  em: EntityManager,
  publicUrl: string | null | undefined
) {
  const shares = await em.find(
    RecipeShare,
    {},
    {
      populate: ["recipe", "createdBy"],
      orderBy: { createdAt: "desc", id: "desc" },
      // A deleted recipe's link stays listed, so an admin can still stop it.
      ...SEE_DELETED,
    }
  )
  return shares.map((share) => {
    const recipe = share.recipe.getEntity()
    const sharedBy = share.createdBy?.getEntity()
    return {
      recipe: { slug: recipe.slug, name: recipe.name },
      url: publicUrl ? shareUrl(publicUrl, share.token) : null,
      sharedBy: sharedBy ? { name: sharedBy.name } : null,
      createdAt: share.createdAt.toISOString(),
      openedAt: share.openedAt?.toISOString() ?? null,
    }
  })
}

const TOKEN_SHAPE = /^[A-Za-z0-9_-]{43}$/
const HOUR = 3_600_000

/**
 * The recipe a link shows, or null however the link fails: it was never made,
 * it was stopped, the household turned sharing off, or the recipe is in
 * Recently deleted (which only pauses the link: restoring it brings it back).
 * This is the one check that opens a recipe to someone with no sign-in.
 */
export async function sharedForToken(
  em: EntityManager,
  token: string,
  { noteOpened = true, logger }: { noteOpened?: boolean; logger?: Logger } = {}
) {
  if (!TOKEN_SHAPE.test(token)) return null

  const share = await em.findOne(
    RecipeShare,
    { token },
    { ...ACROSS_HOUSEHOLDS, populate: ["household"] }
  )
  if (!share) return null

  const household = share.household.getEntity()
  if (!recipeSharingOn(household.settings)) return null

  // From here on, only this household's rows are in reach.
  const recipe = await forHousehold(em, household.id).findOne(
    Recipe,
    { id: share.recipe.id },
    { populate: ["ingredients", "steps"] }
  )
  if (!recipe) return null

  const now = new Date()
  if (
    noteOpened &&
    (!share.openedAt || now.getTime() - share.openedAt.getTime() > HOUR)
  ) {
    share.openedAt = now
    try {
      await em.flush()
    } catch (error) {
      // Noting the open is only a courtesy to the admins' list: a failure
      // here mustn't stop someone reading the recipe.
      logger?.warn({ err: error }, "A shared recipe's open wasn't noted")
    }
  }
  return { recipe, household, token: share.token }
}

export function shareUrl(publicUrl: string, token: string) {
  return `${publicUrl}/r/${token}`
}
