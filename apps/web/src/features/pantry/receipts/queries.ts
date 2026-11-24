import { queryOptions, useQueryClient } from "@tanstack/react-query"

import { api, unwrap, type Schemas } from "@/lib/api/client"

import { receiptsRefetchInterval } from "./following"

export type Receipt = Schemas["Receipt"]
export type ReceiptLine = Receipt["lines"][number]

// Under ["pantry"], so a receipt added on another device clears here too.

/** Receipts waiting for a look: shared ones, say. */
export const receiptsQuery = queryOptions({
  queryKey: ["pantry", "receipts"],
  queryFn: () => unwrap(api.GET("/api/pantry/receipts")),
  refetchInterval: (query) => receiptsRefetchInterval(query.state.data),
})

export const receiptQuery = (receiptId: string) =>
  queryOptions({
    queryKey: ["pantry", "receipts", receiptId],
    queryFn: () =>
      unwrap(
        api.GET("/api/pantry/receipts/{receiptId}", {
          params: { path: { receiptId } },
        })
      ),
    retry: false,
  })

/** After adding one: the pantry, the list, and what's waiting. */
export function useRefreshAfterReceipt() {
  const queryClient = useQueryClient()
  return () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: ["pantry"] }),
      queryClient.invalidateQueries({ queryKey: ["list"] }),
    ])
}

/** Discards a receipt of any status: one that wasn't a receipt, say. */
export function useDiscardReceipt() {
  const refresh = useRefreshAfterReceipt()
  return async (receiptId: string) => {
    await unwrap(
      api.DELETE("/api/pantry/receipts/{receiptId}", {
        params: { path: { receiptId } },
      })
    )
    await refresh()
  }
}
