import { useQueryClient } from "@tanstack/react-query"
import * as React from "react"
import { useTranslation } from "react-i18next"
import { toast } from "sonner"

import { api, ApiError, unwrap } from "@/lib/api/client"

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
 * server keeps it in this week's any-day meals, so Undo takes that meal
 * off, which takes its share back off the list.
 */
export function useAddRecipeToList() {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const [busy, setBusy] = React.useState(false)

  /** The list and the plan both changed. */
  function refresh() {
    return Promise.all([
      queryClient.invalidateQueries({ queryKey: ["list"] }),
      queryClient.invalidateQueries({ queryKey: ["plan"] }),
    ])
  }

  async function undo(entryId: string) {
    try {
      await unwrap(
        api.DELETE("/api/plan/entries/{entryId}", {
          params: { path: { entryId } },
        })
      )
    } catch (err) {
      if (!(err instanceof ApiError)) throw err
      toast.error(err.message)
    }
    await refresh()
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
        description: t("list.recipe.onPlan"),
        duration: UNDO_MS,
        action: {
          label: t("list.undo"),
          onClick: () => void undo(done.entry.id),
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
