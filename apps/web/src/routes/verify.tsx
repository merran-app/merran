import { useState } from "react"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { createFileRoute, useRouter } from "@tanstack/react-router"
import { useTranslation } from "react-i18next"
import { AuthLayout } from "@/components/layout/auth-layout"
import { TextField } from "@/components/form/text-field"
import { Button } from "@/components/ui/button"
import { Spinner } from "@/components/ui/spinner"
import { authClient, safeReturnTo } from "@/features/auth/client"
import { AuthenticatorSetup } from "@/features/auth/authenticator-setup"
import { meQuery } from "@/features/auth/queries"

export const Route = createFileRoute("/verify")({
  validateSearch: (search: Record<string, unknown>): { redirect?: string } =>
    typeof search.redirect === "string"
      ? { redirect: safeReturnTo(search.redirect) }
      : {},
  component: VerifyPage,
})

function VerifyPage() {
  const { t } = useTranslation()
  const { redirect: back } = Route.useSearch()
  const router = useRouter()
  const queryClient = useQueryClient()
  const { data: me, isPending } = useQuery(meQuery)
  const [recovery, setRecovery] = useState(false)
  const [code, setCode] = useState("")
  const [error, setError] = useState(false)
  const [busy, setBusy] = useState(false)
  const done = () => {
    queryClient.clear()
    router.history.push(safeReturnTo(back))
  }

  async function verifyCode(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setBusy(true)
    setError(false)
    try {
      const result = recovery
        ? await authClient.twoFactor.verifyBackupCode({
            code,
            disableSession: false,
          })
        : await authClient.twoFactor.verifyTotp({ code })
      if (result.error) setError(true)
      else done()
    } catch {
      setError(true)
    } finally {
      setBusy(false)
    }
  }

  async function signOut() {
    await authClient.signOut()
    queryClient.clear()
    router.history.push("/login")
  }

  return (
    <AuthLayout
      title={t("auth.security.verifyTitle")}
      description={t("auth.security.verifyHint")}
    >
      {isPending ? (
        <Spinner />
      ) : me && !me.twoFactorEnabled ? (
        <AuthenticatorSetup onDone={done} />
      ) : (
        <form className="grid gap-4" onSubmit={verifyCode}>
          {error && (
            <p role="alert" className="text-destructive">
              {t("auth.security.failed")}
            </p>
          )}
          <TextField
            label={t(
              recovery ? "auth.security.recoveryCode" : "auth.security.code"
            )}
            value={code}
            onChange={(e) => setCode(e.target.value)}
            autoComplete="one-time-code"
            required
          />
          <Button type="submit" disabled={busy}>
            {t("auth.security.verify")}
          </Button>
          <Button
            type="button"
            variant="ghost"
            onClick={() => {
              setRecovery(!recovery)
              setCode("")
            }}
          >
            {t(
              recovery
                ? "auth.security.useAuthenticator"
                : "auth.security.useRecovery"
            )}
          </Button>
        </form>
      )}
      <Button className="mt-4" variant="outline" onClick={signOut}>
        {t("auth.security.backToLogin")}
      </Button>
    </AuthLayout>
  )
}
