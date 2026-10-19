import { useQuery, useQueryClient } from "@tanstack/react-query"
import { useState } from "react"
import { useTranslation } from "react-i18next"
import { authClient } from "@/features/auth/client"
import { useCapability } from "@/features/capabilities/queries"
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from "@/components/ui/card"
import { Button } from "@/components/ui/button"

export function SsoCard() {
  const { t } = useTranslation()
  const enabled = useCapability("auth.sso")
  const queryClient = useQueryClient()
  const [failed, setFailed] = useState(false)
  const { data } = useQuery({
    queryKey: ["sign-in-accounts"],
    enabled,
    queryFn: async () => {
      const result = await authClient.listAccounts()
      if (result.error) throw new Error(result.error.message)
      return result.data
    },
  })
  if (!enabled) return null
  const linked = data?.find((account) => account.providerId === "oidc")

  async function toggleSsoLink() {
    setFailed(false)
    try {
      const result = linked
        ? await authClient.unlinkAccount({ accountId: linked.id })
        : await authClient.linkSocial({
            provider: "oidc",
            callbackURL: "/settings/you",
          })
      if (result.error) setFailed(true)
      else
        await queryClient.invalidateQueries({
          queryKey: ["sign-in-accounts"],
        })
    } catch {
      setFailed(true)
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("auth.security.sso")}</CardTitle>
        <CardDescription>{t("auth.security.ssoHint")}</CardDescription>
      </CardHeader>
      <CardContent>
        {failed && (
          <p role="alert" className="text-destructive">
            {t("auth.security.failed")}
          </p>
        )}
        <Button variant="outline" onClick={toggleSsoLink}>
          {t(linked ? "auth.security.unlinkSso" : "auth.security.linkSso")}
        </Button>
      </CardContent>
    </Card>
  )
}
