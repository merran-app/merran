import { useQuery, useQueryClient } from "@tanstack/react-query"
import * as React from "react"
import { useTranslation } from "react-i18next"
import { toast } from "sonner"

import { ConfirmDialog } from "@/components/confirm-dialog"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Field, FieldContent, FieldLabel } from "@/components/ui/field"
import { Skeleton } from "@/components/ui/skeleton"
import { Spinner } from "@/components/ui/spinner"
import { Switch } from "@/components/ui/switch"
import {
  householdSharesQuery,
  useStopSharing,
  type HouseholdShare,
} from "@/features/sharing/queries"
import { api, ApiError, unwrap } from "@/lib/api/client"
import { formatRelativeDate } from "@/lib/format"

import { householdQuery } from "./queries"

/**
 * Settings → Household → Sharing: whether members can share recipes by
 * link, and every link that's out there. Household admins only.
 */
export function SharingCard() {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const { data: household } = useQuery(householdQuery)
  const { data, isError } = useQuery(householdSharesQuery)
  const [saving, setSaving] = React.useState(false)
  const id = React.useId()

  async function save(recipeSharing: boolean) {
    setSaving(true)
    try {
      queryClient.setQueryData(
        householdQuery.queryKey,
        await unwrap(
          api.PATCH("/api/households/current", {
            body: { recipeSharing },
          })
        )
      )
      toast.success(t("sharing.settings.saved"))
    } catch (err) {
      if (!(err instanceof ApiError)) throw err
      toast.error(err.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("sharing.settings.cardTitle")}</CardTitle>
        <CardDescription>
          {t("sharing.settings.cardDescription")}
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-6">
        {!household ? (
          <Skeleton className="h-10" />
        ) : (
          <Field orientation="horizontal">
            <FieldContent>
              <FieldLabel id={`${id}-label`} htmlFor={id}>
                {t("sharing.settings.allow")}
              </FieldLabel>
              <p className="text-sm text-muted-foreground">
                {t("sharing.settings.allowHint")}
              </p>
            </FieldContent>
            {saving && <Spinner />}
            <Switch
              id={id}
              aria-labelledby={`${id}-label`}
              checked={household.recipeSharing}
              onCheckedChange={(on) => void save(on)}
              disabled={saving}
            />
          </Field>
        )}

        <div className="grid gap-3">
          <h3 className="text-sm font-medium">
            {t("sharing.settings.listTitle")}
          </h3>
          {isError ? (
            <p className="text-sm text-destructive">
              {t("sharing.settings.loadFailed")}
            </p>
          ) : !data ? (
            <Skeleton className="h-16" />
          ) : data.shares.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              {t("sharing.settings.empty")}
            </p>
          ) : (
            <ul className="grid gap-3">
              {data.shares.map((share) => (
                <ShareRow key={share.recipe.slug} share={share} />
              ))}
            </ul>
          )}
        </div>
      </CardContent>
    </Card>
  )
}

/** One shared recipe: who shared it, when, and whether anyone has used it. */
function ShareRow({ share }: { share: HouseholdShare }) {
  const { t, i18n } = useTranslation()
  const stopSharing = useStopSharing(share.recipe.slug)

  async function stop() {
    try {
      await stopSharing.mutateAsync()
      toast.success(t("sharing.stop.done"))
    } catch (err) {
      if (!(err instanceof ApiError)) throw err
      toast.error(err.message)
    }
  }

  const opened = share.openedAt
    ? t("sharing.settings.opened", {
        when: formatRelativeDate(share.openedAt, i18n.language),
      })
    : t("sharing.settings.neverOpened")

  return (
    <li className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
      <div className="min-w-0">
        <p className="truncate font-medium">{share.recipe.name}</p>
        <p className="text-sm text-muted-foreground">
          {t("sharing.settings.line", {
            name: share.sharedBy?.name ?? t("sharing.settings.memberLeft"),
            when: formatRelativeDate(share.createdAt, i18n.language),
            opened,
          })}
        </p>
        {!share.url && (
          <p className="text-sm text-muted-foreground">
            {t("sharing.settings.noAddress")}
          </p>
        )}
      </div>
      <ConfirmDialog
        trigger={
          <Button variant="outline" size="sm">
            {t("sharing.stopSharing")}
          </Button>
        }
        title={t("sharing.stop.title")}
        description={t("sharing.stop.description")}
        confirm={t("sharing.stopSharing")}
        onConfirm={stop}
      />
    </li>
  )
}
