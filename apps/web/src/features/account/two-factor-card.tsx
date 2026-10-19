import { useState } from "react"
import { useQueryClient } from "@tanstack/react-query"
import { useTranslation } from "react-i18next"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from "@/components/ui/card"
import { TextField } from "@/components/form/text-field"
import { CopyField } from "@/components/form/copy-field"
import { authClient } from "@/features/auth/client"
import { AuthenticatorSetup } from "@/features/auth/authenticator-setup"
import { useMe } from "@/features/auth/use-me"
import { useCapability } from "@/features/capabilities/queries"

export function TwoFactorCard() {
  const { t } = useTranslation()
  const me = useMe()
  const enabled = useCapability("auth.twoFactor")
  const queryClient = useQueryClient()
  const [password, setPassword] = useState("")
  const [codes, setCodes] = useState<string[] | null>(null)
  const [error, setError] = useState(false)
  const [busy, setBusy] = useState(false)
  if (!enabled && !me.twoFactorEnabled) return null
  const run = async (action: "disable" | "codes") => {
    setBusy(true)
    setError(false)
    try {
      if (action === "disable") {
        const result = await authClient.twoFactor.disable({
          password: password || undefined,
        })
        if (result.error) {
          setError(true)
          return
        }
        setCodes(null)
      } else {
        const result = await authClient.twoFactor.generateBackupCodes({
          password: password || undefined,
        })
        if (result.error) {
          setError(true)
          return
        }
        setCodes(result.data?.backupCodes ?? null)
      }
      setPassword("")
      await queryClient.invalidateQueries({ queryKey: ["me"] })
    } catch {
      setError(true)
    } finally {
      setBusy(false)
    }
  }
  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("auth.security.twoFactor")}</CardTitle>
        <CardDescription>{t("auth.security.twoFactorHint")}</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4">
        {error && (
          <p role="alert" className="text-destructive">
            {t("auth.security.failed")}
          </p>
        )}
        {me.twoFactorEnabled ? (
          <>
            <p>{t("auth.security.enabled")}</p>
            <TextField
              label={t("auth.security.password")}
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
            <div className="flex flex-wrap gap-2">
              <Button
                variant="outline"
                disabled={busy}
                onClick={() => void run("codes")}
              >
                {t("auth.security.replaceCodes")}
              </Button>
              <Button
                variant="outline"
                disabled={busy}
                onClick={() => void run("disable")}
              >
                {t("auth.security.disable")}
              </Button>
            </div>
            {codes && (
              <CopyField
                label={t("auth.security.recoveryCodes")}
                value={codes.join("\n")}
              />
            )}
          </>
        ) : (
          <AuthenticatorSetup
            onDone={() => {
              void queryClient.invalidateQueries({ queryKey: ["me"] })
            }}
          />
        )}
      </CardContent>
    </Card>
  )
}
