import type { EntityManager } from "@mikro-orm/sql"
import { AppError } from "../../core/errors.ts"
import { Import, ImportItem, Recipe } from "../../database/entities/index.ts"
import { inHouseholdTransaction } from "../../database/transactions.ts"
import { restoreDeleted } from "../recipes/deleted.ts"
import { moveToDeleted } from "../recipes/recipes.ts"
import { WITH_DELETED_RECIPES } from "./describe.ts"

// Undo moves what an import brought in to Recently deleted, keeping the
// recipes someone unticked; Restore puts back what Undo moved, while it's
// still there. Each recipe goes as deleting it would, so webhooks hear.

/**
 * Moves the chosen recipes the import brought in to Recently deleted. Any
 * id it didn't bring in is left alone, as is a recipe already in Recently
 * deleted or deleted for good.
 */
export async function undoImport(
  em: EntityManager,
  record: Import,
  recipeIds: readonly string[]
) {
  const chosen = new Set(recipeIds)
  await inHouseholdTransaction(em, record.household.id, async (tx) => {
    const items = await tx.find(
      ImportItem,
      { import: record.id, state: "added", recipe: { $ne: null } },
      WITH_DELETED_RECIPES
    )
    const wanted = items.filter(
      (item) => item.recipe && chosen.has(item.recipe.id)
    )
    const recipes = await tx.find(
      Recipe,
      { id: { $in: wanted.map((item) => item.recipe!.id) } },
      WITH_DELETED_RECIPES
    )
    const here = new Map(recipes.map((recipe) => [recipe.id, recipe]))
    for (const item of wanted) {
      const recipe = here.get(item.recipe!.id)
      if (!recipe || recipe.deletedAt) continue
      await moveToDeleted(tx, recipe.id)
      item.undone = true
    }
    const found = await tx.findOneOrFail(Import, { id: record.id })
    found.undoneAt = new Date()
    await tx.flush()
  })
}

/**
 * Puts back what Undo moved to Recently deleted, all that's still there.
 * One emptied from Recently deleted since is gone for good.
 */
export async function restoreImport(em: EntityManager, record: Import) {
  if (!record.undoneAt) {
    throw new AppError(
      "conflict",
      "import_not_undone",
      "That import hasn't been undone."
    )
  }
  await inHouseholdTransaction(em, record.household.id, async (tx) => {
    const items = await tx.find(
      ImportItem,
      { import: record.id, undone: true },
      WITH_DELETED_RECIPES
    )
    const recipes = await tx.find(
      Recipe,
      {
        id: {
          $in: items.flatMap((item) => (item.recipe ? [item.recipe.id] : [])),
        },
      },
      WITH_DELETED_RECIPES
    )
    const here = new Map(recipes.map((recipe) => [recipe.id, recipe]))
    for (const item of items) {
      const recipe = item.recipe ? here.get(item.recipe.id) : undefined
      if (recipe?.deletedAt) await restoreDeleted(tx, recipe.id)
      item.undone = false
    }
    const found = await tx.findOneOrFail(Import, { id: record.id })
    found.undoneAt = null
    await tx.flush()
  })
}
