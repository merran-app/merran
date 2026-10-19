import { Add01Icon } from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"
import { useQueryClient } from "@tanstack/react-query"
import * as React from "react"
import { Controller, useForm } from "react-hook-form"
import { useTranslation } from "react-i18next"

import { CopyField } from "@/components/form/copy-field"
import { SelectField } from "@/components/form/select-field"
import { TextField } from "@/components/form/text-field"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import {
  FieldGroup,
  FieldLegend,
  FieldSet,
  FieldDescription,
} from "@/components/ui/field"
import { Spinner } from "@/components/ui/spinner"
import {
  Drawer,
  DrawerClose,
  DrawerContent,
  DrawerDescription,
  DrawerTitle,
  DrawerTrigger,
} from "@/components/ui/drawer"
import { useIsMobile } from "@/hooks/use-mobile"
import { useActiveHousehold } from "@/features/auth/use-me"
import { api, unwrap } from "@/lib/api/client"
import { showFormError } from "@/lib/form-errors"

import { AREAS, READ_ONLY_AREAS, type Area } from "./api-key-areas"
import { apiKeysQuery, type ApiKeyPermissions } from "./queries"

type Access = "none" | "read" | "write"
type Expiry = "30" | "90" | "365" | "never"

type Form = {
  name: string
  expiry: Expiry
  access: Record<Area, Access>
}

const DEFAULTS: Form = {
  name: "",
  expiry: "90",
  access: {
    household: "read",
    recipes: "read",
    plan: "read",
    list: "read",
    pantry: "read",
    imports: "none",
    assistant: "none",
  },
}

/** Makes a key for the household in use, then shows it once. */
export function NewApiKeyDialog({ mcp = false }: { mcp?: boolean }) {
  const { t } = useTranslation()
  const phone = useIsMobile()
  const Root = phone ? Drawer : Dialog
  const Trigger = phone ? DrawerTrigger : DialogTrigger
  const [open, setOpen] = React.useState(false)
  const [key, setKey] = React.useState<string | null>(null)
  const body = key ? (
    <ShowKey value={key} mcp={mcp} phone={phone} />
  ) : (
    <NewKeyForm onMade={setKey} mcp={mcp} phone={phone} />
  )

  return (
    <Root
      open={open}
      onOpenChange={(next) => {
        setOpen(next)
        if (!next) setKey(null)
      }}
    >
      <Trigger
        render={
          <Button size="sm">
            <HugeiconsIcon icon={Add01Icon} strokeWidth={2} />
            {t(
              mcp
                ? "settings.you.apiKeys.mcp.make"
                : "settings.you.apiKeys.make"
            )}
          </Button>
        }
      />
      {phone ? (
        <DrawerContent className="max-h-[90dvh]">
          <div className="grid min-h-0 gap-6 overflow-y-auto overscroll-contain p-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
            {body}
          </div>
        </DrawerContent>
      ) : (
        <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-lg">
          {body}
        </DialogContent>
      )}
    </Root>
  )
}

function NewKeyForm({
  onMade,
  mcp,
  phone,
}: {
  onMade: (key: string) => void
  mcp: boolean
  phone: boolean
}) {
  const { t } = useTranslation()
  const Title = phone ? DrawerTitle : DialogTitle
  const Description = phone ? DrawerDescription : DialogDescription
  const Close = phone ? DrawerClose : DialogClose
  const household = useActiveHousehold()
  const queryClient = useQueryClient()
  const form = useForm<Form>({ defaultValues: DEFAULTS })
  const { errors, isSubmitting } = form.formState

  const expiryOptions = (["30", "90", "365", "never"] as const).map(
    (value) => ({
      value,
      label: t(`settings.you.apiKeys.expiry.${value}`),
    })
  )

  const onSubmit = form.handleSubmit(async ({ name, expiry, access }) => {
    const permissions: ApiKeyPermissions = {}
    for (const area of AREAS) {
      const level = access[area]
      if (level === "none") continue
      if (area === "household") permissions.household = "read"
      else permissions[area] = level
    }
    try {
      const made = await unwrap(
        api.POST("/api/auth/api-keys", {
          body: {
            name,
            permissions,
            expiresInDays:
              expiry === "never" ? null : (Number(expiry) as 30 | 90 | 365),
          },
        })
      )
      await queryClient.invalidateQueries({ queryKey: apiKeysQuery.queryKey })
      onMade(made.key)
    } catch (error) {
      if (!showFormError(form.setError, error)) throw error
    }
  })

  return (
    <form onSubmit={onSubmit} noValidate className="grid gap-6">
      <DialogHeader>
        <Title>
          {t(
            mcp ? "settings.you.apiKeys.mcp.make" : "settings.you.apiKeys.make"
          )}
        </Title>
        <Description>
          {t("settings.you.apiKeys.makeDescription", {
            household: household?.name,
          })}
        </Description>
      </DialogHeader>
      <FieldGroup>
        {mcp && (
          <p className="text-sm text-muted-foreground">
            {t("settings.you.apiKeys.mcp.permissions")}
          </p>
        )}
        {errors.root && (
          <Alert variant="destructive">
            <AlertDescription>{errors.root.message}</AlertDescription>
          </Alert>
        )}
        <TextField
          label={t("settings.you.apiKeys.name")}
          placeholder={t("settings.you.apiKeys.namePlaceholder")}
          error={errors.name?.message}
          {...form.register("name", {
            validate: (value) =>
              value.trim() !== "" || t("settings.you.apiKeys.nameNeeded"),
          })}
        />
        <Controller
          control={form.control}
          name="expiry"
          render={({ field }) => (
            <SelectField
              label={t("settings.you.apiKeys.expiryLabel")}
              value={field.value}
              onChange={field.onChange}
              options={expiryOptions}
            />
          )}
        />
        <FieldSet>
          <FieldLegend variant="label">
            {t("settings.you.apiKeys.permissions")}
          </FieldLegend>
          <FieldDescription>
            {t("settings.you.apiKeys.permissionsHint")}
          </FieldDescription>
          <div className="grid gap-4 sm:grid-cols-2">
            {AREAS.map((area) => (
              <Controller
                key={area}
                control={form.control}
                name={`access.${area}`}
                render={({ field }) => (
                  <SelectField
                    label={t(`settings.you.apiKeys.areas.${area}`)}
                    value={field.value}
                    onChange={field.onChange}
                    options={levelsFor(area).map((value) => ({
                      value,
                      label: t(`settings.you.apiKeys.level.${value}`),
                    }))}
                  />
                )}
              />
            ))}
          </div>
        </FieldSet>
      </FieldGroup>
      <DialogFooter>
        <Close render={<Button variant="outline" type="button" />}>
          {t("common.cancel")}
        </Close>
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting && <Spinner />}
          {t("settings.you.apiKeys.makeSubmit")}
        </Button>
      </DialogFooter>
    </form>
  )
}

/** What an area can be given. Labelled where `t` is, as passing it on is too deep for TypeScript. */
function levelsFor(area: Area): Access[] {
  return READ_ONLY_AREAS.includes(area)
    ? ["none", "read"]
    : ["none", "read", "write"]
}

function ShowKey({
  value,
  mcp,
  phone,
}: {
  value: string
  mcp: boolean
  phone: boolean
}) {
  const { t } = useTranslation()
  const Title = phone ? DrawerTitle : DialogTitle
  const Description = phone ? DrawerDescription : DialogDescription
  const Close = phone ? DrawerClose : DialogClose
  return (
    <>
      <DialogHeader>
        <Title>{t("settings.you.apiKeys.madeTitle")}</Title>
        <Description>{t("settings.you.apiKeys.madeDescription")}</Description>
      </DialogHeader>
      <CopyField label={t("settings.you.apiKeys.key")} value={value} />
      {mcp && (
        <>
          <CopyField
            label={t("settings.you.apiKeys.mcp.url")}
            value={new URL("/mcp", window.location.origin).href}
          />
          <CopyField
            label={t("settings.you.apiKeys.mcp.authorization")}
            value={`Bearer ${value}`}
          />
          <p className="text-sm text-muted-foreground">
            {t("settings.you.apiKeys.mcp.connect")}
          </p>
          <a
            className="text-sm underline"
            href="https://merran.app/docs/integrations/mcp/"
            target="_blank"
            rel="noreferrer"
          >
            {t("settings.you.apiKeys.mcp.guide")}
          </a>
        </>
      )}
      <DialogFooter>
        <Close render={<Button />}>{t("common.done")}</Close>
      </DialogFooter>
    </>
  )
}
