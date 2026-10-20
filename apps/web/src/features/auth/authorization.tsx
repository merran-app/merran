import { useEffect, useState } from "react"
import { useQuery } from "@tanstack/react-query"
import { useTranslation } from "react-i18next"
import { AuthLayout } from "@/components/layout/auth-layout"
import { Button } from "@/components/ui/button"
import { Spinner } from "@/components/ui/spinner"
import { SelectField } from "@/components/form/select-field"
import { meQuery } from "./queries"

/** Only signed parameters go back to the provider; local UI state stays separate. */
function signedQuery(params: URLSearchParams) {
  const names = new Set([...params.getAll("ba_param"), "sig", "ba_param"])
  return new URLSearchParams(
    [...params].filter(([key]) => names.has(key))
  ).toString()
}

export async function oauthRequest(path: string, body?: unknown) {
  const response = await fetch("/api/auth/oauth2/" + path, {
    method: body === undefined ? "GET" : "POST",
    credentials: "same-origin",
    ...(body === undefined
      ? {}
      : {
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        }),
  })
  if (!response.ok) throw new Error("Authorization failed")
  return response.json()
}

export function AuthorizationPage({
  chooseHousehold = false,
}: {
  chooseHousehold?: boolean
}) {
  const { t } = useTranslation()
  const { data: me, isPending } = useQuery(meQuery)
  const params = new URLSearchParams(window.location.search)
  const clientId = params.get("client_id") ?? ""
  const { data: client, isError: clientError } = useQuery({
    queryKey: ["oauth-client", clientId],
    enabled: !!me && !me.requiresTwoFactor,
    queryFn: () =>
      oauthRequest("public-client?client_id=" + encodeURIComponent(clientId)),
  })
  const [household, setHousehold] = useState(
    params.get("merran_household") ?? ""
  )
  const selected =
    household || me?.activeHouseholdId || me?.households[0]?.id || ""
  const [busy, setBusy] = useState(false)
  const [failed, setFailed] = useState(false)
  useEffect(() => {
    if (isPending) return
    if (!me) {
      const pending = signedQuery(new URLSearchParams(window.location.search))
      window.location.replace("/login?" + pending)
    } else if (me.requiresTwoFactor) {
      const back = window.location.pathname + window.location.search
      window.location.replace("/verify?redirect=" + encodeURIComponent(back))
    }
  }, [isPending, me])

  const proceed = async (accept: boolean) => {
    setBusy(true)
    setFailed(false)
    try {
      const result = await oauthRequest(
        chooseHousehold ? "continue" : "consent",
        {
          ...(chooseHousehold ? { postLogin: true } : { accept }),
          oauth_query: signedQuery(params),
          householdId: selected,
        }
      )
      const target = new URL(
        result.url ?? result.redirect_uri,
        window.location.origin
      )
      if (!["http:", "https:"].includes(target.protocol))
        throw new Error("Invalid redirect")
      if (
        target.origin === window.location.origin &&
        target.pathname.startsWith("/authorize")
      )
        target.searchParams.set("merran_household", selected)
      window.location.assign(target.href)
    } catch {
      setFailed(true)
      setBusy(false)
    }
  }
  if (isPending) return <Spinner />
  if (!me || me.requiresTwoFactor) return null
  return (
    <AuthLayout
      title={t(
        chooseHousehold ? "auth.oauth.chooseHousehold" : "auth.oauth.title"
      )}
      description={t("auth.oauth.description")}
    >
      <div className="grid gap-4">
        {(failed || clientError) && (
          <p role="alert" className="text-destructive">
            {t("auth.oauth.failed")}
          </p>
        )}
        <p className="font-medium break-all">{client?.name ?? clientId}</p>
        <SelectField
          label={t("auth.oauth.household")}
          value={selected}
          onChange={setHousehold}
          options={me.households.map((household) => ({
            value: household.id,
            label: household.name,
          }))}
        />
        {!chooseHousehold && (
          <>
            <p>
              {t(
                params.get("resource")?.endsWith("/mcp")
                  ? "auth.oauth.mcp"
                  : "auth.oauth.api"
              )}
            </p>
            <ul className="list-inside list-disc">
              {(params.get("scope") ?? "")
                .split(" ")
                .filter(Boolean)
                .map((scope) => (
                  <li key={scope}>
                    {t(`auth.oauth.scopes.${scope}`, { defaultValue: scope })}
                  </li>
                ))}
            </ul>
          </>
        )}
        <Button
          disabled={busy || !selected || !client || clientError}
          onClick={() => proceed(true)}
        >
          {t(chooseHousehold ? "auth.oauth.continue" : "auth.oauth.allow")}
        </Button>
        {!chooseHousehold && (
          <Button
            variant="outline"
            disabled={busy}
            onClick={() => proceed(false)}
          >
            {t("auth.oauth.deny")}
          </Button>
        )}
      </div>
    </AuthLayout>
  )
}
