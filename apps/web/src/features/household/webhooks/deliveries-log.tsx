import { ArrowDown01Icon } from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import * as React from "react"
import { useTranslation } from "react-i18next"
import { toast } from "sonner"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible"
import { Spinner } from "@/components/ui/spinner"
import { api, ApiError, unwrap } from "@/lib/api/client"

import type { PickableEvent } from "./event-picker"
import {
  DELIVERIES_PAGE_SIZE,
  webhookDeliveriesQuery,
  type WebhookDelivery,
} from "./queries"

const STATE_BADGES = {
  waiting: "outline",
  delivered: "secondary",
  failed: "destructive",
  stopped: "outline",
} as const

/**
 * What was sent to a webhook, newest first, a page at a time. Each page is
 * its own query, so a refresh brings every page shown up to date.
 */
export function DeliveriesLog({ webhookId }: { webhookId: string }) {
  const { t } = useTranslation()
  const [pages, setPages] = React.useState(1)

  return (
    <section className="space-y-3">
      <h3 className="text-sm font-medium">
        {t("settings.household.webhooks.deliveries")}
      </h3>
      <ul className="divide-y rounded-2xl border">
        {Array.from({ length: pages }, (_, page) => (
          <DeliveriesPage
            key={page}
            webhookId={webhookId}
            page={page}
            isLast={page === pages - 1}
            onShowMore={() => setPages(pages + 1)}
          />
        ))}
      </ul>
    </section>
  )
}

function DeliveriesPage({
  webhookId,
  page,
  isLast,
  onShowMore,
}: {
  webhookId: string
  page: number
  isLast: boolean
  onShowMore: () => void
}) {
  const { t } = useTranslation()
  const offset = page * DELIVERIES_PAGE_SIZE
  const { data } = useQuery(webhookDeliveriesQuery(webhookId, offset))

  if (!data) {
    return (
      <li className="flex justify-center p-4">
        <Spinner />
      </li>
    )
  }

  const { deliveries, total } = data
  if (total === 0) {
    return (
      <li className="p-4 text-sm text-muted-foreground">
        {t("settings.household.webhooks.noDeliveries")}
      </li>
    )
  }

  const hasMore = isLast && offset + deliveries.length < total
  return (
    <>
      {deliveries.map((delivery) => (
        <DeliveryRow
          key={delivery.id}
          webhookId={webhookId}
          delivery={delivery}
        />
      ))}
      {hasMore && (
        <li className="p-2">
          <Button variant="ghost" className="w-full" onClick={onShowMore}>
            {t("settings.household.webhooks.showMore")}
          </Button>
        </li>
      )}
    </>
  )
}

function DeliveryRow({
  webhookId,
  delivery,
}: {
  webhookId: string
  delivery: WebhookDelivery
}) {
  const { t, i18n } = useTranslation()
  const queryClient = useQueryClient()
  const [busy, setBusy] = React.useState(false)

  const when = new Intl.DateTimeFormat(i18n.language, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(delivery.lastTriedAt ?? delivery.event.createdAt))
  const duration =
    delivery.durationMs === null
      ? null
      : new Intl.NumberFormat(i18n.language, {
          style: "unit",
          unit: "millisecond",
        }).format(delivery.durationMs)
  const summary = [
    when,
    t("settings.household.webhooks.tries", { count: delivery.tries }),
    delivery.statusCode,
    duration,
  ].filter((part) => part !== null)

  async function resend() {
    setBusy(true)
    try {
      await unwrap(
        api.POST(
          "/api/households/current/webhooks/{webhookId}/deliveries/{deliveryId}/resend",
          { params: { path: { webhookId, deliveryId: delivery.id } } }
        )
      )
      await queryClient.invalidateQueries({
        queryKey: ["household", "webhooks", webhookId],
      })
    } catch (error) {
      if (!(error instanceof ApiError)) throw error
      toast.error(error.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <li>
      <Collapsible>
        <CollapsibleTrigger className="group flex w-full items-center gap-3 p-4 text-start outline-none first:rounded-t-2xl focus-visible:ring-[3px] focus-visible:ring-ring/50">
          <div className="min-w-0 flex-1 space-y-1">
            <p className="text-sm font-medium break-words">
              {t(
                `settings.household.webhooks.events.${delivery.event.type as PickableEvent}`
              )}
            </p>
            <p className="text-sm text-muted-foreground">
              {summary.join(" · ")}
            </p>
          </div>
          <Badge variant={STATE_BADGES[delivery.state]}>
            {t(`settings.household.webhooks.deliveryState.${delivery.state}`)}
          </Badge>
          <HugeiconsIcon
            icon={ArrowDown01Icon}
            strokeWidth={2}
            className="shrink-0 transition-transform group-data-[panel-open]:rotate-180"
          />
        </CollapsibleTrigger>
        <CollapsibleContent className="space-y-3 px-4 pb-4">
          {(delivery.error || delivery.answer) && (
            <div className="space-y-1">
              <p className="text-sm font-medium">
                {t("settings.household.webhooks.answer")}
              </p>
              <p className="text-sm break-words text-muted-foreground">
                {delivery.error ?? delivery.answer}
              </p>
            </div>
          )}
          <div className="space-y-1">
            <p className="text-sm font-medium">
              {t("settings.household.webhooks.body")}
            </p>
            <pre
              dir="ltr"
              className="max-h-64 overflow-auto rounded-xl bg-muted p-3 text-xs"
            >
              {delivery.body}
            </pre>
          </div>
          {delivery.state !== "waiting" && (
            <Button
              variant="outline"
              size="sm"
              disabled={busy}
              onClick={resend}
            >
              {busy && <Spinner />}
              {t("settings.household.webhooks.resend")}
            </Button>
          )}
        </CollapsibleContent>
      </Collapsible>
    </li>
  )
}
