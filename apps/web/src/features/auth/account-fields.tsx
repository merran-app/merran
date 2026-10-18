import type {
  FieldErrors,
  FieldValues,
  Path,
  UseFormRegister,
} from "react-hook-form"
import type { ReactNode } from "react"
import { useTranslation } from "react-i18next"

import { TextField } from "@/components/form/text-field"
import { PasswordField } from "@/components/form/password-field"

export type AccountForm = {
  name: string
  email: string
  username: string
  password: string
  confirmPassword: string
}

export const EMPTY_ACCOUNT: AccountForm = {
  name: "",
  email: "",
  username: "",
  password: "",
  confirmPassword: "",
}

/** The fields for a new account, shared by setup and joining. */
export function AccountFields<T extends FieldValues & AccountForm>({
  register,
  errors,
  columns = false,
  children,
  emailReadOnly = false,
}: {
  register: UseFormRegister<T>
  errors: FieldErrors<T>
  columns?: boolean
  children?: ReactNode
  emailReadOnly?: boolean
}) {
  const { t } = useTranslation()
  const field = (name: keyof AccountForm) => ({
    ...register(name as Path<T>, {
      required: t("auth.fields.required"),
      ...(name === "password"
        ? {
            minLength: { value: 10, message: t("auth.fields.passwordHint") },
            maxLength: { value: 128, message: t("auth.fields.passwordMax") },
            deps: ["confirmPassword"] as Path<T>[],
          }
        : {}),
      ...(name === "username"
        ? {
            pattern: {
              value: /^[a-zA-Z0-9_.]{3,30}$/,
              message: t("auth.fields.usernameHint"),
            },
          }
        : {}),
      ...(name === "confirmPassword"
        ? {
            validate: (value, values) =>
              value === values.password || t("auth.fields.passwordMismatch"),
          }
        : {}),
    }),
    error: errors[name]?.message as string | undefined,
  })

  return (
    <div
      className={
        columns ? "grid items-start gap-x-6 gap-y-4 sm:grid-cols-2" : "contents"
      }
    >
      <TextField
        label={t("auth.fields.name")}
        autoComplete="name"
        {...field("name")}
      />
      <TextField
        label={t("auth.fields.username")}
        description={t("auth.fields.usernameHint")}
        autoComplete="username"
        autoCapitalize="none"
        {...field("username")}
      />
      <TextField
        label={t("auth.fields.email")}
        type="email"
        autoComplete="email"
        readOnly={emailReadOnly}
        autoCapitalize="none"
        {...field("email")}
      />
      {children}
      <PasswordField
        label={t("auth.fields.password")}
        description={t("auth.fields.passwordHint")}
        type="password"
        autoComplete="new-password"
        {...field("password")}
      />
      <PasswordField
        label={t("auth.fields.confirmPassword")}
        autoComplete="new-password"
        {...field("confirmPassword")}
      />
    </div>
  )
}
