import { Add01Icon, WebhookIcon } from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"
import { useSuspenseQuery } from "@tanstack/react-query"
import * as React from "react"
import { useTranslation } from "react-i18next"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty"
import { useCapability } from "@/features/capabilities/queries"
import { CardActions } from "@/features/settings/card-actions"
import { formatRelativeDate } from "@/lib/format"

import { webhooksQuery, type Webhook } from "./queries"
import { WebhookDetailsDialog } from "./webhook-details-dialog"
import { WebhookFormDialog } from "./webhook-form-dialog"

const STATE_BADGES = {
  working: "secondary",
  failing: "destructive",
  paused: "outline",
} as const

/**
 * Where the household's kitchen news goes: its webhooks, with how each is
 * doing. Admins only, and only when the server has webhooks on.
 */
export function WebhooksCard() {
  const { t } = useTranslation()
  const on = useCapability("webhooks")
  const [adding, setAdding] = React.useState(false)
  // The id stays after the view closes, so it can finish closing.
  const [opened, setOpened] = React.useState<string | null>(null)
  const [viewing, setViewing] = React.useState(false)

  function open(webhook: Webhook) {
    setOpened(webhook.id)
    setViewing(true)
  }

  if (!on) return null

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("settings.household.webhooks.title")}</CardTitle>
        <CardDescription>
          {t("settings.household.webhooks.description")}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <WebhookList onOpen={open} />
      </CardContent>
      <CardActions>
        <Button onClick={() => setAdding(true)}>
          <HugeiconsIcon icon={Add01Icon} strokeWidth={2} />
          {t("settings.household.webhooks.add")}
        </Button>
      </CardActions>
      <WebhookFormDialog open={adding} onOpenChange={setAdding} />
      {opened && (
        <WebhookDetailsDialog
          key={opened}
          webhookId={opened}
          open={viewing}
          onOpenChange={setViewing}
        />
      )}
    </Card>
  )
}

function WebhookList({ onOpen }: { onOpen: (webhook: Webhook) => void }) {
  const { t } = useTranslation()
  const { data: webhooks } = useSuspenseQuery(webhooksQuery)

  if (webhooks.length === 0) {
    return (
      <Empty className="rounded-2xl border border-dashed">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <HugeiconsIcon icon={WebhookIcon} strokeWidth={2} />
          </EmptyMedia>
          <EmptyTitle>{t("settings.household.webhooks.none")}</EmptyTitle>
          <EmptyDescription>
            {t("settings.household.webhooks.noneHint")}
          </EmptyDescription>
        </EmptyHeader>
      </Empty>
    )
  }

  return (
    <ul className="divide-y rounded-2xl border">
      {webhooks.map((webhook) => (
        <WebhookRow key={webhook.id} webhook={webhook} onOpen={onOpen} />
      ))}
    </ul>
  )
}

function WebhookRow({
  webhook,
  onOpen,
}: {
  webhook: Webhook
  onOpen: (webhook: Webhook) => void
}) {
  const { t, i18n } = useTranslation()

  const events = webhook.everything
    ? t("settings.household.webhooks.everythingShort")
    : t("settings.household.webhooks.eventCount", {
        count: webhook.events.length,
      })
  const delivered = webhook.lastDeliveredAt
    ? t("settings.household.webhooks.lastDelivered", {
        date: formatRelativeDate(webhook.lastDeliveredAt, i18n.language),
      })
    : t("settings.household.webhooks.neverDelivered")

  const details = (
    <>
      <div className="min-w-0 flex-1 space-y-1">
        <p className="text-sm font-medium break-words">{webhook.name}</p>
        <p className="text-sm break-all text-muted-foreground">
          {webhook.host}
        </p>
        <p className="text-sm text-muted-foreground">
          {[events, delivered].join(" · ")}
        </p>
      </div>
      <Badge variant={STATE_BADGES[webhook.state]}>
        {t(`settings.household.webhooks.state.${webhook.state}`)}
      </Badge>
    </>
  )

  return (
    <li>
      <button
        type="button"
        onClick={() => onOpen(webhook)}
        className="flex w-full flex-wrap items-center gap-3 p-4 text-start outline-none first:rounded-t-2xl last:rounded-b-2xl hover:bg-muted/50 focus-visible:ring-[3px] focus-visible:ring-ring/50"
      >
        {details}
      </button>
    </li>
  )
}
