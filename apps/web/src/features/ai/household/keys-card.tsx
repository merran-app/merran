import { useQuery, useQueryClient } from "@tanstack/react-query"
import { Link } from "@tanstack/react-router"
import { Trans, useTranslation } from "react-i18next"

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field"
import { Skeleton } from "@/components/ui/skeleton"
import { useMe } from "@/features/auth/use-me"
import { capabilitiesQuery } from "@/features/capabilities/queries"
import { api, unwrap } from "@/lib/api/client"

import { AiKeys } from "../ai-keys"
import { householdAiQuery } from "../queries"
import { KeyAlerts } from "./status"

/**
 * Settings → AI: whose keys pay. The server's, when they cover the
 * household, then its own, which household admins add and top up here.
 */
export function HouseholdAiKeysCard() {
  const { t } = useTranslation()
  const me = useMe()
  const queryClient = useQueryClient()
  const { data } = useQuery(householdAiQuery)

  // A household's first key can turn AI on for the server.
  const refresh = () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: householdAiQuery.queryKey }),
      queryClient.invalidateQueries({ queryKey: capabilitiesQuery.queryKey }),
    ])

  if (!data) {
    return (
      <Card>
        <CardContent>
          <Skeleton className="h-40" />
        </CardContent>
      </Card>
    )
  }

  const { server } = data.status
  const canAdd = data.status.mayAddKeys || data.status.mayAddAddresses

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("ai.household.keysTitle")}</CardTitle>
        <CardDescription>{t("ai.household.keysDescription")}</CardDescription>
      </CardHeader>
      <CardContent>
        <FieldGroup>
          <KeyAlerts data={data} />

          <Field>
            <FieldLabel>{t("ai.household.serverKeys")}</FieldLabel>
            <p className="text-sm text-muted-foreground">
              {!server.hasKeys
                ? t("ai.household.serverNone")
                : !server.covers
                  ? t("ai.household.serverNotCovered")
                  : t("ai.household.serverCovers")}
            </p>
          </Field>

          <Field>
            <FieldLabel>{t("ai.household.ownKeys")}</FieldLabel>
            {/* A model at home, like Ollama, is the server's to add. */}
            <FieldDescription>
              {me.serverAdmin ? (
                <Trans
                  i18nKey="ai.household.addressHintAdmin"
                  components={{
                    link: (
                      <Link
                        to="/settings/ai/server"
                        className="underline underline-offset-3"
                      />
                    ),
                  }}
                />
              ) : (
                t("ai.household.addressHint")
              )}
            </FieldDescription>
            {canAdd || data.keys.length > 0 ? (
              <AiKeys
                keys={data.keys}
                canAddKeys={data.status.mayAddKeys}
                canAddAddresses={data.status.mayAddAddresses}
                onAdd={async (key) => {
                  const added = await unwrap(
                    api.POST("/api/households/current/ai/keys", { body: key })
                  )
                  await refresh()
                  return added
                }}
                onRemove={async (key) => {
                  await unwrap(
                    api.DELETE("/api/households/current/ai/keys/{keyId}", {
                      params: { path: { keyId: key.id } },
                    })
                  )
                  await refresh()
                }}
                onTest={async (key) => {
                  const tested = await unwrap(
                    api.POST("/api/households/current/ai/keys/{keyId}/test", {
                      params: { path: { keyId: key.id } },
                    })
                  )
                  await refresh()
                  return tested
                }}
                onSetCredit={async (key, amount) => {
                  await unwrap(
                    api.PUT("/api/households/current/ai/keys/{keyId}/credit", {
                      params: { path: { keyId: key.id } },
                      body: { amount },
                    })
                  )
                  await refresh()
                }}
              />
            ) : (
              <p className="text-sm text-muted-foreground">
                {t("ai.household.noOwnKeys")}
              </p>
            )}
          </Field>
        </FieldGroup>
      </CardContent>
    </Card>
  )
}
