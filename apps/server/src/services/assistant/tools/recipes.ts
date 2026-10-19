import type { EntityManager } from "@mikro-orm/sql"
import { AppError } from "../../../core/errors.ts"
import { findRecipe, listRecipes } from "../../recipes/recipes.ts"

/** A recipe by its id, address or name: the closest one, by name. */
export async function lookupRecipe(em: EntityManager, ref: string) {
  try {
    return await findRecipe(em, ref)
  } catch (err) {
    if (!(err instanceof AppError) || err.code !== "recipe_not_found") throw err
  }
  const { recipes } = await listRecipes(em, {
    q: ref,
    tag: [],
    diet: [],
    sort: "name",
    limit: 1,
    offset: 0,
  })
  if (recipes[0]) return findRecipe(em, recipes[0].id)
  throw new AppError(
    "not_found",
    "recipe_not_found",
    `There's no recipe like "${ref}" in the library. Search for it first.`
  )
}
