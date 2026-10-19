import { useQuery, useQueryClient } from "@tanstack/react-query"
import { useState } from "react"
import { useTranslation } from "react-i18next"
import { useCapability } from "@/features/capabilities/queries"
import { oauthRequest } from "@/features/auth/authorization"
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card"
import { Button } from "@/components/ui/button"

type Grant = {
  id: string
  clientId: string
  name: string | null
  householdName: string | null
  createdAt: string
  lastUsedAt: string | null
  referenceId?: string
  scopes: string[]
}
export function ConnectedAppsCard() {
  const { t } = useTranslation()
  const enabled = useCapability("auth.oauth")
  const queryClient = useQueryClient()
  const [failed, setFailed] = useState(false)
  const { data, isError } = useQuery<Grant[]>({
    queryKey: ["connected-apps"],
    enabled,
    queryFn: () => oauthRequest("get-consents"),
  })
  if (!enabled) return null

  async function disconnectApp(grantId: string) {
    setFailed(false)
    try {
      await oauthRequest("delete-consent", { id: grantId })
      await queryClient.invalidateQueries({
        queryKey: ["connected-apps"],
      })
    } catch {
      setFailed(true)
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("auth.oauth.connections")}</CardTitle>
        <CardDescription>{t("auth.oauth.connectionsHint")}</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4">
        {(failed || isError) && (
          <p role="alert" className="text-destructive">
            {t("auth.oauth.failed")}
          </p>
        )}
        {data?.length === 0 && <p>{t("auth.oauth.none")}</p>}
        {data?.map((grant) => (
          <div key={grant.id} className="grid gap-2 rounded-lg border p-4">
            <p className="font-medium break-all">
              {grant.name ?? grant.clientId}
            </p>
            <p>{grant.householdName ?? t("auth.oauth.formerHousehold")}</p>
            <p className="text-sm text-muted-foreground">
              {t("auth.oauth.approved", {
                date: new Date(grant.createdAt).toLocaleDateString(),
              })}
            </p>
            <p className="text-sm text-muted-foreground">
              {grant.lastUsedAt
                ? t("auth.oauth.lastUsed", {
                    date: new Date(grant.lastUsedAt).toLocaleString(),
                  })
                : t("auth.oauth.unused")}
            </p>
            <p className="text-sm text-muted-foreground">
              {grant.scopes
                .map((scope) =>
                  t(`auth.oauth.scopes.${scope}`, { defaultValue: scope })
                )
                .join(", ")}
            </p>
            <Button variant="outline" onClick={() => disconnectApp(grant.id)}>
              {t("auth.oauth.disconnect")}
            </Button>
          </div>
        ))}
      </CardContent>
    </Card>
  )
}
