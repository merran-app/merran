import { useState } from "react"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { useTranslation } from "react-i18next"
import { api, unwrap } from "@/lib/api/client"
import { useCapability } from "@/features/capabilities/queries"
import { oauthRequest } from "@/features/auth/authorization"
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from "@/components/ui/card"
import { TextField } from "@/components/form/text-field"
import { CopyField } from "@/components/form/copy-field"
import { Button } from "@/components/ui/button"

export function OAuthClientsCard() {
  const { t } = useTranslation()
  const enabled = useCapability("auth.oauth")
  const cache = useQueryClient()
  const { data } = useQuery({
    queryKey: ["oauth-clients"],
    enabled,
    queryFn: () => unwrap(api.GET("/api/auth/oauth-clients")),
  })
  const [name, setName] = useState("")
  const [redirectUri, setRedirectUri] = useState("")
  const [resource, setResource] = useState("mcp")
  const [credentials, setCredentials] = useState<{
    client_id: string
    client_secret?: string
  } | null>(null)
  const [failed, setFailed] = useState(false)
  const [busy, setBusy] = useState(false)
  if (!enabled) return null

  async function registerClient(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setBusy(true)
    setFailed(false)
    setCredentials(null)
    try {
      const metadata = await fetch(
        "/.well-known/oauth-protected-resource/" + resource
      ).then((response) => response.json())
      const result = await oauthRequest("create-client", {
        client_name: name,
        redirect_uris: [redirectUri],
        resources: [metadata.resource],
        token_endpoint_auth_method: "client_secret_basic",
        grant_types: ["authorization_code", "refresh_token"],
        response_types: ["code"],
      })
      setCredentials(result)
      await cache.invalidateQueries({ queryKey: ["oauth-clients"] })
    } catch {
      setFailed(true)
    } finally {
      setBusy(false)
    }
  }

  async function removeClient(clientId: string) {
    setBusy(true)
    setFailed(false)
    try {
      await unwrap(
        api.DELETE("/api/auth/oauth-clients/{clientId}", {
          params: { path: { clientId: clientId } },
        })
      )
      await cache.invalidateQueries({ queryKey: ["oauth-clients"] })
    } catch {
      setFailed(true)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("auth.oauth.clients")}</CardTitle>
        <CardDescription>{t("auth.oauth.clientsHint")}</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4">
        {failed && (
          <p role="alert" className="text-destructive">
            {t("auth.oauth.failed")}
          </p>
        )}
        <form className="grid gap-4" onSubmit={registerClient}>
          <TextField
            label={t("auth.oauth.clientName")}
            value={name}
            onChange={(event) => setName(event.target.value)}
            required
          />
          <TextField
            label={t("auth.oauth.redirectUri")}
            value={redirectUri}
            onChange={(event) => setRedirectUri(event.target.value)}
            type="url"
            required
          />
          <label className="grid gap-2">
            {t("auth.oauth.resource")}
            <select
              className="rounded-md border bg-background p-2"
              value={resource}
              onChange={(event) => setResource(event.target.value)}
            >
              <option value="mcp">{t("auth.oauth.mcpInterface")}</option>
              <option value="api">{t("auth.oauth.apiInterface")}</option>
            </select>
          </label>
          <Button type="submit" disabled={busy}>
            {t("auth.oauth.register")}
          </Button>
        </form>
        {credentials && (
          <div className="grid gap-3 rounded-lg border p-4">
            <p>{t("auth.oauth.saveSecret")}</p>
            <CopyField
              label={t("auth.oauth.clientId")}
              value={credentials.client_id}
            />
            {credentials.client_secret && (
              <CopyField
                label={t("auth.oauth.clientSecret")}
                value={credentials.client_secret}
              />
            )}
          </div>
        )}
        {data?.map((client) => (
          <div
            key={client.clientId}
            className="grid gap-2 rounded-lg border p-4"
          >
            <p className="break-all">{client.name ?? client.clientId}</p>
            <p className="text-sm break-all text-muted-foreground">
              {client.redirectUris.join(", ")}
            </p>
            <Button
              variant="outline"
              disabled={busy}
              onClick={() => removeClient(client.clientId)}
            >
              {t("auth.oauth.removeClient")}
            </Button>
          </div>
        ))}
      </CardContent>
    </Card>
  )
}
