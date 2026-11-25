import { addDays, weekStartOf } from "@merran/shared"
import { useQueryClient } from "@tanstack/react-query"
import * as React from "react"
import { useTranslation } from "react-i18next"
import { toast } from "sonner"

import { formatDay } from "@/features/plan/format"
import { useHouseholdClock } from "@/features/plan/queries"
import { api, ApiError, unwrap, type Schemas } from "@/lib/api/client"

import { TonightDialog } from "./tonight-dialog"

/** How long Undo stays offered. */
const UNDO_MS = 10_000

type RecipeToAdd = {
  recipe: { id: string; name: string }
  /** A side it's made with, as the recipe page shows it. */
  withRecipe?: string | null
  /** None for the recipe's own servings. */
  servings?: number | null
  /**
   * Made tonight, on the week's last day: this week's plan rather than
   * next week's. Asked for, when it isn't given and it's that day.
   */
  tonight?: boolean
}

/**
 * A recipe's ingredients onto the list without planning a day for it. The
 * server lists a meal of it planned already, or keeps it in a week's
 * any-day meals, so the list follows it; Undo puts that back as it was.
 * On the week's last day it asks whether it's for tonight first: render
 * `question` wherever `add` is used.
 */
export function useAddRecipeToList() {
  const { t, i18n } = useTranslation()
  const queryClient = useQueryClient()
  const clock = useHouseholdClock()
  const [busy, setBusy] = React.useState(false)
  const [asking, setAsking] = React.useState<string | null>(null)
  const answered = React.useRef<(tonight: boolean | null) => void>(null)

  // Tomorrow starts a new week, so a meal could be for this week or next.
  const tomorrow = addDays(clock.today, 1)
  const lastDay = weekStartOf(tomorrow, clock.weekStartsOn) === tomorrow

  /** Asks whether it's for tonight; null when the question's closed. */
  function askTonight(name: string) {
    return new Promise<boolean | null>((resolve) => {
      answered.current = resolve
      setAsking(name)
    })
  }

  function answer(tonight: boolean | null) {
    answered.current?.(tonight)
    answered.current = null
    setAsking(null)
  }

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

  async function add({ recipe, withRecipe, servings, tonight }: RecipeToAdd) {
    let forTonight = tonight
    if (forTonight === undefined && lastDay) {
      const reply = await askTonight(recipe.name)
      if (reply === null) return false
      forTonight = reply
    }

    setBusy(true)
    try {
      const done = await unwrap(
        api.POST("/api/list/recipes", {
          body: {
            recipe: recipe.id,
            withRecipe: withRecipe ?? null,
            servings: servings ?? null,
            tonight: forTonight ?? false,
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

  // Only while it's asked, so a library of cards doesn't hold one each.
  const question =
    asking === null ? null : <TonightDialog name={asking} onAnswer={answer} />

  return { add, busy, lastDay, question }
}
