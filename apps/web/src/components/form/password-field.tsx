import * as React from "react"
import { useTranslation } from "react-i18next"
import { TextField } from "./text-field"
import { Button } from "@/components/ui/button"

/** A real password input, with an explicit visibility choice. Paste stays enabled. */
export function PasswordField(props: React.ComponentProps<typeof TextField>) {
  const { t } = useTranslation()
  const [visible, setVisible] = React.useState(false)
  const fallback = React.useId()
  const id = props.id ?? fallback
  return (
    <TextField
      {...props}
      id={id}
      type={visible ? "text" : "password"}
      endAction={
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-7 px-2 text-xs"
          aria-label={t(
            visible ? "auth.fields.hidePassword" : "auth.fields.showPassword"
          )}
          aria-controls={id}
          aria-pressed={visible}
          onClick={() => setVisible(!visible)}
        >
          {t(visible ? "auth.fields.hide" : "auth.fields.show")}
        </Button>
      }
    />
  )
}
