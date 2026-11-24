import { useNavigate } from "@tanstack/react-router"
import * as React from "react"
import { useTranslation } from "react-i18next"
import { toast } from "sonner"

import { api, unwrap } from "@/lib/api/client"

import { isFailure, jobNoticeMessage, jobNoticeTarget } from "./notices"

/**
 * Tells whoever started a slow piece of work (nutrition, a photo, a price
 * check, a receipt) that it's done, with View to where it went. Only when
 * the request gave up waiting: one that finished while they watched needs
 * no telling. The toast is keyed by the job, so it shows once however many
 * times the event comes.
 */
export function useJobNotice() {
  const { t } = useTranslation()
  const navigate = useNavigate()

  return React.useCallback(
    async (jobId: string) => {
      const job = await unwrap(
        api.GET("/api/households/current/jobs/{jobId}", {
          params: { path: { jobId } },
        })
      )
      const message = jobNoticeMessage(job)
      if (!message) return

      const target = jobNoticeTarget(job)
      const show = isFailure(message) ? toast.error : toast
      show(String(t(message.key, message.values)), {
        id: jobId,
        action: target
          ? {
              label: t("jobs.notice.view"),
              onClick: () => {
                void navigate(target)
              },
            }
          : undefined,
      })
    },
    [t, navigate]
  )
}
