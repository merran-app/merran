import { useTranslation } from "react-i18next"
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card"
import { ServerSwitch } from "./server-switch"

export function AuthCard() {
  const { t } = useTranslation()
  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("auth.security.serverTitle")}</CardTitle>
        <CardDescription>{t("auth.security.serverHint")}</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-6">
        <ServerSwitch
          settingKey="auth.passkeys"
          label={t("auth.security.passkeys")}
          description={t("auth.security.passkeysHint")}
        />
        <ServerSwitch
          settingKey="auth.twoFactor"
          label={t("auth.security.twoFactor")}
          description={t("auth.security.twoFactorHint")}
        />
        <ServerSwitch
          settingKey="auth.requireAdminTwoFactor"
          label={t("auth.security.requireAdmins")}
          description={t("auth.security.requireAdminsHint")}
        />
      </CardContent>
    </Card>
  )
}
