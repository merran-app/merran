import type { EntityManager } from "@mikro-orm/sql"
import { Recipe } from "../../database/entities/index.ts"
import { inHouseholdTransaction } from "../../database/transactions.ts"
import type { RecipeBulkInput } from "../../http/schemas/recipes.ts"
import { recipeRef } from "../webhooks/payloads.ts"
import { record } from "../webhooks/record.ts"
import { addTagsTo, removeTagsFrom } from "./tags.ts"

/**
 * Does one thing to recipes picked in select mode. Ones that aren't there
 * (or are in Recently deleted) are skipped. Tags changed this way aren't
 * edits, so no versions are kept.
 */
export async function bulkRecipes(
  em: EntityManager,
  householdId: string,
  input: RecipeBulkInput
) {
  if (input.action === "delete") {
    return inHouseholdTransaction(em, householdId, (tx) =>
      moveToDeleted(tx, householdId, input.ids)
    )
  }

  const recipes = await em.find(Recipe, { id: { $in: input.ids } })
  switch (input.action) {
    case "addTags":
      return {
        changed: await addTagsTo(em, householdId, recipes, input.tags),
      }
    case "removeTags":
      return { changed: await removeTagsFrom(em, recipes, input.tags) }
  }
}

/**
 * Moves the picked recipes to Recently deleted, telling webhooks of each.
 * Each one's event saves what came before it, so this runs in a
 * transaction: all of them move, or none do.
 */
async function moveToDeleted(
  tx: EntityManager,
  householdId: string,
  ids: readonly string[]
) {
  const recipes = await tx.find(Recipe, { id: { $in: [...ids] } })
  const now = new Date()
  for (const recipe of recipes) {
    recipe.deletedAt = now
    await record(tx, householdId, {
      type: "recipe.deleted",
      data: { recipe: recipeRef(recipe) },
    })
  }
  await tx.flush()
  return { changed: recipes.length }
}
