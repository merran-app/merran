import { useQueryClient } from "@tanstack/react-query"
import { useTranslation } from "react-i18next"
import { toast } from "sonner"

import { pantryQuery } from "@/features/pantry/queries"
import { api, ApiError, unwrap, type Schemas } from "@/lib/api/client"

import { listQuery } from "./queries"

type Result = Schemas["ForMealsResult"]

/** How long Undo stays offered. */
const UNDO_MS = 10_000

/**
 * Putting what planned meals on the list are short of back on it: when
 * something the list counted on isn't at home after all, or is used up in
 * the pantry. Each says so with an Undo that takes it off the list again
 * and puts the pantry back as it was.
 */
export function useForMeals() {
  const { t } = useTranslation()
  const queryClient = useQueryClient()

  const refresh = () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: listQuery.queryKey }),
      queryClient.invalidateQueries({ queryKey: pantryQuery.queryKey }),
    ])

  async function run(work: () => Promise<Result>) {
    try {
      return await work()
    } catch (err) {
      if (!(err instanceof ApiError)) throw err
      toast.error(err.message)
      return null
    } finally {
      await refresh()
    }
  }

  /** The list as it was, then the pantry. */
  async function undo(result: Result) {
    try {
      if (result.before.length > 0 || result.remove.length > 0) {
        await unwrap(
          api.POST("/api/list/restore", {
            body: { items: result.before, remove: result.remove },
          })
        )
      }
      if (result.pantry.length > 0) {
        await unwrap(
          api.POST("/api/pantry/restore", { body: { items: result.pantry } })
        )
      }
    } catch (err) {
      if (!(err instanceof ApiError)) throw err
      toast.error(err.message)
    } finally {
      await refresh()
    }
  }

  function said(message: string, result: Result) {
    toast.success(message, {
      duration: UNDO_MS,
      action: { label: t("list.undo"), onClick: () => void undo(result) },
    })
  }

  return {
    /** It isn't at home: used up, and what meals counted on goes on the list. */
    async notAtHome(item: { id: string; name: string }) {
      const result = await run(() =>
        unwrap(
          api.POST("/api/list/covered/{itemId}/not-at-home", {
            params: { path: { itemId: item.id } },
          })
        )
      )
      if (result)
        said(t("list.covered.notAtHomeDone", { name: item.name }), result)
    },

    /**
     * What meals on the list are short of, after things were used up or
     * ran low, on the list. Says `message` with Undo, or that there was
     * nothing to put on.
     */
    async putOnList(body: Schemas["ForMeals"], message: string) {
      const result = await run(() =>
        unwrap(api.POST("/api/list/for-meals", { body }))
      )
      if (!result) return
      if (result.added + result.merged === 0)
        toast(t("list.covered.nothingShort"))
      else said(message, result)
    },
  }
}
