import { randomBytes } from "node:crypto"
import { UniqueConstraintViolationException } from "@mikro-orm/core"
import type { EntityManager } from "@mikro-orm/sql"
import { AppError } from "../../../core/errors.ts"
import {
  Household,
  RecipeShare,
  type HouseholdSettings,
} from "../../../database/entities/index.ts"
import { findRecipe } from "../recipes.ts"

/** Households can share recipes by link unless they've turned it off. */
export function recipeSharingOn(
  settings: HouseholdSettings | null | undefined
) {
  return settings?.sharing?.recipes !== false
}

/** A recipe's link, or null while it isn't shared. */
export async function shareOf(em: EntityManager, idOrSlug: string) {
  const recipe = await findRecipe(em, idOrSlug)
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
  const recipe = await findRecipe(em, idOrSlug)
  await em.nativeDelete(RecipeShare, { recipe: recipe.id })
}

export function shareUrl(publicUrl: string, token: string) {
  return `${publicUrl}/r/${token}`
}
