import {
  combineLines,
  covers,
  joinAmounts,
  subtractAmounts,
  type ListLine,
} from "@merran/shared"
import type { EntityManager } from "@mikro-orm/sql"
import { AppError } from "../../../core/errors.ts"
import { PantryItem, ShoppingItem } from "../../../database/entities/index.ts"
import { coverFromPantry } from "../../pantry/stock.ts"
import { toNumber } from "../../../database/numbers.ts"
import { householdAliases } from "../../foods/aliases.ts"
import { addMealNeeds, onHandOf } from "../meals.ts"

/** Recalculate changed foods only. A purchase or manual remainder is never discarded. */
export async function updateSwapQuantities(
  em: EntityManager,
  householdId: string,
  changes: { mealId: string; before: ListLine[]; after: ListLine[] }[],
  listId?: string
) {
  const aliases = await householdAliases(em)
  const rows = await em.find(ShoppingItem, {})
  const pantry = await em.find(PantryItem, {})
  const needed = [] as ReturnType<typeof combineLines>
  for (const change of changes) {
    const before = combineLines(change.before, aliases)
    const after = combineLines(change.after, aliases)
    const foods = new Set([...before, ...after].map((item) => item.food))
    for (const food of foods) {
      const old = before.filter((item) => item.food === food)
      const next = after.filter((item) => item.food === food)
      if (!next.length)
        for (const row of rows.filter(
          (row) => row.checked && row.foodKey === food
        )) {
          const kept = (row.forMeals ?? []).filter(
            (share) => share.meal !== change.mealId
          )
          row.forMeals = kept.length ? kept : null
        }
      if (
        JSON.stringify(
          old.map(({ quantity, unit }) => ({ quantity, unit }))
        ) ===
        JSON.stringify(next.map(({ quantity, unit }) => ({ quantity, unit })))
      )
        continue
      for (const row of rows.filter(
        (row) => row.foodKey === food && !row.checked
      )) {
        const leaving = (row.forMeals ?? []).filter(
          (share) => share.meal === change.mealId
        )
        if (!leaving.length) continue
        if (row.quantity === null && row.source !== "plan")
          throw new AppError(
            "conflict",
            "edited_amount",
            "This item includes an unmeasured manual amount. Review it before applying a substitution."
          )
        if (row.amountText)
          throw new AppError(
            "conflict",
            "edited_amount",
            "This ingredient has a hand-written amount. Review its amount before applying a substitution."
          )
        let amount = {
          quantity: toNumber(row.quantity),
          unit: row.unit ?? null,
        }
        for (const share of leaving) {
          const rest = subtractAmounts(amount, share, food)
          if (
            amount.quantity !== null &&
            (!rest || (rest.quantity ?? 0) < -0.001)
          )
            throw new AppError(
              "conflict",
              "edited_amount",
              "This ingredient's amount changed. Review it before applying a substitution."
            )
          if (rest) amount = rest
        }
        const staying = (row.forMeals ?? []).filter(
          (share) => share.meal !== change.mealId
        )
        if (
          !staying.length &&
          (amount.quantity === null || amount.quantity <= 0.001)
        )
          em.remove(row)
        else
          em.assign(row, {
            quantity: amount.quantity,
            unit: amount.unit,
            forMeals: staying.length ? staying : null,
          })
      }
      for (const row of pantry.filter((row) => covers(row.foodKey, food))) {
        const shares = (row.forMeals ?? []).filter(
          (share) => share.meal !== change.mealId
        )
        row.forMeals = shares.length ? shares : null
      }
      for (const item of next) {
        let amount = { quantity: item.quantity, unit: item.unit }
        for (const row of rows.filter(
          (row) => row.checked && row.foodKey === food
        )) {
          for (const share of (row.forMeals ?? []).filter(
            (share) => share.meal === change.mealId
          )) {
            if (joinAmounts(amount, share, food) === null) continue
            const rest = subtractAmounts(amount, share, food)
            if (rest) amount = rest
            else if (share.quantity === null)
              amount = { ...amount, quantity: 0 }
          }
        }
        if (amount.quantity !== null && amount.quantity <= 0.001) continue
        needed.push({
          ...item,
          ...amount,
          shares: [{ meal: change.mealId, ...amount }],
        })
      }
    }
  }
  await em.flush()
  const isOnHand = await onHandOf(em, householdId)
  const covered = await coverFromPantry(
    em,
    householdId,
    needed.filter((item) => !isOnHand(item.name))
  )
  await addMealNeeds(em, householdId, covered.items, listId)
  await em.flush()
}
