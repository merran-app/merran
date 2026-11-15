import { useSuspenseQuery } from "@tanstack/react-query"
import * as React from "react"
import { useTranslation } from "react-i18next"
import { toast } from "sonner"

import { Badge } from "@/components/ui/badge"
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
import { FieldGroup } from "@/components/ui/field"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { serverAiQuery } from "@/features/ai/queries"
import { LockedNote } from "@/features/settings/setting-fields"
import { ApiError } from "@/lib/api/client"

import { serverSettingsQuery, useSaveServerSettings } from "./queries"
import { ServerSwitch } from "./server-switch"

type HomeNetwork = "off" | "all" | "chosen"

const HOME_NETWORK_CHOICES = {
  off: "homeNetworkOff",
  all: "homeNetworkAll",
  chosen: "homeNetworkChosen",
} as const

/**
 * Webhooks: whether households may send them at all, and which households'
 * may reach the home network, where Home Assistant usually lives.
 */
export function WebhooksCard() {
  const { t } = useTranslation()
  const { data: settings } = useSuspenseQuery(serverSettingsQuery)
  // The households come from the AI settings, which already list them.
  const { data: ai } = useSuspenseQuery(serverAiQuery)
  const save = useSaveServerSettings()
  const [saving, setSaving] = React.useState(false)
  const state = (key: string) => settings.settings.find((s) => s.key === key)
  const enabled = state("webhooks.enabled")?.value === true
  const homeNetworkState = state("webhooks.homeNetwork")
  const homeNetwork = (homeNetworkState?.value ?? "off") as HomeNetwork
  const chosenState = state("webhooks.homeNetworkHouseholds")
  const chosen = Array.isArray(chosenState?.value)
    ? (chosenState.value as string[])
    : []

  async function change(changes: Record<string, unknown>) {
    setSaving(true)
    try {
      await save(changes)
      toast.success(t("settings.server.saved"))
    } catch (error) {
      if (!(error instanceof ApiError)) throw error
      toast.error(error.message)
    } finally {
      setSaving(false)
    }
  }

  function chooseHomeNetwork(value: string[]) {
    const next = value[0] as HomeNetwork | undefined
    if (next && next !== homeNetwork) {
      void change({ "webhooks.homeNetwork": next })
    }
  }

  function toggleHousehold(id: string, checked: boolean) {
    const next = checked ? [...chosen, id] : chosen.filter((x) => x !== id)
    void change({ "webhooks.homeNetworkHouseholds": next })
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("settings.server.webhooks.title")}</CardTitle>
        <CardDescription>
          {t("settings.server.webhooks.description")}
        </CardDescription>
        <CardAction>
          <Badge variant={enabled ? "default" : "secondary"}>
            {enabled ? t("common.on") : t("common.off")}
          </Badge>
        </CardAction>
      </CardHeader>
      <CardContent>
        <FieldGroup>
          <ServerSwitch
            settingKey="webhooks.enabled"
            label={t("settings.server.webhooks.enabled")}
            description={t("settings.server.webhooks.enabledHint")}
          />
          <div className="grid gap-2 text-sm">
            <p className="font-medium">
              {t("settings.server.webhooks.homeNetwork")}
            </p>
            <ToggleGroup
              variant="outline"
              value={[homeNetwork]}
              disabled={saving || Boolean(homeNetworkState?.lockedBy)}
              onValueChange={chooseHomeNetwork}
              aria-label={t("settings.server.webhooks.homeNetwork")}
              className="w-full"
            >
              {(Object.keys(HOME_NETWORK_CHOICES) as HomeNetwork[]).map(
                (option) => (
                  <ToggleGroupItem
                    key={option}
                    value={option}
                    className="flex-1"
                  >
                    {t(
                      `settings.server.webhooks.${HOME_NETWORK_CHOICES[option]}`
                    )}
                  </ToggleGroupItem>
                )
              )}
            </ToggleGroup>
            <p className="text-muted-foreground">
              {homeNetworkState?.lockedBy ? (
                <LockedNote state={homeNetworkState} />
              ) : (
                t("settings.server.webhooks.homeNetworkHint")
              )}
            </p>
          </div>
          {homeNetwork === "chosen" && (
            <div
              role="group"
              aria-label={t("settings.server.webhooks.homeNetworkChosen")}
              className="grid gap-2 text-sm"
            >
              {ai.households.map((household) => (
                <label key={household.id} className="flex items-center gap-2">
                  <Checkbox
                    checked={chosen.includes(household.id)}
                    disabled={saving || Boolean(chosenState?.lockedBy)}
                    onCheckedChange={(checked) =>
                      toggleHousehold(household.id, checked)
                    }
                  />
                  {household.name}
                </label>
              ))}
            </div>
          )}
        </FieldGroup>
      </CardContent>
    </Card>
  )
}
