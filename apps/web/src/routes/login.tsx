import { useQueryClient } from "@tanstack/react-query"
import {
  createFileRoute,
  Link,
  redirect,
  useRouter,
} from "@tanstack/react-router"
import { useForm } from "react-hook-form"
import { useTranslation } from "react-i18next"

import { TextField } from "@/components/form/text-field"
import { AuthLayout } from "@/components/layout/auth-layout"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { FieldGroup } from "@/components/ui/field"
import { Spinner } from "@/components/ui/spinner"
import { meQuery } from "@/features/auth/queries"
import { useCapability } from "@/features/capabilities/queries"
import { ApiError } from "@/lib/api/client"
import { authClient, safeReturnTo } from "@/features/auth/client"

export const Route = createFileRoute("/login")({
  validateSearch: (search: Record<string, unknown>): { redirect?: string } =>
    typeof search.redirect === "string" ? { redirect: search.redirect } : {},
  beforeLoad: async ({ context, location }) => {
    const me = await context.queryClient.ensureQueryData(meQuery)
    if (me) {
      const destination = new URLSearchParams(location.searchStr).has("sig")
        ? "/authorize/household" + location.searchStr
        : "/"
      if (me.requiresTwoFactor)
        throw redirect({ to: "/verify", search: { redirect: destination } })
      throw redirect({ href: destination })
    }
  },
  component: LoginPage,
})

/** Only ever go back to a page on this site. */
function safeRedirect(target: string | undefined) {
  return safeReturnTo(target)
}

type Form = { identifier: string; password: string }

function LoginPage() {
  const { t } = useTranslation()
  const passkeys = useCapability("auth.passkeys")
  const passwords = useCapability("auth.passwords")
  const sso = useCapability("auth.sso")
  const emailRecovery = useCapability("email.passwordReset")
  const { redirect: back } = Route.useSearch()
  const queryClient = useQueryClient()
  const router = useRouter()
  const form = useForm<Form>({
    defaultValues: { identifier: "", password: "" },
  })
  const { errors, isSubmitting } = form.formState

  const onSubmit = form.handleSubmit(async ({ identifier, password }) => {
    try {
      const value = identifier.trim()
      const result = value.includes("@")
        ? await authClient.signIn.email({ email: value, password })
        : await authClient.signIn.username({ username: value, password })
      if (result.error) {
        form.setError("root", { message: t("auth.login.wrong") })
        return
      }
      if ((result.data as { twoFactorRedirect?: boolean })?.twoFactorRedirect) {
        queryClient.clear()
        const query = new URLSearchParams(window.location.search)
        const destination = query.has("sig")
          ? "/authorize/household?" + query
          : safeRedirect(back)
        router.history.push(
          "/verify?redirect=" + encodeURIComponent(destination)
        )
        return
      }
      queryClient.removeQueries()
      const next = result.data as { url?: string } | null
      if (next?.url && new URLSearchParams(window.location.search).has("sig")) {
        const target = new URL(next.url, window.location.origin)
        if (target.origin === window.location.origin) {
          window.location.assign(target.href)
          return
        }
      }
      router.history.push(safeRedirect(back))
    } catch (error) {
      const message =
        error instanceof ApiError && error.status === 429
          ? t("auth.login.tooMany")
          : error instanceof ApiError && error.status < 500
            ? t("auth.login.wrong")
            : t("status.error.description")
      form.setError("root", { message })
    }
  })

  async function signInWithPasskey() {
    const result = await authClient.signIn.passkey()
    if (result.error)
      form.setError("root", { message: t("auth.security.failed") })
    else {
      queryClient.clear()
      const query = new URLSearchParams(window.location.search)
      window.location.assign(
        query.has("sig") ? "/authorize/household?" + query : safeRedirect(back)
      )
    }
  }

  async function signInWithSso() {
    const result = await authClient.signIn.social({
      provider: "oidc",
      callbackURL: safeReturnTo(back),
    })
    if (result.error)
      form.setError("root", { message: t("auth.security.failed") })
  }

  return (
    <AuthLayout
      title={t("auth.login.title")}
      description={t("auth.login.description")}
    >
      {passkeys && (
        <Button
          className="mb-4 w-full"
          variant="outline"
          onClick={signInWithPasskey}
        >
          {t("auth.security.signInPasskey")}
        </Button>
      )}
      {sso && (
        <Button
          className="mb-4 w-full"
          variant="outline"
          onClick={signInWithSso}
        >
          {t("auth.security.sso")}
        </Button>
      )}
      {!passwords && errors.root && (
        <Alert variant="destructive">
          <AlertDescription>{errors.root.message}</AlertDescription>
        </Alert>
      )}
      {passwords && (
        <form onSubmit={onSubmit} noValidate>
          <FieldGroup>
            {errors.root && (
              <Alert variant="destructive">
                <AlertDescription>{errors.root.message}</AlertDescription>
              </Alert>
            )}
            <TextField
              label={t("auth.fields.usernameOrEmail")}
              autoComplete="username"
              autoCapitalize="none"
              required
              {...form.register("identifier", { required: true })}
            />
            <TextField
              label={t("auth.fields.password")}
              type="password"
              autoComplete="current-password"
              required
              {...form.register("password", { required: true })}
            />
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting && <Spinner />}
              {t("auth.login.submit")}
            </Button>
            {emailRecovery && (
              <Link
                to="/forgot-password"
                className="text-sm text-primary hover:underline"
              >
                {t("auth.login.recoveryTitle")}
              </Link>
            )}
            {!emailRecovery && (
              <details className="text-sm">
                <summary className="cursor-pointer">
                  {t("auth.login.recoveryTitle")}
                </summary>
                <p className="pt-2 text-muted-foreground">
                  {t("auth.login.recovery")}
                </p>
              </details>
            )}
          </FieldGroup>
        </form>
      )}
    </AuthLayout>
  )
}
