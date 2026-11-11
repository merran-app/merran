import { queryOptions } from "@tanstack/react-query"

import { api, unwrap, type Schemas } from "@/lib/api/client"

export type Webhook = Schemas["Webhook"]
export type WebhookDetail = Schemas["WebhookDetail"]
export type WebhookDelivery = Schemas["WebhookDelivery"]

/** How many deliveries the log shows at a time. */
export const DELIVERIES_PAGE_SIZE = 25

export const webhooksQuery = queryOptions({
  queryKey: ["household", "webhooks"],
  queryFn: () => unwrap(api.GET("/api/households/current/webhooks")),
})

/** One webhook, with its whole address, which the list leaves out. */
export function webhookQuery(id: string) {
  return queryOptions({
    queryKey: ["household", "webhooks", id],
    queryFn: () =>
      unwrap(
        api.GET("/api/households/current/webhooks/{webhookId}", {
          params: { path: { webhookId: id } },
        })
      ),
  })
}

/** A page of a webhook's deliveries log, newest first. */
export function webhookDeliveriesQuery(id: string, offset: number) {
  return queryOptions({
    queryKey: ["household", "webhooks", id, "deliveries", offset],
    queryFn: () =>
      unwrap(
        api.GET("/api/households/current/webhooks/{webhookId}/deliveries", {
          params: {
            path: { webhookId: id },
            query: { limit: DELIVERIES_PAGE_SIZE, offset },
          },
        })
      ),
  })
}
