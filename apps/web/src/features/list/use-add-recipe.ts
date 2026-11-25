import { useQueryClient } from "@tanstack/react-query"
import * as React from "react"
import { useTranslation } from "react-i18next"
import { toast } from "sonner"

import { formatDay } from "@/features/plan/format"
import { useHouseholdClock } from "@/features/plan/queries"
import { api, ApiError, unwrap, type Schemas } from "@/lib/api/client"

/** How long Undo stays offered. */
const UNDO_MS = 10_000

type RecipeToAdd = {
  recipe: { id: string; name: string }
  /** A side it's made with, as the recipe page shows it. */
  withRecipe?: string | null
  /** None for the recipe's own servings. */
  servings?: number | null
}

/**
 * A recipe's ingredients onto the list without planning a day for it. The
 * server lists a meal of it planned already, or keeps it in a week's
 * any-day meals, so the list follows it; Undo puts that back as it was.
 */
export function useAddRecipeToList() {
  const { t, i18n } = useTranslation()
  const queryClient = useQueryClient()
  const clock = useHouseholdClock()
  const [busy, setBusy] = React.useState(false)

  /** The list and the plan both changed. */
  function refresh() {
    return Promise.all([
      queryClient.invalidateQueries({ queryKey: ["list"] }),
      queryClient.invalidateQueries({ queryKey: ["plan"] }),
    ])
  }

  async function undo(body: Schemas["RecipeOnListUndo"]) {
    try {
      await unwrap(api.POST("/api/list/recipes/undo", { body }))
    } catch (err) {
      if (!(err instanceof ApiError)) throw err
      toast.error(err.message)
    }
    await refresh()
  }

  /** Where the meal is on the plan: the day it was planned for, or a week's pool. */
  function whereOnPlan(entry: Schemas["PlanEntry"]) {
    if (!entry.anyDay) {
      return t("list.recipe.plannedFor", {
        day: formatDay(entry.date, i18n.language),
      })
    }
    return entry.date > clock.thisWeek
      ? t("list.recipe.onNextWeek")
      : t("list.recipe.onPlan")
  }

  async function add({ recipe, withRecipe, servings }: RecipeToAdd) {
    setBusy(true)
    try {
      const done = await unwrap(
        api.POST("/api/list/recipes", {
          body: {
            recipe: recipe.id,
            withRecipe: withRecipe ?? null,
            servings: servings ?? null,
          },
        })
      )
      await refresh()
      toast.success(t("list.recipe.added", { name: recipe.name }), {
        description: whereOnPlan(done.entry),
        duration: UNDO_MS,
        action: {
          label: t("list.undo"),
          onClick: () => void undo(done.undo),
        },
      })
      return true
    } catch (err) {
      if (!(err instanceof ApiError)) throw err
      toast.error(err.message)
      return false
    } finally {
      setBusy(false)
    }
  }

  return { add, busy }
}
