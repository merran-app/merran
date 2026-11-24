import { useNavigate } from "@tanstack/react-router"
import * as React from "react"
import { useTranslation } from "react-i18next"
import { toast } from "sonner"

import { api, unwrap } from "@/lib/api/client"

import { noticeMessage } from "./notices"

/**
 * Tells whoever started an import that it's in, with View to its page. The
 * toast is keyed by the import, so it replaces "Still importing" and shows
 * once however many times the event comes. A single link that came in while
 * they waited isn't listed, and needs no telling: they watched it open.
 */
export function useImportNotice() {
  const { t } = useTranslation()
  const navigate = useNavigate()

  return React.useCallback(
    async (importId: string) => {
      const found = await unwrap(
        api.GET("/api/imports/{importId}", {
          params: { path: { importId } },
        })
      )
      if (!found.listed) return

      const firstName = found.cameIn.items[0]?.recipe.name ?? null
      const message = noticeMessage(found, firstName)
      const show = message.key === "imports.notice.failed" ? toast.error : toast
      show(String(t(message.key, message.values)), {
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
