import { useQuery } from "@tanstack/react-query"
import { useTranslation } from "react-i18next"
import { capabilitiesQuery } from "@/features/capabilities/queries"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

const CONNECTIONS = ["ai", "stores", "nutrition", "voice", "video"] as const

/** Configuration status is not a successful request to an external provider. */
export function ConnectionOverview() {
  const { t } = useTranslation()
  const query = useQuery(capabilitiesQuery)
  if (query.isError)
    return (
      <Button variant="outline" onClick={() => void query.refetch()}>
        {t("onboarding.retry")}
      </Button>
    )
  if (!query.data) return null
  return (
    <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
      {CONNECTIONS.map((id) => {
        const module = query.data.modules.find((module) => module.id === id)
        if (!module) return null
        return (
          <li key={id} className="grid gap-2 rounded-xl border bg-card p-3">
            <span className="text-sm font-medium">
              {t(`onboarding.connections.${id}`)}
            </span>
            <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <span
                aria-hidden
                className={cn(
                  "size-1.5 rounded-full",
                  module.on ? "bg-primary" : "bg-muted-foreground"
                )}
              />
              {t(
                module.on
                  ? "onboarding.connections.enabled"
                  : "onboarding.connections.off"
              )}
            </span>
          </li>
        )
      })}
    </ul>
  )
}
