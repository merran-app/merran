import * as React from "react"

import { api, ApiError, unwrap, type Schemas } from "@/lib/api/client"

type Review = Schemas["PutAwayReview"]

/**
 * Where the shopping went, once a list is done. `take` loads what the
 * checked rows put away and marks those rows as looked over, so the same
 * food never comes up twice; `show` opens the drawer with it.
 */
export function usePutAwayReview() {
  const [review, setReview] = React.useState<Review | null>(null)

  /** The review for a list (or every list), already marked as looked over. */
  async function take(list?: string): Promise<Review | null> {
    try {
      const found = await unwrap(
        api.GET("/api/list/put-away", {
          params: { query: list ? { list } : {} },
        })
      )
      // Rows whose food has gone from the pantry are looked over too.
      if (found.rows.length > 0) {
        await unwrap(
          api.POST("/api/list/put-away/looked-over", {
            body: { rows: found.rows },
          })
        )
      }
      return found.items.length > 0 ? found : null
    } catch (err) {
      // The review is a courtesy: failing to load it never gets in the way.
      if (!(err instanceof ApiError)) throw err
      return null
    }
  }

  /** Opens the drawer, when there's anything to show. */
  function show(found: Review | null) {
    if (found) setReview(found)
  }

  /** The list is done: load where it went, and show it. */
  async function onListDone(list: string) {
    show(await take(list))
  }

  return {
    review,
    take,
    show,
    onListDone: (list: string) => void onListDone(list),
    close: () => setReview(null),
  }
}
