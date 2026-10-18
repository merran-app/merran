import { createFileRoute, Link } from "@tanstack/react-router"
import * as React from "react"
import { useForm } from "react-hook-form"
import { useTranslation } from "react-i18next"
import { AuthLayout } from "@/components/layout/auth-layout"
import { TextField } from "@/components/form/text-field"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { FieldGroup } from "@/components/ui/field"
import { Spinner } from "@/components/ui/spinner"
import { api } from "@/lib/api/client"

export const Route = createFileRoute("/forgot-password")({
  component: ForgotPassword,
})

function ForgotPassword() {
  const { t } = useTranslation()
  const [sent, setSent] = React.useState(false)
  const form = useForm<{ email: string }>({ defaultValues: { email: "" } })
  const { errors, isSubmitting } = form.formState
  const submit = form.handleSubmit(async ({ email }) => {
    try {
      const result = await api.POST("/api/auth/password-reset/request", {
        body: { email: email.trim() },
      })
      if (!result.response.ok) {
        form.setError("root", {
          message: t(
            result.response.status === 429
              ? "auth.reset.tooMany"
              : "status.error.description"
          ),
        })
        return
      }
      setSent(true)
    } catch {
      form.setError("root", { message: t("status.error.description") })
    }
  })
  return (
    <AuthLayout
      title={t(sent ? "auth.reset.checkEmail" : "auth.reset.forgotTitle")}
      description={t(
        sent ? "auth.reset.requested" : "auth.reset.forgotDescription"
      )}
      footer={
        <Link to="/login" className="font-medium text-primary hover:underline">
          {t("auth.reset.backToLogin")}
        </Link>
      }
    >
      {!sent && (
        <form onSubmit={submit} noValidate>
          <FieldGroup>
            {errors.root && (
              <Alert variant="destructive">
                <AlertDescription>{errors.root.message}</AlertDescription>
              </Alert>
            )}
            <TextField
              label={t("auth.fields.email")}
              type="email"
              autoComplete="email"
              autoCapitalize="none"
              maxLength={254}
              error={errors.email?.message}
              {...form.register("email", {
                required: t("auth.fields.required"),
                pattern: {
                  value: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
                  message: t("auth.reset.emailInvalid"),
                },
              })}
            />
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting && <Spinner />}
              {t("auth.reset.sendLink")}
            </Button>
          </FieldGroup>
        </form>
      )}
      <p className="mt-4 text-sm text-muted-foreground">
        {t("auth.reset.operatorHelp")}
      </p>
    </AuthLayout>
  )
}
