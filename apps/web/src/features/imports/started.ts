import { useNavigate } from "@tanstack/react-router"
import * as React from "react"
import { useTranslation } from "react-i18next"
import { toast } from "sonner"

import type { Schemas } from "@/lib/api/client"

/** An import going on in the background: a link that took a while, or a video. */
export type ImportStarted = Schemas["ImportStarted"]

/** Whether an import answer says it went on in the background. */
export function importStarted<T extends object>(
  result: T | ImportStarted
): result is ImportStarted {
  return "import" in result
}

/**
 * Says an import is still going, with View to follow it: for a link that
 * took longer than the wait, or a video. A caller that meant to do more
 * with the recipe says what it couldn't do yet.
 */
export function useStartedNotice() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  return React.useCallback(
    (started: ImportStarted, message?: string) => {
      const importId = started.import.id
      toast(message ?? t("imports.started"), {
        id: importId,
        action: {
          label: t("imports.view"),
          onClick: () => {
            void navigate({
              to: "/recipes/imports/$importId",
              params: { importId },
            })
          },
        },
      })
    },
    [t, navigate]
  )
}
