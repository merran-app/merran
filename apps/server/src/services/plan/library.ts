import type { Diet, IngredientMark, LineFood } from "@merran/shared"
import type { EntityManager } from "@mikro-orm/sql"
import { Recipe, RecipeIngredient } from "../../database/entities/index.ts"
import { toNumber } from "../../database/numbers.ts"
import { lineFoodsOf } from "../foods/line-foods.ts"
import { decodeDiets } from "../recipes/diet-labels.ts"
import { totalMinutes } from "../recipes/recipes.ts"
import { tagKey, tagsOf } from "../recipes/tags.ts"

// The recipes Fill the week, sales and costs read, as plain rows: loaded
// once for all three, and without the parts they don't use (descriptions,
// notes and steps).

export type PlanningLine = {
  rawText: string
  mark: IngredientMark | null
  /** What the line names: see `lineFoodsOf`. */
  foods: readonly LineFood[]
}

export type PlanningRecipe = {
  id: string
  slug: string
  name: string
  /** The photo's version, which `photoUrls` makes its addresses from. */
  image: string | null
  servings: number | null
  totalMinutes: number | null
  rating: number | null
  lastMadeAt: Date | null
  diets: Diet[]
  /** Foods the household said it can't do without. */
  needs: string[]
  /** Its tag names, lowercased. */
  tags: string[]
  /** In the order they're written. */
  lines: PlanningLine[]
}

export type PlanningLibrary = { recipes: readonly PlanningRecipe[] }

/**
 * Every recipe in the household, but those in Recently deleted: three
 * queries however many there are (recipes, their tags, their lines).
 */
export async function loadPlanningLibrary(
  em: EntityManager
): Promise<PlanningLibrary> {
  const recipes = await em.find(
    Recipe,
    {},
    {
      fields: [
        "id",
        "slug",
        "name",
        "image",
        "servings",
        "totalMinutes",
        "prepMinutes",
        "cookMinutes",
        "rating",
        "lastMadeAt",
        "diets",
        "needs",
      ],
    }
  )
  if (recipes.length === 0) return { recipes: [] }

  const ids = recipes.map((recipe) => recipe.id)
  const tags = await tagsOf(em, ids)
  const linesOf = new Map<string, PlanningLine[]>()
  const rows = await em.find(
    RecipeIngredient,
    { recipe: { $in: ids } },
    {
      fields: ["recipe", "rawText", "mark", "position"],
      orderBy: { position: "asc" },
    }
  )
  for (const row of rows) {
    const line: PlanningLine = {
      rawText: row.rawText,
      mark: row.mark ?? null,
      foods: lineFoodsOf(row.rawText),
    }
    const list = linesOf.get(row.recipe.id)
    if (list) list.push(line)
    else linesOf.set(row.recipe.id, [line])
  }

  return {
    recipes: recipes.map((recipe) => ({
      id: recipe.id,
      slug: recipe.slug,
      name: recipe.name,
      image: recipe.image ?? null,
      servings: toNumber(recipe.servings),
      totalMinutes: totalMinutes(recipe),
      rating: toNumber(recipe.rating),
      lastMadeAt: recipe.lastMadeAt ?? null,
      diets: decodeDiets(recipe.diets),
      needs: recipe.needs ?? [],
      tags: (tags.get(recipe.id) ?? []).map(tagKey),
      lines: linesOf.get(recipe.id) ?? [],
    })),
  }
}
