import { useQueryClient } from "@tanstack/react-query"
import {
  createFileRoute,
  Link,
  redirect,
  useNavigate,
} from "@tanstack/react-router"
import { useForm } from "react-hook-form"
import { useTranslation } from "react-i18next"

import { TextField } from "@/components/form/text-field"
import { AuthLayout } from "@/components/layout/auth-layout"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { FieldGroup } from "@/components/ui/field"
import { Spinner } from "@/components/ui/spinner"
import {
  AccountFields,
  EMPTY_ACCOUNT,
  type AccountForm,
} from "@/features/auth/account-fields"
import { meQuery, setupQuery } from "@/features/auth/queries"
import { api, ApiError, unwrap } from "@/lib/api/client"
import { showFormError } from "@/lib/form-errors"

export const Route = createFileRoute("/setup")({
  beforeLoad: async ({ context }) => {
    const setup = await context.queryClient.fetchQuery(setupQuery)
    if (!setup.needed) throw redirect({ to: "/login" })
  },
  component: SetupPage,
})

type Form = AccountForm & { code: string; household: string }

function SetupPage() {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const form = useForm<Form>({
    defaultValues: { ...EMPTY_ACCOUNT, code: "", household: "" },
  })
  const { errors, isSubmitting } = form.formState

  const onSubmit = form.handleSubmit(
    async ({ confirmPassword: _confirmation, ...values }) => {
      try {
        const me = await unwrap(api.POST("/api/auth/setup", { body: values }))
        queryClient.setQueryData(meQuery.queryKey, me)
        queryClient.removeQueries({ queryKey: setupQuery.queryKey })
        await navigate({ to: "/" })
      } catch (error) {
        if (error instanceof ApiError && error.status >= 500) {
          form.setError("root", { message: t("auth.setup.partialFailure") })
          return
        }
        if (!(error instanceof ApiError)) {
          form.setError("root", { message: t("auth.setup.connectionFailure") })
          return
        }
        if (!showFormError(form.setError, error)) throw error
      }
    }
  )

  return (
    <AuthLayout
      wide
      title={t("auth.setup.title")}
      description={t("auth.setup.description")}
    >
      <form onSubmit={onSubmit} noValidate>
        <FieldGroup className="gap-4 [&_[data-slot=field]]:gap-1.5">
          {errors.root && (
            <Alert variant="destructive">
              <AlertDescription>{errors.root.message}</AlertDescription>
            </Alert>
          )}
          <section className="grid min-w-0 gap-3 rounded-2xl border bg-muted/30 p-3">
            <TextField
              label={t("auth.setup.code")}
              description={t("auth.setup.codeHint")}
              autoComplete="one-time-code"
              autoCapitalize="characters"
              error={errors.code?.message}
              {...form.register("code", {
                required: t("auth.fields.required"),
              })}
            />
            <details className="min-w-0 border-t pt-3 text-sm">
              <summary className="cursor-pointer font-medium">
                {t("auth.setup.findCode")}
              </summary>
              <div className="grid min-w-0 gap-3 pt-3 [&_code]:block [&_code]:overflow-x-auto [&_code]:rounded-lg [&_code]:bg-muted [&_code]:p-3 [&_code]:text-xs [&_code]:whitespace-nowrap">
                <p>{t("auth.setup.codeHelp")}</p>
                <code>docker compose exec merran merran setup-code</code>
                <code>docker exec merran merran setup-code</code>
                <p>{t("auth.setup.codeLogs")}</p>
                <code>docker compose logs merran</code>
                <p>{t("auth.setup.codeRestart")}</p>
                <a
                  href="https://merran.app/docs/get-started/setup/"
                  target="_blank"
                  rel="noreferrer"
                  className="underline"
                >
                  {t("auth.setup.guide")}
                </a>
              </div>
            </details>
          </section>
          <fieldset className="min-w-0">
            <legend className="mb-3 text-sm font-semibold">
              {t("auth.setup.accountHeading")}
            </legend>
            <AccountFields columns register={form.register} errors={errors}>
              <TextField
                label={t("auth.setup.household")}
                description={t("auth.setup.householdHint")}
                error={errors.household?.message}
                {...form.register("household", {
                  validate: (value) =>
                    value.trim().length > 0 || t("auth.fields.required"),
                  maxLength: 100,
                })}
              />
            </AccountFields>
          </fieldset>
          <div className="flex flex-col-reverse gap-4 border-t pt-4 sm:flex-row sm:items-center sm:justify-between">
            <Link
              to="/login"
              className="text-center text-sm underline underline-offset-4 sm:text-left"
            >
              {t("auth.setup.signIn")}
            </Link>
            <Button
              className="sm:min-w-40"
              type="submit"
              disabled={isSubmitting}
            >
              {isSubmitting && <Spinner />}
              {t("auth.setup.submit")}
            </Button>
          </div>
        </FieldGroup>
      </form>
    </AuthLayout>
  )
}
