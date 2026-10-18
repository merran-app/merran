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
import { api, ApiError, unwrap } from "@/lib/api/client"

import { serverSettingsQuery, telemetryStatusQuery } from "./queries"

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
  const { data } = useQuery(telemetryStatusQuery)
  const [answering, setAnswering] = React.useState<boolean | null>(null)
  // Closed without an answer: asked again next time Merran opens.
  const [later, setLater] = React.useState(false)

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

  return (
    <AlertDialog
      open={data?.ask === true && !later}
      onOpenChange={(open) => !open && setLater(true)}
    >
      <AlertDialogContent>
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
