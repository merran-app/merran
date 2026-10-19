import { useState } from "react"
import { useTranslation } from "react-i18next"
import { CopyField } from "@/components/form/copy-field"
import { TextField } from "@/components/form/text-field"
import { Button } from "@/components/ui/button"
import { authClient } from "./client"

/** Enrollment stays on the page so the secret and recovery codes remain easy to save on a phone. */
export function AuthenticatorSetup({ onDone }: { onDone: () => void }) {
  const { t } = useTranslation()
  const [password, setPassword] = useState("")
  const [code, setCode] = useState("")
  const [setup, setSetup] = useState<{
    totpURI: string
    backupCodes: string[]
  } | null>(null)
  const [error, setError] = useState(false)
  const [busy, setBusy] = useState(false)

  async function submitSetup(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setBusy(true)
    setError(false)
    try {
      if (setup) {
        const result = await authClient.twoFactor.verifyTotp({ code })
        if (result.error) setError(true)
        else onDone()
      } else {
        const result = await authClient.twoFactor.enable({
          password: password || undefined,
        })
        if (result.error) setError(true)
        else if (result.data?.method === "totp") {
          setSetup(result.data)
          setPassword("")
        }
      }
    } catch {
      setError(true)
    } finally {
      setBusy(false)
    }
  }

  return (
    <form className="grid gap-4" onSubmit={submitSetup}>
      {error && (
        <p role="alert" className="text-destructive">
          {t("auth.security.failed")}
        </p>
      )}
      {setup ? (
        <>
          <p>{t("auth.security.setupHint")}</p>
          <CopyField
            label={t("auth.security.secret")}
            value={new URL(setup.totpURI).searchParams.get("secret") ?? ""}
          />
          <CopyField
            label={t("auth.security.recoveryCodes")}
            value={setup.backupCodes.join("\n")}
          />
          <p className="text-sm text-muted-foreground">
            {t("auth.security.saveCodes")}
          </p>
          <TextField
            label={t("auth.security.code")}
            value={code}
            onChange={(e) => setCode(e.target.value)}
            autoComplete="one-time-code"
            inputMode="numeric"
            required
          />
        </>
      ) : (
        <TextField
          label={t("auth.security.password")}
          type="password"
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          description={t("auth.security.passwordHint")}
        />
      )}
      <Button type="submit" disabled={busy}>
        {t(setup ? "auth.security.verify" : "auth.security.setup")}
      </Button>
    </form>
  )
}
