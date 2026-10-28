import { useQueryClient } from "@tanstack/react-query"
import { useTranslation } from "react-i18next"
import { toast } from "sonner"

import { listQuery } from "@/features/list/queries"
import { useForMeals } from "@/features/list/use-for-meals"
import { api, ApiError, unwrap, type Schemas } from "@/lib/api/client"

import { pantryQuery, type PantryItem, type PantrySnapshot } from "./queries"
import { useDayLabel } from "./use-soon"

type Changes = Schemas["PantryChanges"]
type Bulk = Schemas["PantryBulk"]

/** Something used up that meals on the list were counting on. */
export type PutBack = { item: PantryItem; before: PantrySnapshot }

/** How long Undo stays offered. */
const UNDO_MS = 10_000

/**
 * Changes to what's at home, each followed by the pantry loading again.
 * Using things up says so with an Undo that really puts them back. When
 * meals on the list counted on them, it asks whether they go back on the
 * list: for one thing, on the message; for several, by `onPutBack`
 * choosing which.
 */
export function usePantryActions() {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const forMeals = useForMeals()
  const dayLabel = useDayLabel()

  async function run<T>(work: () => Promise<T>): Promise<T | null> {
    try {
      return await work()
    } catch (err) {
      if (!(err instanceof ApiError)) throw err
      toast.error(err.message)
      return null
    } finally {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: pantryQuery.queryKey }),
        queryClient.invalidateQueries({ queryKey: ["list", "covered"] }),
      ])
    }
  }

  const restore = (items: PantrySnapshot[]) =>
    run(() => unwrap(api.POST("/api/pantry/restore", { body: { items } })))

  const undoable = (message: string, before: PantrySnapshot[]) =>
    toast.success(message, {
      duration: UNDO_MS,
      action: { label: t("pantry.undo"), onClick: () => void restore(before) },
    })

  /** The meals on the list a thing is set aside for: "Tacos, Tue". */
  const mealsOnList = (item: PantryItem) =>
    item.meals
      .filter((meal) => meal.onList)
      .map((meal) =>
        t("pantry.putBack.meal", { name: meal.name, day: dayLabel(meal.date) })
      )
      .join(", ")

  /** What's in the pantry now, before it changes: what meals it's for. */
  const pantryNow = () =>
    queryClient.getQueryData(pantryQuery.queryKey)?.items ?? []

  /**
   * Several things used up: when meals on the list counted on any, the
   * message offers Choose, to pick which go back on the list.
   */
  function usedUp(
    message: string,
    before: PantrySnapshot[],
    was: PantryItem[],
    onPutBack?: (choices: PutBack[]) => void
  ) {
    const choices = before.flatMap((snapshot) => {
      const item = was.find((one) => one.id === snapshot.id)
      return item?.meals.some((meal) => meal.onList)
        ? [{ item, before: snapshot }]
        : []
    })
    if (choices.length === 0 || !onPutBack) {
      undoable(message, before)
      return
    }
    toast.success(message, {
      description: t("pantry.putBack.forMeals", { count: choices.length }),
      duration: UNDO_MS,
      action: {
        label: t("pantry.putBack.choose"),
        onClick: () => onPutBack(choices),
      },
      cancel: { label: t("pantry.undo"), onClick: () => void restore(before) },
    })
  }

  return {
    add: (body: Schemas["NewPantryItem"]) =>
      run(() => unwrap(api.POST("/api/pantry/items", { body }))),

    /**
     * Changed; with less of it than meals on the list need now, the
     * message offers to put what they're short of on the list.
     */
    async change(item: PantryItem, changes: Changes) {
      const done = await run(() =>
        unwrap(
          api.PATCH("/api/pantry/items/{itemId}", {
            params: { path: { itemId: item.id } },
            body: changes,
          })
        )
      )
      const short = done?.meals.filter((meal) => meal.short) ?? []
      if (done && changes.amount !== undefined && short.length > 0) {
        toast(t("pantry.putBack.short", { name: done.name }), {
          description: short
            .map((meal) =>
              t("pantry.putBack.shortFor", {
                amount: meal.short,
                meal: t("pantry.putBack.meal", {
                  name: meal.name,
                  day: dayLabel(meal.date),
                }),
              })
            )
            .join(", "),
          duration: UNDO_MS,
          action: {
            label: t("pantry.putBack.putOnList"),
            onClick: () =>
              void forMeals.putOnList(
                { items: [item.id] },
                t("pantry.putBack.done", { name: done.name })
              ),
          },
        })
      }
      return done
    },

    /**
     * Used up. When meals on the list counted on it, the message says
     * which, and offers Put on the list beside Undo.
     */
    async remove(item: PantryItem) {
      const before = await run(() =>
        unwrap(
          api.DELETE("/api/pantry/items/{itemId}", {
            params: { path: { itemId: item.id } },
          })
        )
      )
      if (!before) return
      const message = t("pantry.removed", { name: item.name })
      const meals = mealsOnList(item)
      if (!meals) {
        undoable(message, [before])
        return
      }
      toast.success(message, {
        description: t("pantry.putBack.wasFor", { meals }),
        duration: UNDO_MS,
        action: {
          label: t("pantry.putBack.putOnList"),
          onClick: () =>
            void forMeals.putOnList(
              { removed: [before] },
              t("pantry.putBack.done", { name: item.name })
            ),
        },
        cancel: {
          label: t("pantry.undo"),
          onClick: () => void restore([before]),
        },
      })
    },

    /**
     * Several at once; the message says what was done, with Undo. Used up
     * things meals on the list counted on can go back on it (`onPutBack`).
     */
    async bulk(
      ids: string[],
      action: Omit<Bulk, "ids">,
      said: (changed: number) => string,
      onPutBack?: (choices: PutBack[]) => void
    ) {
      const was = pantryNow()
      const done = await run(() =>
        unwrap(api.POST("/api/pantry/items/bulk", { body: { ids, ...action } }))
      )
      if (!done) return false
      if (action.action === "remove")
        usedUp(said(done.changed), done.before, was, onPutBack)
      else undoable(said(done.changed), done.before)
      return true
    },

    async clear(onPutBack?: (choices: PutBack[]) => void) {
      const was = pantryNow()
      const done = await run(() => unwrap(api.POST("/api/pantry/clear")))
      if (!done) return
      if (done.before.length === 0) toast(t("pantry.clearedNone"))
      else
        usedUp(
          t("pantry.cleared", { count: done.before.length }),
          done.before,
          was,
          onPutBack
        )
    },

    /** Running low: these go on the shopping list. */
    async toList(names: string[]) {
      try {
        for (const text of names) {
          await unwrap(api.POST("/api/list/items", { body: { text } }))
        }
        toast.success(
          names.length === 1
            ? t("pantry.addedToList", { name: names[0] })
            : t("pantry.addedSomeToList", { count: names.length })
        )
        return true
      } catch (err) {
        if (!(err instanceof ApiError)) throw err
        toast.error(err.message)
        return false
      } finally {
        await queryClient.invalidateQueries({ queryKey: listQuery.queryKey })
      }
    },
  }
}
