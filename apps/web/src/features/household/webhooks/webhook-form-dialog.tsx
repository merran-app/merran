import {
  Add01Icon,
  ArrowDown01Icon,
  Cancel01Icon,
} from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"
import { useQueryClient } from "@tanstack/react-query"
import * as React from "react"
import { Controller, useFieldArray, useForm } from "react-hook-form"
import { useTranslation } from "react-i18next"
import { toast } from "sonner"

import { CopyField } from "@/components/form/copy-field"
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
} from "@/components/ui/dialog"
import {
  Field,
  FieldContent,
  FieldError,
  FieldGroup,
  FieldLabel,
  FieldLegend,
  FieldSet,
} from "@/components/ui/field"
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible"
import { Spinner } from "@/components/ui/spinner"
import { Switch } from "@/components/ui/switch"
import { useMe } from "@/features/auth/use-me"
import {
  serverSettingsQuery,
  useSaveServerSettings,
} from "@/features/server/queries"
import { api, ApiError, unwrap } from "@/lib/api/client"
import { showFormError } from "@/lib/form-errors"

import { type PickableEvent } from "./event-areas"
import { EventPicker } from "./event-picker"
import { allowHomeNetwork, type HomeNetworkSetting } from "./home-network"
import { webhooksQuery, type WebhookDetail } from "./queries"

/** What a webhook can have beside its name and address, as the API caps it. */
const MAX_HEADERS = 5

/**
 * What a header's value can hold, as the API checks it: tabs, visible
 * ASCII and the rest of Latin-1, which fetch can send. Never a line break.
 */
const HEADER_VALUE = /^[\t\x20-\x7e\x80-\xff]*$/

type Form = {
  name: string
  address: string
  events: PickableEvent[]
  everything: boolean
  headers: { name: string; value: string }[]
}

/**
 * Adds a webhook, or changes the one it's given. A new webhook's secret is
 * shown once it's added, since the receiver needs it to check signatures.
 */
export function WebhookFormDialog({
  webhook,
  open,
  onOpenChange,
}: {
  webhook?: WebhookDetail
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const [secret, setSecret] = React.useState<string | null>(null)

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        onOpenChange(next)
        if (!next) setSecret(null)
      }}
    >
      <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-lg">
        {secret ? (
          <ShowSecret value={secret} />
        ) : (
          <WebhookForm
            webhook={webhook}
            onMade={setSecret}
            onClose={() => onOpenChange(false)}
          />
        )}
      </DialogContent>
    </Dialog>
  )
}

function defaultsFor(webhook: WebhookDetail | undefined): Form {
  if (!webhook) {
    return { name: "", address: "", events: [], everything: false, headers: [] }
  }
  return {
    name: webhook.name,
    address: webhook.address,
    events: webhook.events,
    everything: webhook.everything,
    // Header values are sealed, so only their names come back.
    headers: webhook.headers.map((name) => ({ name, value: "" })),
  }
}

function WebhookForm({
  webhook,
  onMade,
  onClose,
}: {
  webhook?: WebhookDetail
  onMade: (secret: string) => void
  onClose: () => void
}) {
  const { t } = useTranslation()
  const me = useMe()
  const queryClient = useQueryClient()
  const saveServerSettings = useSaveServerSettings()
  const [homeNetworkRefused, setHomeNetworkRefused] = React.useState(false)
  const [allowing, setAllowing] = React.useState(false)
  const defaults = React.useMemo(() => defaultsFor(webhook), [webhook])
  const form = useForm<Form>({ defaultValues: defaults })
  const headers = useFieldArray({ control: form.control, name: "headers" })
  const { errors, isSubmitting, submitCount } = form.formState
  const everything = form.watch("everything")
  const editing = webhook !== undefined
  // Headers are usually left out, so their row starts closed unless there are some.
  const [headersOpen, setHeadersOpen] = React.useState(
    defaults.headers.length > 0
  )
  const headersFailed = Boolean(errors.headers)

  // A header's error is hidden in a closed row, so every save that fails on
  // one opens it, even if it was closed again after the last.
  React.useEffect(() => {
    if (headersFailed) setHeadersOpen(true)
  }, [headersFailed, submitCount])

  /**
   * Whether saving sends the headers: always for a new webhook, and for one
   * being changed only when they were, as a change replaces them all.
   */
  function sendsHeaders(values: Form) {
    if (!editing) return true

    const sameNames =
      values.headers.map((header) => header.name).join("\n") ===
      defaults.headers.map((header) => header.name).join("\n")
    return !sameNames || values.headers.some((header) => header.value !== "")
  }

  /**
   * A header's value is needed whenever the headers are sent: the saved
   * ones are sealed, so a value left empty would replace one with nothing.
   */
  function checkHeaderValue(value: string, values: Form) {
    if (value === "") {
      return (
        !sendsHeaders(values) ||
        t("settings.household.webhooks.headerValueNeeded")
      )
    }
    return (
      HEADER_VALUE.test(value) ||
      t("settings.household.webhooks.headerValueCharacters")
    )
  }

  async function save(values: Form) {
    const body = {
      name: values.name.trim(),
      address: values.address.trim(),
      events: values.everything ? [] : values.events,
      everything: values.everything,
    }

    if (!webhook) {
      const made = await unwrap(
        api.POST("/api/households/current/webhooks", {
          body: { ...body, headers: values.headers },
        })
      )
      await queryClient.invalidateQueries({ queryKey: webhooksQuery.queryKey })
      onMade(made.secret)
      return
    }

    await unwrap(
      api.PATCH("/api/households/current/webhooks/{webhookId}", {
        params: { path: { webhookId: webhook.id } },
        body: sendsHeaders(values)
          ? { ...body, headers: values.headers }
          : body,
      })
    )
    await queryClient.invalidateQueries({ queryKey: ["household", "webhooks"] })
    toast.success(t("settings.household.webhooks.saved"))
    onClose()
  }

  const onSubmit = form.handleSubmit(async (values) => {
    if (!values.everything && values.events.length === 0) {
      form.setError("events", {
        message: t("settings.household.webhooks.eventsNeeded"),
      })
      return
    }
    setHomeNetworkRefused(false)
    try {
      await save(values)
    } catch (error) {
      if (error instanceof ApiError && error.code === "webhook_home_network") {
        setHomeNetworkRefused(true)
      }
      if (!showFormError(form.setError, error, { headers: "headers" })) {
        throw error
      }
    }
  })

  /** Gives this household the server admin's leave for the home network, then tries again. */
  async function allowAndRetry() {
    const household = me.activeHouseholdId
    if (!household) return
    setAllowing(true)
    try {
      const settings = await queryClient.fetchQuery({
        ...serverSettingsQuery,
        staleTime: 0,
      })
      const changes = allowHomeNetwork(
        homeNetworkFrom(settings.settings),
        household
      )
      if (changes) await saveServerSettings(changes)
    } catch (error) {
      if (!(error instanceof ApiError)) throw error
      toast.error(error.message)
      return
    } finally {
      setAllowing(false)
    }
    await onSubmit()
  }

  return (
    <form onSubmit={onSubmit} noValidate className="grid gap-6">
      <DialogHeader>
        <DialogTitle>
          {t(
            editing
              ? "settings.household.webhooks.editTitle"
              : "settings.household.webhooks.add"
          )}
        </DialogTitle>
        <DialogDescription>
          {t("settings.household.webhooks.formDescription")}
        </DialogDescription>
      </DialogHeader>
      <FieldGroup>
        {errors.root && (
          <Alert variant="destructive">
            <AlertDescription>{errors.root.message}</AlertDescription>
          </Alert>
        )}
        <TextField
          label={t("settings.household.webhooks.name")}
          placeholder={t("settings.household.webhooks.namePlaceholder")}
          error={errors.name?.message}
          {...form.register("name", {
            validate: (value) =>
              value.trim() !== "" ||
              t("settings.household.webhooks.nameNeeded"),
          })}
        />
        <TextField
          label={t("settings.household.webhooks.address")}
          type="url"
          inputMode="url"
          autoComplete="off"
          placeholder="https://"
          error={errors.address?.message}
          {...form.register("address", {
            validate: (value) =>
              value.trim() !== "" ||
              t("settings.household.webhooks.addressNeeded"),
          })}
        />
        {homeNetworkRefused && me.serverAdmin && (
          <Button
            type="button"
            variant="outline"
            onClick={allowAndRetry}
            disabled={allowing || isSubmitting}
          >
            {allowing && <Spinner />}
            {t("settings.household.webhooks.allowHomeNetwork")}
          </Button>
        )}
        <FieldSet>
          <FieldLegend variant="label">
            {t("settings.household.webhooks.eventsTitle")}
          </FieldLegend>
          <Controller
            control={form.control}
            name="everything"
            render={({ field }) => (
              <Field orientation="horizontal">
                <FieldContent>
                  <FieldLabel htmlFor="webhook-everything">
                    {t("settings.household.webhooks.everything")}
                  </FieldLabel>
                </FieldContent>
                <Switch
                  id="webhook-everything"
                  checked={field.value}
                  onCheckedChange={field.onChange}
                />
              </Field>
            )}
          />
          <Controller
            control={form.control}
            name="events"
            render={({ field }) => (
              <EventPicker
                value={field.value}
                onChange={field.onChange}
                everything={everything}
              />
            )}
          />
          {errors.events && <FieldError>{errors.events.message}</FieldError>}
        </FieldSet>
        <Collapsible open={headersOpen} onOpenChange={setHeadersOpen}>
          <CollapsibleTrigger className="group flex w-full items-center gap-2 rounded-md py-1 text-start text-sm font-medium outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50">
            <span>{t("settings.household.webhooks.headers")}</span>
            <span className="text-muted-foreground">
              {headers.fields.length > 0
                ? headers.fields.length
                : t("settings.household.webhooks.optional")}
            </span>
            <HugeiconsIcon
              icon={ArrowDown01Icon}
              strokeWidth={2}
              className="size-4 shrink-0 text-muted-foreground transition-transform group-data-[panel-open]:rotate-180"
            />
          </CollapsibleTrigger>
          {/* Kept mounted so the fields stay registered while the row is closed. */}
          <CollapsibleContent keepMounted>
            <FieldSet className="pt-3">
              {editing && headers.fields.length > 0 && (
                <p className="text-sm text-muted-foreground">
                  {t("settings.household.webhooks.headersSealed")}
                </p>
              )}
              {headers.fields.map((header, index) => (
                <div key={header.id} className="flex items-start gap-2">
                  <div className="grid min-w-0 flex-1 gap-2 sm:grid-cols-2">
                    <TextField
                      label={t("settings.household.webhooks.headerName")}
                      autoComplete="off"
                      error={errors.headers?.[index]?.name?.message}
                      {...form.register(`headers.${index}.name`)}
                    />
                    <TextField
                      label={t("settings.household.webhooks.headerValue")}
                      autoComplete="off"
                      error={errors.headers?.[index]?.value?.message}
                      {...form.register(`headers.${index}.value`, {
                        validate: checkHeaderValue,
                      })}
                    />
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    className="mt-6"
                    onClick={() => headers.remove(index)}
                  >
                    <HugeiconsIcon icon={Cancel01Icon} strokeWidth={2} />
                    <span className="sr-only">
                      {t("settings.household.webhooks.removeHeader")}
                    </span>
                  </Button>
                </div>
              ))}
              {errors.headers?.message && (
                <FieldError>{errors.headers.message}</FieldError>
              )}
              {headers.fields.length < MAX_HEADERS && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="w-fit"
                  onClick={() => headers.append({ name: "", value: "" })}
                >
                  <HugeiconsIcon icon={Add01Icon} strokeWidth={2} />
                  {t("settings.household.webhooks.addHeader")}
                </Button>
              )}
            </FieldSet>
          </CollapsibleContent>
        </Collapsible>
      </FieldGroup>
      <DialogFooter>
        <DialogClose render={<Button variant="outline" type="button" />}>
          {t("common.cancel")}
        </DialogClose>
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting && <Spinner />}
          {t(editing ? "common.save" : "settings.household.webhooks.add")}
        </Button>
      </DialogFooter>
    </form>
  )
}

/** The server's home network setting, as its settings list gives it. */
function homeNetworkFrom(
  settings: { key: string; value?: unknown }[]
): HomeNetworkSetting {
  const valueOf = (key: string) =>
    settings.find((setting) => setting.key === key)?.value
  const mode = valueOf("webhooks.homeNetwork")
  const households = valueOf("webhooks.homeNetworkHouseholds")
  return {
    mode: mode === "all" || mode === "chosen" ? mode : "off",
    households: Array.isArray(households) ? households.map(String) : [],
  }
}

function ShowSecret({ value }: { value: string }) {
  const { t } = useTranslation()

  return (
    <>
      <DialogHeader>
        <DialogTitle>{t("settings.household.webhooks.madeTitle")}</DialogTitle>
        <DialogDescription>
          {t("settings.household.webhooks.madeDescription")}
        </DialogDescription>
      </DialogHeader>
      <CopyField
        label={t("settings.household.webhooks.secret")}
        value={value}
      />
      <DialogFooter>
        <DialogClose render={<Button />}>{t("common.done")}</DialogClose>
      </DialogFooter>
    </>
  )
}
