import { Delete02Icon } from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import * as React from "react"
import { useTranslation } from "react-i18next"
import { toast } from "sonner"

import { ConfirmDialog } from "@/components/confirm-dialog"
import { CopyField } from "@/components/form/copy-field"
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Spinner } from "@/components/ui/spinner"
import { api, ApiError, unwrap } from "@/lib/api/client"

import { DeliveriesLog } from "./deliveries-log"
import {
  DETAILS_REFRESH_MS,
  webhookQuery,
  webhooksQuery,
  type WebhookDelivery,
  type WebhookDetail,
} from "./queries"
import { WebhookFormDialog } from "./webhook-form-dialog"

const STATE_BADGES = {
  working: "secondary",
  failing: "destructive",
  paused: "outline",
} as const

/** How much of a receiver's answer a toast shows; the log has the rest. */
const ANSWER_IN_TOAST = 200

/** The start of a failed test's answer, for under the toast, if it said anything. */
function answerPreview(delivery: WebhookDelivery) {
  const answer = delivery.answer?.trim()
  if (!answer) return undefined
  if (answer.length <= ANSWER_IN_TOAST) return answer
  return `${answer.slice(0, ANSWER_IN_TOAST)}…`
}

/**
 * One webhook's own view: how it's doing, what it was sent, and what an admin
 * can do with it: test, edit, pause or resume, see or rotate its secret, and
 * delete it.
 */
export function WebhookDetailsDialog({
  webhookId,
  open,
  onOpenChange,
}: {
  webhookId: string
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const { t } = useTranslation()
  // Off while closed, so a webhook just deleted isn't asked for again, and
  // asked for again while open, as tries in the background change its state.
  const { data: webhook } = useQuery({
    ...webhookQuery(webhookId),
    enabled: open,
    refetchInterval: open ? DETAILS_REFRESH_MS : false,
  })
  const [secret, setSecret] = React.useState<string | null>(null)

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        onOpenChange(next)
        if (!next) setSecret(null)
      }}
    >
      <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-2xl">
        {webhook ? (
          <>
            <DialogHeader>
              <DialogTitle>{webhook.name}</DialogTitle>
              <DialogDescription className="break-all">
                {webhook.host}
              </DialogDescription>
            </DialogHeader>
            <Status webhook={webhook} />
            {secret && (
              <CopyField
                label={t("settings.household.webhooks.secret")}
                value={secret}
              />
            )}
            <Actions
              webhook={webhook}
              onSecret={setSecret}
              onDeleted={() => onOpenChange(false)}
            />
            <DeliveriesLog webhookId={webhook.id} />
          </>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle>
                {t("settings.household.webhooks.title")}
              </DialogTitle>
            </DialogHeader>
            <div className="flex justify-center p-4">
              <Spinner />
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}

/** The state, why it's paused, and the last error. */
function Status({ webhook }: { webhook: WebhookDetail }) {
  const { t } = useTranslation()

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant={STATE_BADGES[webhook.state]}>
          {t(`settings.household.webhooks.state.${webhook.state}`)}
        </Badge>
        {webhook.pausedReason && (
          <span className="text-sm text-muted-foreground">
            {t(
              `settings.household.webhooks.pausedReason.${webhook.pausedReason}`
            )}
          </span>
        )}
      </div>
      {webhook.lastError && (
        <p className="text-sm break-words text-muted-foreground">
          {webhook.lastError}
        </p>
      )}
    </div>
  )
}

function Actions({
  webhook,
  onSecret,
  onDeleted,
}: {
  webhook: WebhookDetail
  onSecret: (secret: string) => void
  onDeleted: () => void
}) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const [busy, setBusy] = React.useState(false)
  const [editing, setEditing] = React.useState(false)
  const [resuming, setResuming] = React.useState(false)
  const path = { params: { path: { webhookId: webhook.id } } }
  const paused = webhook.state === "paused"

  /** Runs one action, showing the server's reason if it's refused. */
  async function act(action: () => Promise<void>) {
    setBusy(true)
    try {
      await action()
    } catch (error) {
      if (!(error instanceof ApiError)) throw error
      toast.error(error.message)
    } finally {
      setBusy(false)
    }
  }

  /** The state, the log and the list all change with most actions. */
  function refresh() {
    return queryClient.invalidateQueries({
      queryKey: ["household", "webhooks"],
    })
  }

  function sendTest() {
    return act(async () => {
      const delivery = await unwrap(
        api.POST("/api/households/current/webhooks/{webhookId}/test", path)
      )
      if (delivery.state === "delivered") {
        toast.success(
          t("settings.household.webhooks.tested", {
            status: delivery.statusCode,
          })
        )
      } else {
        // The error says what Merran saw; the answer, under it, what the
        // receiver said, which is often why.
        toast.error(
          t("settings.household.webhooks.testFailed", {
            error: delivery.error ?? String(delivery.statusCode),
          }),
          { description: answerPreview(delivery) }
        )
      }
      await refresh()
    })
  }

  function pause() {
    return act(async () => {
      await unwrap(
        api.PATCH("/api/households/current/webhooks/{webhookId}", {
          ...path,
          body: { paused: true },
        })
      )
      await refresh()
    })
  }

  function resume(resend: boolean) {
    setResuming(false)
    return act(async () => {
      await unwrap(
        api.PATCH("/api/households/current/webhooks/{webhookId}", {
          ...path,
          body: { paused: false, resend },
        })
      )
      await refresh()
    })
  }

  function showSecret() {
    return act(async () => {
      const { secret } = await unwrap(
        api.GET("/api/households/current/webhooks/{webhookId}/secret", path)
      )
      onSecret(secret)
    })
  }

  /** Errors are shown here, as the confirm dialog doesn't catch them. */
  async function rotateSecret() {
    await act(async () => {
      const { secret } = await unwrap(
        api.POST(
          "/api/households/current/webhooks/{webhookId}/secret/rotate",
          path
        )
      )
      onSecret(secret)
    })
  }

  async function remove() {
    await act(async () => {
      await unwrap(
        api.DELETE("/api/households/current/webhooks/{webhookId}", path)
      )
      // Dropped before the list reloads, so nothing asks for it again.
      onDeleted()
      queryClient.removeQueries({
        queryKey: ["household", "webhooks", webhook.id],
      })
      await queryClient.invalidateQueries({
        queryKey: webhooksQuery.queryKey,
        exact: true,
      })
    })
  }

  return (
    <div className="flex flex-wrap gap-2">
      <Button variant="outline" size="sm" disabled={busy} onClick={sendTest}>
        {t("settings.household.webhooks.test")}
      </Button>
      <Button
        variant="outline"
        size="sm"
        disabled={busy}
        onClick={() => setEditing(true)}
      >
        {t("settings.household.webhooks.edit")}
      </Button>
      {paused ? (
        <Button
          variant="outline"
          size="sm"
          disabled={busy}
          onClick={() => setResuming(true)}
        >
          {t("settings.household.webhooks.resume")}
        </Button>
      ) : (
        <Button variant="outline" size="sm" disabled={busy} onClick={pause}>
          {t("settings.household.webhooks.pause")}
        </Button>
      )}
      <Button variant="outline" size="sm" disabled={busy} onClick={showSecret}>
        {t("settings.household.webhooks.showSecret")}
      </Button>
      <ConfirmDialog
        trigger={
          <Button variant="outline" size="sm" disabled={busy}>
            {t("settings.household.webhooks.rotateSecret")}
          </Button>
        }
        title={t("settings.household.webhooks.rotateSecret")}
        description={t("settings.household.webhooks.rotateDescription")}
        confirm={t("settings.household.webhooks.rotateSecret")}
        onConfirm={rotateSecret}
      />
      <ConfirmDialog
        trigger={
          <Button variant="outline" size="sm" disabled={busy}>
            <HugeiconsIcon icon={Delete02Icon} strokeWidth={2} />
            {t("settings.household.webhooks.delete")}
          </Button>
        }
        title={t("settings.household.webhooks.deleteTitle", {
          name: webhook.name,
        })}
        description={t("settings.household.webhooks.deleteDescription")}
        confirm={t("settings.household.webhooks.delete")}
        onConfirm={remove}
      />
      <WebhookFormDialog
        webhook={webhook}
        open={editing}
        onOpenChange={setEditing}
      />
      <AlertDialog open={resuming} onOpenChange={setResuming}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {t("settings.household.webhooks.resume")}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {t("settings.household.webhooks.resumeDescription")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
            <Button variant="outline" onClick={() => resume(false)}>
              {t("settings.household.webhooks.resume")}
            </Button>
            <Button onClick={() => resume(true)}>
              {t("settings.household.webhooks.resumeAndResend")}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
