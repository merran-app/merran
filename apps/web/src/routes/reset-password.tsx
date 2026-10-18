import { useQueryClient } from "@tanstack/react-query"
import { createFileRoute, Link } from "@tanstack/react-router"
import * as React from "react"
import { useForm } from "react-hook-form"
import { useTranslation } from "react-i18next"
import { AuthLayout } from "@/components/layout/auth-layout"
import { PasswordField } from "@/components/form/password-field"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { FieldGroup } from "@/components/ui/field"
import { Spinner } from "@/components/ui/spinner"
import { api } from "@/lib/api/client"

export const Route = createFileRoute("/reset-password")({
  component: ResetPassword,
})

function ResetPassword() {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  // Fragments are not sent to the server or included in HTTP referrers.
  const [token, setToken] = React.useState(() => window.location.hash.slice(1))
  const [done, setDone] = React.useState(false)
  const form = useForm<{ password: string; confirmPassword: string }>({
    defaultValues: { password: "", confirmPassword: "" },
  })
  const { errors, isSubmitting } = form.formState
  React.useEffect(() => {
    window.history.replaceState(
      window.history.state,
      "",
      window.location.pathname + window.location.search
    )
  }, [])
  const submit = form.handleSubmit(async ({ password }) => {
    try {
      const result = await api.POST("/api/auth/password-reset/complete", {
        body: { token, password },
      })
      if (!result.response.ok) {
        form.setError("root", {
          message: t(
            result.response.status === 429
              ? "auth.reset.tooMany"
              : result.response.status === 400
                ? "auth.reset.invalid"
                : "status.error.description"
          ),
        })
        return
      }
      setDone(true)
      setToken("")
      form.reset()
      queryClient.clear()
    } catch {
      form.setError("root", { message: t("status.error.description") })
    }
  })
  const usable = /^[a-zA-Z0-9_-]{43}$/.test(token)
  return (
    <AuthLayout
      title={t(done ? "auth.reset.doneTitle" : "auth.reset.title")}
      description={t(
        done ? "auth.reset.doneDescription" : "auth.reset.description"
      )}
      footer={
        <Link to="/login" className="font-medium text-primary hover:underline">
          {t("auth.reset.backToLogin")}
        </Link>
      }
    >
      {!done &&
        (usable ? (
          <form onSubmit={submit} noValidate>
            <FieldGroup>
              {errors.root && (
                <Alert variant="destructive">
                  <AlertDescription>{errors.root.message}</AlertDescription>
                </Alert>
              )}
              <PasswordField
                label={t("auth.fields.password")}
                description={t("auth.fields.passwordHint")}
                autoComplete="new-password"
                error={errors.password?.message}
                {...form.register("password", {
                  required: t("auth.fields.required"),
                  minLength: {
                    value: 10,
                    message: t("auth.fields.passwordHint"),
                  },
                  maxLength: {
                    value: 128,
                    message: t("auth.fields.passwordMax"),
                  },
                  deps: ["confirmPassword"],
                })}
              />
              <PasswordField
                label={t("auth.fields.confirmPassword")}
                autoComplete="new-password"
                error={errors.confirmPassword?.message}
                {...form.register("confirmPassword", {
                  required: t("auth.fields.required"),
                  validate: (value, values) =>
                    value === values.password ||
                    t("auth.fields.passwordMismatch"),
                })}
              />
              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting && <Spinner />}
                {t("auth.reset.submit")}
              </Button>
            </FieldGroup>
          </form>
        ) : (
          <Alert variant="destructive">
            <AlertDescription>{t("auth.reset.invalid")}</AlertDescription>
          </Alert>
        ))}
      {!done && (
        <Link
          to="/forgot-password"
          className="mt-4 inline-block text-sm text-primary hover:underline"
        >
          {t("auth.reset.requestAnother")}
        </Link>
      )}
    </AuthLayout>
  )
}
