import { createHash } from "node:crypto"
import {
  avoidedIn,
  combineLines,
  dietsFor,
  joinAmounts,
  missingDiets,
  readItem,
  swapMealIngredient,
  type MealRecipe,
} from "@merran/shared"
import type { EntityManager } from "@mikro-orm/sql"
import type { z } from "zod"
import { AppError } from "../../../core/errors.ts"
import { PlanEntry } from "../../../database/entities/index.ts"
import type {
  ShoppingSwapInputSchema,
  ShoppingUndoSchema,
} from "../../../http/schemas/shopping-swaps.ts"
import { findEntry } from "../../plan/plan.ts"
import { loadMealLines } from "../../plan/meal-lines.ts"
import { recipeForMeal } from "../../plan/recipe-variants.ts"
import { getTastes } from "../../plan/preferences.ts"
import {
  findRecipe,
  inHouseholdTransaction,
  updateRecipe,
} from "../../recipes/recipes.ts"
import { saveSwap } from "../../recipes/swaps.ts"
import { versionSnapshot } from "../../recipes/versions.ts"
import { householdAliases, householdKeys } from "../food-aliases.ts"
import { findItem, itemSnapshot, restoreItems } from "../list.ts"
import { updateSwapQuantities } from "./quantities.ts"
import { findList } from "../lists.ts"

type Input = z.infer<typeof ShoppingSwapInputSchema>
type Undo = z.infer<typeof ShoppingUndoSchema>
const stateOf = (value: MealRecipe) =>
  createHash("sha256").update(JSON.stringify(value)).digest("hex")
const changed = () =>
  new AppError(
    "conflict",
    "shopping_changed",
    "The meal or shopping item changed. Open its substitutions again before applying."
  )

/** Match actual ingredient lines, including sides, with the list's food rules. */
export async function shoppingSwapTargets(em: EntityManager, itemId: string) {
  const item = await findItem(em, itemId)
  const shares = item.forMeals ?? []
  const entries = shares.length
    ? await em.find(
        PlanEntry,
        {
          id: { $in: [...new Set(shares.map((share) => share.meal))] },
          status: "planned",
        },
        { populate: ["recipe", "withRecipe"] }
      )
    : []
  const aliases = await householdAliases(em)
  const linesOf = await loadMealLines(em, item.household.id, entries)
  const targets = []
  for (const entry of entries) {
    if (!entry.recipe || entry.recipe.getEntity().deletedAt) continue
    for (const line of linesOf(entry)) {
      if (
        !combineLines([line], aliases).some(
          (part) =>
            part.food === item.foodKey &&
            shares.some(
              (share) =>
                share.meal === entry.id &&
                joinAmounts(share, part, part.food) !== null
            )
        )
      )
        continue
      const recipe = await findRecipe(em, line.recipeId)
      const context = recipeForMeal(entry, recipe)
      targets.push({
        mealId: entry.id,
        mealName: entry.recipe.getEntity().name,
        date: entry.date,
        anyDay: entry.anyDay,
        revision: entry.updatedAt.toISOString(),
        recipe: context,
        ingredientId: line.ingredientId,
        factor: line.factor,
        state: stateOf(context),
        canSaveToLibrary:
          context.basedOn === recipe.updatedAt.toISOString() &&
          recipe.ingredients
            .getItems()
            .some((ingredient) => ingredient.id === line.ingredientId),
      })
    }
  }
  return { targets }
}

export async function applyShoppingSwap(
  em: EntityManager,
  householdId: string,
  userId: string | null,
  itemId: string,
  input: Input
) {
  return inHouseholdTransaction(em, householdId, async (tx) => {
    const item = await findItem(tx, itemId)
    if (item.checked) throw changed()
    if (!input.targets.length) {
      if (
        item.forMeals?.length ||
        input.lines.length !== 1 ||
        input.saveToLibrary
      )
        throw changed()
      const snapshot = itemSnapshot(item)
      const parsed = readItem(input.lines[0]!)
      const keyOf = await householdKeys(tx)
      tx.assign(item, { ...parsed, foodKey: keyOf(parsed.name) })
      await tx.flush()
      return {
        undo: {
          meals: [],
          library: null,
          manual: { snapshot, expected: item.updatedAt.toISOString() },
        } satisfies Undo,
      }
    }
    const { targets } = await shoppingSwapTargets(tx, itemId)
    const tastes = await getTastes(tx, householdId)
    if (
      avoidedIn(input.lines, tastes.avoid).length ||
      missingDiets(dietsFor(input.lines), tastes.diets).length
    )
      throw new AppError(
        "invalid",
        "unsuitable_swap",
        "That replacement conflicts with the household's dietary rules."
      )
    if (
      new Set(input.targets.map((target) => target.mealId)).size !==
      input.targets.length
    )
      throw changed()
    const entries = [] as PlanEntry[]
    const before = [] as { mealId: string; variants: MealRecipe[] }[]
    const matched = [] as (typeof targets)[number][]
    for (const selected of input.targets) {
      const target = targets.find(
        (target) =>
          target.mealId === selected.mealId &&
          target.recipe.recipeId === input.recipeId &&
          target.ingredientId === input.ingredientId
      )
      if (
        !target ||
        selected.revision !== target.revision ||
        input.state !== target.state
      )
        throw changed()
      const entry = await findEntry(tx, selected.mealId)
      if (
        (input.steps ?? []).some(
          (step) =>
            !target.recipe.steps.some((original) => original.id === step.stepId)
        )
      )
        throw changed()
      entries.push(entry)
      matched.push(target)
      before.push({
        mealId: entry.id,
        variants: structuredClone(entry.variants ?? []),
      })
    }
    const linesOf = await loadMealLines(tx, householdId, entries)
    const previous = entries.map((entry) => linesOf(entry))
    for (const [index, entry] of entries.entries()) {
      const target = matched[index]!
      const variant = swapMealIngredient(
        target.recipe,
        input.ingredientId,
        input.lines,
        input.steps ?? []
      )
      entry.variants = [
        ...(entry.variants ?? []).filter(
          (value) => value.recipeId !== variant.recipeId
        ),
        variant,
      ]
    }
    await updateSwapQuantities(
      tx,
      householdId,
      entries.map((entry, index) => ({
        mealId: entry.id,
        before: previous[index]!,
        after: linesOf(entry),
      })),
      item.list.id
    )
    let library: Undo["library"] = null
    if (input.saveToLibrary) {
      if (!matched.every((target) => target.canSaveToLibrary)) throw changed()
      const saved = await saveSwap(tx, {
        householdId,
        userId,
        recipe: input.recipeId!,
        ingredientId: input.ingredientId,
        lines: input.lines,
        steps: input.steps,
      })
      if (saved.undoVersionId)
        library = {
          recipeId: saved.recipe.id,
          versionId: saved.undoVersionId,
          expected: saved.recipe.updatedAt,
        }
    }
    await tx.flush()
    return {
      undo: {
        listId: item.list.id,
        meals: before.map((old, index) => ({
          ...old,
          expected: entries[index]!.updatedAt.toISOString(),
        })),
        library,
        manual: null,
      } satisfies Undo,
    }
  })
}

/** Undo is conditional, so another shopper's edits cannot be overwritten. */
export async function undoShoppingSwap(
  em: EntityManager,
  householdId: string,
  userId: string | null,
  undo: Undo
) {
  return inHouseholdTransaction(em, householdId, async (tx) => {
    if (undo.listId) await findList(tx, undo.listId)
    if (undo.manual) {
      const item = await findItem(tx, undo.manual.snapshot.id)
      if (
        item.checked ||
        item.updatedAt.toISOString() !== undo.manual.expected ||
        item.forMeals?.length
      )
        throw changed()
      await restoreItems(tx, householdId, [undo.manual.snapshot])
      return { done: true }
    }
    const entries = [] as PlanEntry[]
    for (const old of undo.meals) {
      const entry = await findEntry(tx, old.mealId)
      if (
        entry.status !== "planned" ||
        entry.updatedAt.toISOString() !== old.expected
      )
        throw changed()
      if (
        old.variants.some(
          (variant) =>
            variant.recipeId !== entry.recipe?.id &&
            variant.recipeId !== entry.withRecipe?.id
        )
      )
        throw changed()
      entries.push(entry)
    }
    const linesOf = await loadMealLines(tx, householdId, entries)
    const previous = entries.map((entry) => linesOf(entry))
    entries.forEach((entry, index) => {
      entry.variants = undo.meals[index]!.variants
    })
    await updateSwapQuantities(
      tx,
      householdId,
      entries.map((entry, index) => ({
        mealId: entry.id,
        before: previous[index]!,
        after: linesOf(entry),
      })),
      undo.listId
    )
    if (undo.library) {
      const recipe = await findRecipe(tx, undo.library.recipeId)
      if (recipe.updatedAt.toISOString() !== undo.library.expected)
        throw changed()
      const input = await versionSnapshot(tx, recipe.id, undo.library.versionId)
      await updateRecipe(tx, {
        householdId,
        userId,
        recipe: recipe.id,
        input,
        source: "restore",
      })
    }
    await tx.flush()
    return { done: true }
  })
}
