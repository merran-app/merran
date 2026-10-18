import { useQuery, useQueryClient } from "@tanstack/react-query"
import * as React from "react"
import { useTranslation } from "react-i18next"
import { toast } from "sonner"

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { Button } from "@/components/ui/button"
import { Spinner } from "@/components/ui/spinner"
import { useMe } from "@/features/auth/use-me"
import { useTour } from "@/features/onboarding/tour-context"
import { api, ApiError, unwrap } from "@/lib/api/client"

import {
  serverSettingsQuery,
  telemetryStatusQuery,
  telemetryReportQuery,
} from "./queries"

/**
 * Asks the server admin once, the first time they open Merran after setup,
 * whether to send the Merran project the anonymous daily summary.
 */
export function TelemetryQuestion() {
  const me = useMe()
  return me.serverAdmin ? <Question /> : null
}

function Question() {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const { data, isError, refetch } = useQuery(telemetryStatusQuery)
  const { active } = useTour()
  const [preview, setPreview] = React.useState(false)
  const report = useQuery({
    ...telemetryReportQuery,
    enabled: preview && data?.ask === true,
  })
  const [blocked, setBlocked] = React.useState(true)
  const [answering, setAnswering] = React.useState<boolean | null>(null)
  // Closed without an answer: asked again next time Merran opens.
  const [later, setLater] = React.useState(false)
  React.useEffect(() => {
    const check = () =>
      setBlocked(
        [
          ...document.querySelectorAll('[role="dialog"], [role="alertdialog"]'),
        ].some((element) => !element.hasAttribute("data-onboarding-prompt"))
      )
    check()
    const observer = new MutationObserver(check)
    observer.observe(document.body, { childList: true, subtree: true })
    return () => observer.disconnect()
  }, [])

  async function answer(send: boolean) {
    setAnswering(send)
    try {
      queryClient.setQueryData(
        telemetryStatusQuery.queryKey,
        await unwrap(api.POST("/api/telemetry/answer", { body: { send } }))
      )
      await queryClient.invalidateQueries({
        queryKey: serverSettingsQuery.queryKey,
      })
      if (send) toast.success(t("settings.server.telemetry.turnedOn"))
    } catch (error) {
      if (!(error instanceof ApiError)) throw error
      toast.error(error.message)
    } finally {
      setAnswering(null)
    }
  }

  if (isError)
    return (
      <aside className="fixed right-4 bottom-24 z-40 max-w-sm rounded-2xl border bg-card p-4 text-card-foreground">
        <p className="text-sm">
          {t("settings.server.telemetry.question.statusFailed")}
        </p>
        <Button variant="outline" onClick={() => void refetch()}>
          {t("onboarding.retry")}
        </Button>
      </aside>
    )

  return (
    <AlertDialog
      open={data?.ask === true && !later && !active && !blocked}
      onOpenChange={(open) => !open && setLater(true)}
    >
      <AlertDialogContent
        data-onboarding-prompt
        className="max-h-[90svh] overflow-y-auto"
      >
        <AlertDialogHeader>
          <AlertDialogTitle>
            {t("settings.server.telemetry.question.title")}
          </AlertDialogTitle>
          <AlertDialogDescription>
            {t("settings.server.telemetry.question.description")}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <p className="text-sm text-muted-foreground">
          {t("settings.server.telemetry.question.settings")}
        </p>
        <Button variant="outline" onClick={() => setPreview(!preview)}>
          {t("settings.server.telemetry.question.preview")}
        </Button>
        {preview &&
          (report.isError ? (
            <div>
              <p role="alert">
                {t("settings.server.telemetry.question.previewFailed")}
              </p>
              <Button variant="outline" onClick={() => void report.refetch()}>
                {t("onboarding.retry")}
              </Button>
            </div>
          ) : report.data ? (
            <pre className="max-h-48 overflow-auto rounded-xl bg-muted p-3 text-xs">
              {JSON.stringify(report.data, null, 2)}
            </pre>
          ) : (
            <Spinner />
          ))}
        <AlertDialogFooter>
          <Button
            variant="outline"
            disabled={answering !== null}
            onClick={() => void answer(false)}
          >
            {answering === false && <Spinner />}
            {t("settings.server.telemetry.question.no")}
          </Button>
          <AlertDialogAction
            disabled={answering !== null}
            onClick={() => void answer(true)}
          >
            {answering === true && <Spinner />}
            {t("settings.server.telemetry.question.yes")}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
