import { ArrowDown01Icon } from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"
import { isWebhookEventType, type WebhookEventType } from "@merran/shared"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import type { TFunction } from "i18next"
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

import {
  DELIVERIES_PAGE_SIZE,
  DETAILS_REFRESH_MS,
  webhookDeliveriesQuery,
  type WebhookDelivery,
} from "./queries"

const EVENT_LABELS = {
  "recipe.created": "settings.household.webhooks.events.recipe.created",
  "recipe.updated": "settings.household.webhooks.events.recipe.updated",
  "recipe.deleted": "settings.household.webhooks.events.recipe.deleted",
  "recipe.restored": "settings.household.webhooks.events.recipe.restored",
  "import.finished": "settings.household.webhooks.events.import.finished",
  "tidy.ready": "settings.household.webhooks.events.tidy.ready",
  "review.waiting": "settings.household.webhooks.events.review.waiting",
  "cooking.started": "settings.household.webhooks.events.cooking.started",
  "cooking.ended": "settings.household.webhooks.events.cooking.ended",
  "timer.started": "settings.household.webhooks.events.timer.started",
  "timer.extended": "settings.household.webhooks.events.timer.extended",
  "timer.finished": "settings.household.webhooks.events.timer.finished",
  "timer.cancelled": "settings.household.webhooks.events.timer.cancelled",
  "plan.changed": "settings.household.webhooks.events.plan.changed",
  "plan.autoplanned": "settings.household.webhooks.events.plan.autoplanned",
  "meal.cooked": "settings.household.webhooks.events.meal.cooked",
  "meal.skipped": "settings.household.webhooks.events.meal.skipped",
  "list.changed": "settings.household.webhooks.events.list.changed",
  "list.completed": "settings.household.webhooks.events.list.completed",
  "list.sent": "settings.household.webhooks.events.list.sent",
  "pantry.changed": "settings.household.webhooks.events.pantry.changed",
  "day.summary": "settings.household.webhooks.events.day.summary",
  "meal.time_to_start": "settings.household.webhooks.events.meal.time_to_start",
  "pantry.use_soon": "settings.household.webhooks.events.pantry.use_soon",
  "webhook.test": "settings.household.webhooks.events.webhook.test",
} as const satisfies Record<WebhookEventType, string>

/** An event's label, or its type as the server names it if it's one this app doesn't know. */
function eventLabel(t: TFunction, type: string) {
  return isWebhookEventType(type) ? t(EVENT_LABELS[type]) : type
}

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
  // The log is only shown while its webhook is open, and deliveries being
  // tried move on in the background.
  const { data } = useQuery({
    ...webhookDeliveriesQuery(webhookId, offset),
    refetchInterval: DETAILS_REFRESH_MS,
  })

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
              {eventLabel(t, delivery.event.type)}
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
              {delivery.error && (
                <p className="text-sm break-words text-muted-foreground">
                  {delivery.error}
                </p>
              )}
              {/* What the receiver said, which for a failure is often why. */}
              {delivery.answer && (
                <pre
                  dir="ltr"
                  className="max-h-40 overflow-auto rounded-xl bg-muted p-3 text-xs break-words whitespace-pre-wrap"
                >
                  {delivery.answer}
                </pre>
              )}
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
          {/* One still being tried is refused, unless nothing is left
              trying it, as after a crash: the server knows which. */}
          <Button variant="outline" size="sm" disabled={busy} onClick={resend}>
            {busy && <Spinner />}
            {t("settings.household.webhooks.resend")}
          </Button>
        </CollapsibleContent>
      </Collapsible>
    </li>
  )
}
