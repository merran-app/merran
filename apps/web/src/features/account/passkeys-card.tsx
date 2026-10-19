import { useState } from "react"
import { useQuery, useQueryClient } from "@tanstack/react-query"
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
import { authClient } from "@/features/auth/client"
import { useCapability } from "@/features/capabilities/queries"

export function PasskeysCard() {
  const { t } = useTranslation()
  const enabled = useCapability("auth.passkeys")
  const queryClient = useQueryClient()
  const [name, setName] = useState("")
  const [error, setError] = useState(false)
  const [busy, setBusy] = useState(false)
  const { data } = useQuery({
    queryKey: ["passkeys"],
    enabled,
    queryFn: async () => {
      const result = await authClient.passkey.listUserPasskeys()
      if (result.error) throw new Error(result.error.message)
      return result.data
    },
  })
  if (!enabled) return null
  const run = async (action: () => Promise<{ error?: unknown }>) => {
    setBusy(true)
    setError(false)
    try {
      const result = await action()
      if (result.error) setError(true)
      else {
        setName("")
        await queryClient.invalidateQueries({ queryKey: ["passkeys"] })
      }
    } catch {
      setError(true)
    } finally {
      setBusy(false)
    }
  }
  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("auth.security.passkeys")}</CardTitle>
        <CardDescription>{t("auth.security.passkeysHint")}</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4">
        {error && (
          <p role="alert" className="text-destructive">
            {t("auth.security.failed")}
          </p>
        )}
        <form
          className="grid gap-3"
          onSubmit={(e) => {
            e.preventDefault()
            void run(() => authClient.passkey.addPasskey({ name }))
          }}
        >
          <TextField
            label={t("auth.security.passkeyName")}
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
          <Button disabled={busy} type="submit">
            {t("auth.security.addPasskey")}
          </Button>
        </form>
        <ul className="divide-y">
          {data?.map((key) => (
            <li
              key={key.id}
              className="flex flex-wrap items-center justify-between gap-3 py-3"
            >
              <span>{key.name || t("auth.security.passkey")}</span>
              <Button
                variant="outline"
                disabled={busy}
                onClick={() =>
                  void run(() =>
                    authClient.passkey.deletePasskey({ id: key.id })
                  )
                }
              >
                {t("auth.security.remove")}
              </Button>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  )
}
